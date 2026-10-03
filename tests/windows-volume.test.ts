import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, link, symlink, rm, mkdtemp } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { ScannerClient } from "../electron/rpc";
import type { Summary, FilePage } from "../src/shared/types";
const root = process.env.DISKATLAS_NTFS_TEST_ROOT;
test(
  "real NTFS volume: MFT baseline, large flat/deep Unicode trees, fallback and cached refresh",
  { skip: process.platform !== "win32" || !root, timeout: 300000 },
  async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), "atlas-volume-db-"));
    const fixture = path.join(root!, "fixture");
    await mkdir(fixture);
    const client = () =>
      new ScannerClient(
        () => {},
        () => {},
        path.resolve("dist-electron/worker.cjs"),
        path.join(base, "index.sqlite"),
        path.resolve("native/bin/diskatlas-ntfs.exe"),
      );
    let c = client();
    const options = {
      ignoredFolders: [],
      ignoredExtensions: [],
      maxEntries: 1,
    };
    try {
      const began = Date.now();
      for (let batch = 0; batch < 500; batch++)
        await Promise.all(
          Array.from({ length: 100 }, (_, i) =>
            writeFile(path.join(fixture, `file-${batch * 100 + i}.txt`), "abc"),
          ),
        );
      let deep = path.join(fixture, "📁-Ä");
      for (let i = 0; i < 35; i++) {
        deep = path.join(deep, `long-directory-${i}`);
        await mkdir(deep, { recursive: true });
      }
      await writeFile(path.join(deep, "終わり.txt"), "deep");
      const scanStarted = Date.now();
      const native = await c.call<Summary>("scan", root, options);
      assert.equal(native.backend, "ntfs", native.accelerationFallback);
      assert(native.files >= 50001);
      assert(native.volumeGuid);
      assert(native.journalId);
      const rows = await c.call<FilePage>("files", {
        search: "終わり",
        limit: 100,
      });
      assert.equal(rows.total, 1);
      console.log(
        JSON.stringify({
          realWindowsFiles: 50001,
          fixtureCreationMs: scanStarted - began,
          nativeScanMs: Date.now() - scanStarted,
          status: native.status,
          skipped: native.skipped,
        }),
      );
      await c.close();
      c = client();
      assert.equal((await c.call<Summary>("summary")).cached, true);
      await link(
        path.join(fixture, "file-0.txt"),
        path.join(fixture, "hard-link.txt"),
      );
      const fallback = await c.call<Summary>("scan", root, options);
      assert.equal(fallback.backend, "filesystem");
      assert.match(fallback.accelerationFallback ?? "", /Hard-link/);
      assert(fallback.files >= 50002);
      await symlink(fixture, path.join(fixture, "loop"), "junction");
      await symlink(
        path.join(fixture, "file-0.txt"),
        path.join(fixture, "file-link.txt"),
        "file",
      );
      const safe = await c.call<Summary>("scan", fixture, options);
      assert.equal(safe.files, 50002);
      assert(safe.skipped >= 2);
      const protectedDir = path.join(fixture, "denied");
      await mkdir(protectedDir);
      await writeFile(path.join(protectedDir, "secret.txt"), "x");
      const user = execFileSync("whoami", [], { encoding: "utf8" }).trim();
      try {
        execFileSync("icacls", [protectedDir, "/deny", `${user}:(OI)(CI)(RX)`]);
        const partial = await c.call<Summary>("scan", fixture, options);
        assert.equal(partial.status, "partial");
        assert(partial.skipped >= 3);
      } finally {
        execFileSync("icacls", [protectedDir, "/remove:d", user]);
      }
      const scanning = c.call("scan", fixture, options);
      await c.call("cancel");
      await scanning;
      assert.equal((await c.call<Summary>("summary")).status, "cancelled");
      await c.close();
      c = client();
      assert((await c.call<Summary>("summary")).cached);
      await c.call("clear");
      assert.equal(await c.call("summary"), null);
    } finally {
      await c.close();
      await rm(base, { recursive: true, force: true });
    }
  },
);
