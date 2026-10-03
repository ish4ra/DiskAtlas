import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { IndexStore } from "../electron/index-store";
import { scanIndexed } from "../electron/indexed-scanner";
test("disk index persists scans, aggregates descendants and bounds queries", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "atlas-index-"));
  try {
    const root = path.join(dir, "fixture");
    await mkdir(root);
    await mkdir(path.join(root, "child"));
    await writeFile(path.join(root, "child", "a.txt"), "hello");
    const file = path.join(dir, "index.sqlite");
    let db = new IndexStore(file);
    const id = db.begin(root);
    const summary = await scanIndexed(
      db,
      id,
      root,
      { ignoredFolders: [], ignoredExtensions: [], maxEntries: 1 },
      () => false,
      () => {},
    );
    assert.equal(summary.files, 1);
    assert.equal(summary.bytes, 5);
    assert.equal(db.entry(id, 0)!.size, 5);
    assert.equal(summary.status, "complete");
    db.finish(id, summary);
    db.close();
    db = new IndexStore(file);
    assert.equal(db.latest()!.summary.cached, true);
    assert.equal(db.files(id, { extension: ".txt" }).total, 1);
    assert.equal(db.folder(id, 0).children[0].fileCount, 1);
    assert.equal([...db.entries(id)].length, 3);
    db.clear();
    assert.equal(db.latest(), null);
    db.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("corrupt cache is quarantined and an interrupted scan is not published", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "atlas-corrupt-"));
  try {
    const file = path.join(dir, "index.sqlite");
    await writeFile(file, "not sqlite");
    let db = new IndexStore(file);
    db.begin("/missing");
    db.close();
    db = new IndexStore(file);
    assert.equal(db.latest(), null);
    assert.equal(
      db.db.prepare("SELECT state FROM scans").get()!.state,
      "interrupted",
    );
    db.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("indexed production scanner crosses the old ceiling with bounded pages", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "atlas-large-"));
  const { lstat } = await import("node:fs/promises");
  try {
    const fixture = path.join(dir, "one");
    await writeFile(fixture, "x");
    const fileStat = await lstat(fixture);
    const rootStat = await lstat(dir);
    const db = new IndexStore(path.join(dir, "index.sqlite"));
    const id = db.begin(dir);
    const io = {
      stat: async (p: string) => (p === dir ? rootStat : fileStat),
      open: async () =>
        ({
          async *[Symbol.asyncIterator]() {
            for (let i = 0; i < 500005; i++) yield { name: `file-${i}.txt` };
          },
        }) as unknown as import("node:fs").Dir,
    };
    const s = await scanIndexed(
      db,
      id,
      dir,
      { ignoredFolders: [], ignoredExtensions: [], maxEntries: 500000 },
      () => false,
      () => {},
      io,
    );
    assert.equal(s.files, 500005);
    assert.equal(s.status, "complete");
    assert.equal(db.files(id, { limit: 1000 }).rows.length, 1000);
    assert.equal(db.entry(id, 0)!.size, 500005);
    db.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("cancellation and inaccessible directories retain accurate partial totals", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "atlas-partial-"));
  try {
    const db = new IndexStore(path.join(dir, "index.sqlite"));
    const id = db.begin(dir);
    const s = await scanIndexed(
      db,
      id,
      dir,
      { ignoredFolders: [], ignoredExtensions: [], maxEntries: 1 },
      () => true,
      () => {},
    );
    assert.equal(s.status, "cancelled");
    assert.equal(s.bytes, 0);
    db.finish(id, s);
    const id2 = db.begin("/missing");
    await assert.rejects(
      scanIndexed(
        db,
        id2,
        "/missing",
        { ignoredFolders: [], ignoredExtensions: [], maxEntries: 1 },
        () => false,
        () => {},
      ),
    );
    db.fail(id2);
    assert.equal(db.latest()!.id, id);
    const { lstat } = await import("node:fs/promises");
    const id3 = db.begin(dir);
    const partial = await scanIndexed(
      db,
      id3,
      dir,
      { ignoredFolders: [], ignoredExtensions: [], maxEntries: 1 },
      () => false,
      () => {},
      {
        stat: lstat,
        open: async () => {
          throw Object.assign(new Error("Denied"), { code: "EACCES" });
        },
      },
    );
    assert.equal(partial.status, "partial");
    assert.equal(partial.skipped, 1);
    db.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("future schemas are preserved instead of overwritten", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "atlas-schema-"));
  try {
    const filename = path.join(dir, "index.sqlite");
    const db = new IndexStore(filename);
    db.db.exec("PRAGMA user_version=99");
    db.close();
    assert.throws(() => new IndexStore(filename), /newer DiskAtlas/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Unicode substring search and astral-character scoped paths match persisted entries", () => {
  const db = new IndexStore(":memory:");
  const root = path.join(path.sep, "📁");
  const scan = db.begin(root);
  db.add(scan, {
    id: 0,
    parent: null,
    name: "📁",
    path: root,
    extension: "",
    category: "Other",
    size: 0,
    modified: 0,
    directory: true,
    children: [],
  });
  db.add(scan, {
    id: 1,
    parent: 0,
    name: "Ä.txt",
    path: path.join(root, "Ä.txt"),
    extension: ".txt",
    category: "Documents",
    size: 1,
    modified: 0,
    directory: false,
    children: [],
  });
  db.flush();
  assert.equal(db.files(scan, { scope: 0, search: "ä" }).total, 1);
  db.close();
});

test("retention preserves bounded history, active snapshot and last complete root snapshot", () => {
  const db = new IndexStore(":memory:");
  const summary = {
    root: "/a",
    status: "complete",
  } as import("../src/shared/types").Summary;
  const first = db.begin("/a");
  db.finish(first, summary);
  for (let i = 0; i < 5; i++) {
    const id = db.begin("/a");
    db.finish(id, { ...summary, status: "cancelled" });
  }
  const other = db.begin("/b");
  db.finish(other, { ...summary, root: "/b" });
  db.retain(other);
  assert.equal(db.snapshots().length, 2);
  assert.equal(db.db.prepare("SELECT count(*) n FROM scans").get()!.n, 4);
  assert.equal(db.restore(first).status, "complete");
  assert.equal(db.restore(other).root, "/b");
  db.close();
});
