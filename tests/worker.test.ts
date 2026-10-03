import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { ScannerClient } from "../electron/rpc";
import type { Summary } from "../src/shared/types";
test("terminated workers reject subsequent calls instead of hanging", async () => {
  const c = new ScannerClient(
    () => {},
    () => {},
    path.resolve("dist-electron/worker.cjs"),
  );
  await c.close();
  await assert.rejects(
    Promise.race([
      c.call("summary"),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("request hung")), 200),
      ),
    ]),
    /Scanner stopped/,
  );
});
test("export holds its snapshot while a new scan starts", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "diskatlas-worker-"));
  const c = new ScannerClient(
    () => {},
    () => {},
    path.resolve("dist-electron/worker.cjs"),
  );
  try {
    for (let i = 0; i < 1500; i++)
      await writeFile(path.join(root, `${i}.txt`), "abc");
    await mkdir(path.join(root, "empty"));
    await c.call("scan", root, {
      ignoredFolders: [],
      ignoredExtensions: [],
      maxEntries: 500000,
    });
    const exported = path.join(root, "scan.json");
    const saving = c.call("export", exported, "json", {});
    const rescan = c.call("scan", path.join(root, "empty"), {
      ignoredFolders: [],
      ignoredExtensions: [],
      maxEntries: 500000,
    });
    await Promise.all([saving, rescan]);
    const data = JSON.parse(await readFile(exported, "utf8"));
    assert.equal(data.summary.files, 1500);
    assert.equal(data.entries.length, 1502);
    const summary = await c.call<Summary>("summary");
    assert.equal(summary.files, 0);
  } finally {
    await c.close();
    await rm(root, { recursive: true, force: true });
  }
});
test("invalid export destinations reject and leave the worker usable", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "diskatlas-export-"));
  const c = new ScannerClient(
    () => {},
    () => {},
    path.resolve("dist-electron/worker.cjs"),
  );
  try {
    await writeFile(path.join(root, "a.txt"), "a");
    await c.call("scan", root, {
      ignoredFolders: [],
      ignoredExtensions: [],
      maxEntries: 100,
    });
    await assert.rejects(
      c.call("export", path.join(root, "missing", "scan.json"), "json", {}),
    );
    assert.equal((await c.call<Summary>("summary")).files, 1);
  } finally {
    await c.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("cache clearing rejects during scanning and restart recovers the last published generation", async () => {
  const base = await mkdtemp(path.join(tmpdir(), "atlas-recovery-"));
  const root = path.join(base, "root");
  await mkdir(root);
  const index = path.join(base, "index.sqlite");
  let c = new ScannerClient(
    () => {},
    () => {},
    path.resolve("dist-electron/worker.cjs"),
    index,
  );
  try {
    await c.call("scan", root, {
      ignoredFolders: [],
      ignoredExtensions: [],
      maxEntries: 1,
    });
    for (let i = 0; i < 6000; i++)
      await writeFile(path.join(root, `${i}.txt`), "x");
    const scanning = c.call("scan", root, {
      ignoredFolders: [],
      ignoredExtensions: [],
      maxEntries: 1,
    });
    await assert.rejects(c.call("clear"), /Wait/);
    const rejected = assert.rejects(scanning);
    await c.close();
    await rejected;
    c = new ScannerClient(
      () => {},
      () => {},
      path.resolve("dist-electron/worker.cjs"),
      index,
    );
    const summary = await c.call<Summary>("summary");
    assert.equal(summary.cached, true);
    assert.equal(summary.files, 0);
  } finally {
    await c.close();
    await rm(base, { recursive: true, force: true });
  }
});
