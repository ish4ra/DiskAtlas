import { IndexStore } from "../electron/index-store";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const temp = mkdtempSync(path.join(tmpdir(), "atlas-benchmark-"));
const file = path.join(temp, "index.sqlite");
const db = new IndexStore(file);
const id = db.begin("/fixture");
const start = performance.now();
db.add(id, {
  id: 0,
  parent: null,
  name: "fixture",
  path: "/fixture",
  extension: "",
  category: "Other",
  directory: true,
  size: 0,
  modified: 0,
  children: [],
});
try {
  for (let n = 1; n <= 3_000_000; n++) {
    db.add(id, {
      id: n,
      parent: 0,
      name: `file-${n}.bin`,
      path: `/fixture/file-${n}.bin`,
      extension: ".bin",
      category: "Other",
      directory: false,
      size: n,
      modified: n,
      children: [],
    });
    if ([100_000, 500_000, 1_000_000, 3_000_000].includes(n)) {
      db.flush();
      const began = performance.now();
      const page = db.files(id, { limit: 100 });
      const queryMs = performance.now() - began;
      assert.equal(page.total, n);
      assert.equal(page.rows.length, 100);
      assert.equal(page.rows[0].size, n);
      assert.equal(db.folder(id, 0).children.length, 200);
      console.log(
        JSON.stringify({
          entries: n,
          elapsedSeconds: (performance.now() - start) / 1000,
          queryMs,
          rssMiB: process.memoryUsage().rss / 1048576,
          heapMiB: process.memoryUsage().heapUsed / 1048576,
          dbMiB: statSync(file).size / 1048576,
        }),
      );
    }
  }
  db.aggregate(id);
  assert.equal(db.entry(id, 0)!.size, (3_000_000 * 3_000_001) / 2);
  console.log(
    "Three-million-entry aggregate and bounded query assertions passed.",
  );
} finally {
  db.close();
  rmSync(temp, { recursive: true, force: true });
}
