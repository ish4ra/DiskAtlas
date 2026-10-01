import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  symlink,
  rm,
  lstat,
  opendir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { scan } from "../electron/scanner";
import { queryFiles, summarize, csvCell } from "../electron/analysis";

test("real traversal aggregates sizes, ignores extensions and does not follow loops", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "diskatlas-"));
  try {
    await mkdir(path.join(root, "nested"));
    await writeFile(path.join(root, "a.mp4"), Buffer.alloc(120));
    await writeFile(path.join(root, "nested", "b.ts"), Buffer.alloc(30));
    await writeFile(path.join(root, "skip.tmp"), "ignored");
    try {
      await symlink(root, path.join(root, "nested", "loop"), "junction");
    } catch {
      /* Windows may restrict links */
    }
    const updates: number[] = [];
    const result = await scan(
      root,
      { ignoredFolders: [], ignoredExtensions: [".tmp"], maxEntries: 500000 },
      () => false,
      (p) => updates.push(p.files),
    );
    assert.equal(result.nodes[0].size, 150);
    assert.equal(result.files, 2);
    assert.equal(result.folders, 2);
    assert.ok(updates.length > 0);
    assert.equal(
      queryFiles(result, { search: ".ts", limit: 100 }).rows[0].name,
      "b.ts",
    );
    assert.equal(
      summarize(result).types.find((t) => t.category === "Video")?.size,
      120,
    );
    assert.equal(
      queryFiles(result, { sort: "size", direction: "desc", limit: 100 })
        .rows[0].name,
      "a.mp4",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("cancellation and entry cap produce clearly partial results", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "diskatlas-"));
  try {
    for (let i = 0; i < 10; i++)
      await writeFile(path.join(root, `${i}.txt`), "123");
    const cancelled = await scan(
      root,
      { ignoredFolders: [], ignoredExtensions: [], maxEntries: 100 },
      () => true,
      () => {},
    );
    assert.equal(cancelled.status, "cancelled");
    const limited = await scan(
      root,
      { ignoredFolders: [], ignoredExtensions: [], maxEntries: 3 },
      () => false,
      () => {},
    );
    assert.equal(limited.status, "limited");
    assert.equal(limited.nodes.length, 3);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("unavailable root rejects cleanly", async () => {
  await assert.rejects(
    scan(
      path.join(tmpdir(), "not-here-diskatlas-xyz"),
      { ignoredFolders: [], ignoredExtensions: [], maxEntries: 100 },
      () => false,
      () => {},
    ),
  );
});
test("CSV escapes quotes and spreadsheet formulas", () => {
  assert.equal(csvCell("=1+1"), '"\'=1+1"');
  assert.equal(csvCell('a"b'), '"a""b"');
});
test("folder exclusions do not exclude regular files with the same name", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "diskatlas-"));
  try {
    await writeFile(path.join(root, "cache"), "123");
    await mkdir(path.join(root, "nested"));
    await mkdir(path.join(root, "nested", "cache"));
    await writeFile(path.join(root, "nested", "cache", "hidden"), "123456");
    const r = await scan(
      root,
      { ignoredFolders: ["cache"], ignoredExtensions: [], maxEntries: 100 },
      () => false,
      () => {},
    );
    assert.equal(r.files, 1);
    assert.equal(r.bytes, 3);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("no-extension filter differs from all extensions and summaries have bounded payloads", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "diskatlas-"));
  try {
    await writeFile(path.join(root, "README"), "123");
    await writeFile(path.join(root, "other.xyz"), "123");
    await mkdir(path.join(root, "folder"));
    await writeFile(path.join(root, "folder", "child.txt"), "123");
    const r = await scan(
      root,
      { ignoredFolders: [], ignoredExtensions: [], maxEntries: 100 },
      () => false,
      () => {},
    );
    assert.deepEqual(
      queryFiles(r, { extension: "" }).rows.map((n) => n.name),
      ["README"],
    );
    assert.equal(queryFiles(r, {}).total, 3);
    assert.deepEqual(summarize(r).largestFolder?.children, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("mid-scan cancellation retains consistent nested totals", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "diskatlas-"));
  try {
    await mkdir(path.join(root, "child"));
    for (let i = 0; i < 20; i++)
      await writeFile(path.join(root, "child", `${i}.txt`), "abc");
    let checks = 0;
    const r = await scan(
      root,
      { ignoredFolders: [], ignoredExtensions: [], maxEntries: 100 },
      () => ++checks > 10,
      () => {},
    );
    assert.equal(r.status, "cancelled");
    assert.ok(r.files > 0 && r.files < 20);
    assert.equal(r.nodes[0].size, r.files * 3);
    assert.equal(r.bytes, r.files * 3);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("extension summaries stay bounded while preserving complete category totals", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "diskatlas-types-"));
  try {
    for (let i = 0; i < 1005; i++)
      await writeFile(path.join(root, `file.ext${i}`), "a");
    const r = await scan(
      root,
      { ignoredFolders: [], ignoredExtensions: [], maxEntries: 500000 },
      () => false,
      () => {},
    );
    const summary = summarize(r);
    assert.equal(summary.types.length, 1000);
    assert.equal(summary.extensionCount, 1005);
    assert.equal(
      summary.categoryStats.reduce((s, t) => s + t.count, 0),
      1005,
    );
    assert.equal(
      summary.categoryStats.reduce((s, t) => s + t.size, 0),
      1005,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("permission failures and files disappearing are skipped without losing readable files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "diskatlas-errors-"));
  try {
    await mkdir(path.join(root, "denied"));
    await writeFile(path.join(root, "gone.txt"), "gone");
    await writeFile(path.join(root, "readable.txt"), "readable");
    const io = {
      stat: async (p: string) => {
        if (p.endsWith("gone.txt")) await rm(p, { force: true });
        return lstat(p);
      },
      open: async (p: string) => {
        if (p.endsWith("denied"))
          throw Object.assign(new Error("Access denied"), { code: "EACCES" });
        return opendir(p);
      },
    };
    const r = await scan(
      root,
      { ignoredFolders: [], ignoredExtensions: [], maxEntries: 100 },
      () => false,
      () => {},
      io,
    );
    assert.equal(r.files, 1);
    assert.equal(r.bytes, 8);
    assert.equal(r.skipped, 2);
    assert.equal(r.warnings.length, 2);
    assert.equal(r.status, "complete");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
