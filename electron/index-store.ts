import {
  DatabaseSync,
  type SQLInputValue,
  type StatementSync,
} from "node:sqlite";
import { mkdirSync, renameSync, existsSync } from "node:fs";
import path from "node:path";
import type {
  Entry,
  FileQuery,
  FolderPage,
  Summary,
} from "../src/shared/types";

/** Worker-owned disk storage. No query materializes the complete entry set. */
export class IndexStore {
  readonly db: DatabaseSync;
  private insert: StatementSync;
  private pendingWrites = 0;
  constructor(readonly filename: string) {
    if (filename !== ":memory:")
      mkdirSync(path.dirname(filename), { recursive: true });
    let db = new DatabaseSync(filename);
    try {
      db.prepare("PRAGMA schema_version").get();
    } catch (error) {
      db.close();
      if (filename === ":memory:") throw error;
      const quarantine = `${filename}.corrupt-${Date.now()}`;
      renameSync(filename, quarantine);
      for (const suffix of ["-wal", "-shm"])
        if (existsSync(filename + suffix))
          renameSync(filename + suffix, quarantine + suffix);
      db = new DatabaseSync(filename);
    }
    this.db = db;
    db.function("unicode_lower", { deterministic: true }, (value) =>
      String(value).toLowerCase(),
    );
    const version = Number(
      db.prepare("PRAGMA user_version").get()!.user_version,
    );
    if (version > 1) {
      db.close();
      throw new Error("This index was created by a newer DiskAtlas version.");
    }
    db.exec(`PRAGMA journal_mode=WAL; PRAGMA cache_size=-16384; PRAGMA temp_store=FILE;
      CREATE TABLE IF NOT EXISTS scans(id INTEGER PRIMARY KEY, root TEXT NOT NULL, summary TEXT, state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS entries(scan INTEGER NOT NULL,id INTEGER NOT NULL,parent INTEGER,name TEXT,path TEXT,extension TEXT,category TEXT,size REAL,modified REAL,directory INTEGER,files INTEGER DEFAULT 0,folders INTEGER DEFAULT 0,visited INTEGER DEFAULT 0,PRIMARY KEY(scan,id));
      CREATE TABLE IF NOT EXISTS seen_directories(scan INTEGER,identity TEXT,PRIMARY KEY(scan,identity));
      CREATE INDEX IF NOT EXISTS entry_parent ON entries(scan,parent,size DESC);
      CREATE INDEX IF NOT EXISTS entry_size ON entries(scan,directory,size DESC);
      CREATE INDEX IF NOT EXISTS entry_extension ON entries(scan,directory,extension);
      CREATE INDEX IF NOT EXISTS entry_pending ON entries(scan,directory,visited,id);
      PRAGMA user_version=1;
      UPDATE scans SET state='interrupted' WHERE state='scanning';`);
    this.insert = db.prepare(
      "INSERT INTO entries(scan,id,parent,name,path,extension,category,size,modified,directory,files) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    );
  }
  flush() {
    if (this.pendingWrites) {
      this.db.exec("COMMIT");
      this.pendingWrites = 0;
    }
  }
  seen(scan: number, identity: string): boolean {
    return (
      this.db
        .prepare("INSERT OR IGNORE INTO seen_directories VALUES(?,?)")
        .run(scan, identity).changes === 0
    );
  }
  snapshots() {
    return this.db
      .prepare(
        "SELECT id,root,summary FROM scans WHERE summary IS NOT NULL AND id IN (SELECT max(id) FROM scans WHERE summary IS NOT NULL GROUP BY root) ORDER BY id DESC LIMIT 100",
      )
      .all()
      .map((row) => ({
        id: Number(row.id),
        root: String(row.root),
        scannedAt: (JSON.parse(String(row.summary)) as Summary).scannedAt,
      }));
  }
  restore(id: number): Summary {
    const row = this.db
      .prepare("SELECT summary FROM scans WHERE id=? AND summary IS NOT NULL")
      .get(id);
    if (!row) throw new Error("Cached scan unavailable.");
    return { ...JSON.parse(String(row.summary)), cached: true };
  }
  resetEntries(scan: number) {
    this.flush();
    this.db.prepare("DELETE FROM entries WHERE scan=?").run(scan);
    this.db.prepare("DELETE FROM seen_directories WHERE scan=?").run(scan);
  }
  retain(active: number) {
    this.flush();
    const rootKey =
      process.platform === "win32" ? "unicode_lower(root)" : "root";
    this.db.exec("BEGIN");
    try {
      this.db
        .exec(`CREATE TEMP TABLE IF NOT EXISTS retained(id INTEGER PRIMARY KEY); DELETE FROM retained;
        INSERT OR IGNORE INTO retained SELECT id FROM (SELECT id,row_number() OVER(PARTITION BY ${rootKey} ORDER BY id DESC) rank FROM scans WHERE summary IS NOT NULL) WHERE rank<=2;
        INSERT OR IGNORE INTO retained SELECT max(id) FROM scans WHERE state='complete' GROUP BY ${rootKey};`);
      this.db.prepare("INSERT OR IGNORE INTO retained VALUES(?)").run(active);
      this.db.exec(
        "DELETE FROM entries WHERE scan NOT IN (SELECT id FROM retained); DELETE FROM seen_directories WHERE scan NOT IN (SELECT id FROM retained); DELETE FROM scans WHERE id NOT IN (SELECT id FROM retained); COMMIT;",
      );
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  }
  begin(root: string): number {
    return Number(
      this.db
        .prepare("INSERT INTO scans(root,state) VALUES(?,'scanning')")
        .run(root).lastInsertRowid,
    );
  }
  add(scan: number, n: Entry) {
    if (!this.pendingWrites) this.db.exec("BEGIN");
    try {
      this.insert.run(
        scan,
        n.id,
        n.parent,
        n.name,
        n.path,
        n.extension,
        n.category,
        n.size,
        n.modified,
        Number(n.directory),
        Number(!n.directory),
      );
    } catch (e) {
      this.db.exec("ROLLBACK");
      this.pendingWrites = 0;
      throw e;
    }
    if (++this.pendingWrites >= 512) this.flush();
  }
  entry(scan: number, id: number): Entry | undefined {
    return this.decode(
      this.db
        .prepare("SELECT * FROM entries WHERE scan=? AND id=?")
        .get(scan, id),
    );
  }
  private decode(row: Record<string, unknown> | undefined): Entry | undefined {
    if (!row) return undefined;
    return {
      id: Number(row.id),
      parent: row.parent === null ? null : Number(row.parent),
      name: String(row.name),
      path: String(row.path),
      extension: String(row.extension),
      category: row.category as Entry["category"],
      size: Number(row.size),
      modified: Number(row.modified),
      directory: !!row.directory,
      children: [],
      fileCount: Number(row.files),
      folderCount: Number(row.folders),
    };
  }
  pending(scan: number): Entry | undefined {
    return this.decode(
      this.db
        .prepare(
          "SELECT * FROM entries WHERE scan=? AND directory=1 AND visited=0 ORDER BY id DESC LIMIT 1",
        )
        .get(scan),
    );
  }
  visited(scan: number, id: number) {
    this.db
      .prepare("UPDATE entries SET visited=1 WHERE scan=? AND id=?")
      .run(scan, id);
  }
  aggregate(scan: number) {
    this.flush();
    // Parent IDs always precede child IDs, so reverse directory order is a topological order.
    let before = Number.MAX_SAFE_INTEGER;
    for (;;) {
      const rows = this.db
        .prepare(
          "SELECT id FROM entries WHERE scan=? AND directory=1 AND id<? ORDER BY id DESC LIMIT 512",
        )
        .all(scan, before);
      if (!rows.length) break;
      this.db.exec("BEGIN");
      try {
        for (const row of rows) {
          const id = Number(row.id);
          this.db
            .prepare(
              `UPDATE entries SET size=(SELECT coalesce(sum(size),0) FROM entries WHERE scan=? AND parent=?),files=(SELECT coalesce(sum(files),0) FROM entries WHERE scan=? AND parent=?),folders=(SELECT coalesce(sum(folders+directory),0) FROM entries WHERE scan=? AND parent=?) WHERE scan=? AND id=?`,
            )
            .run(scan, id, scan, id, scan, id, scan, id);
          before = id;
        }
        this.db.exec("COMMIT");
      } catch (e) {
        this.db.exec("ROLLBACK");
        throw e;
      }
    }
  }
  finish(scan: number, summary: Summary) {
    this.db
      .prepare("UPDATE scans SET summary=?,state=? WHERE id=?")
      .run(JSON.stringify(summary), summary.status, scan);
  }
  fail(scan: number) {
    this.flush();
    this.db.prepare("UPDATE scans SET state='failed' WHERE id=?").run(scan);
  }
  latest(): { id: number; summary: Summary } | null {
    const row = this.db
      .prepare(
        "SELECT id,summary FROM scans WHERE summary IS NOT NULL ORDER BY id DESC LIMIT 1",
      )
      .get();
    if (!row) return null;
    return {
      id: Number(row.id),
      summary: { ...JSON.parse(String(row.summary)), cached: true },
    };
  }
  types(scan: number) {
    return this.db
      .prepare(
        "SELECT extension,category,sum(size) size,count(*) count FROM entries WHERE scan=? AND directory=0 GROUP BY extension ORDER BY size DESC LIMIT 1000",
      )
      .all(scan);
  }
  categories(scan: number) {
    return this.db
      .prepare(
        "SELECT '' extension,category,sum(size) size,count(*) count FROM entries WHERE scan=? AND directory=0 GROUP BY category ORDER BY size DESC",
      )
      .all(scan);
  }
  extensionCount(scan: number) {
    return Number(
      this.db
        .prepare(
          "SELECT count(DISTINCT extension) n FROM entries WHERE scan=? AND directory=0",
        )
        .get(scan)!.n,
    );
  }
  largest(scan: number, directory: boolean) {
    return (
      this.decode(
        this.db
          .prepare(
            "SELECT * FROM entries WHERE scan=? AND directory=? AND id<>0 ORDER BY size DESC LIMIT 1",
          )
          .get(scan, Number(directory)),
      ) ?? null
    );
  }
  private filter(scan: number, q: FileQuery) {
    const conditions = ["scan=?", "directory=0"];
    const args: SQLInputValue[] = [scan];
    for (const key of ["category", "extension"] as const)
      if (q[key] !== undefined) {
        conditions.push(`${key}=?`);
        args.push(q[key]!);
      }
    if (q.min !== undefined) {
      conditions.push("size>=?");
      args.push(q.min);
    }
    if (q.max !== undefined) {
      conditions.push("size<=?");
      args.push(q.max);
    }
    if (q.search) {
      conditions.push("instr(unicode_lower(path),?)>0");
      args.push(q.search.toLowerCase());
    }
    if (q.scope !== undefined) {
      const scope = this.entry(scan, q.scope);
      if (!scope?.directory)
        throw new Error("Folder is not available in this scan.");
      const prefix = scope.path.endsWith(path.sep)
        ? scope.path
        : scope.path + path.sep;
      conditions.push("instr(path,?)=1");
      args.push(prefix);
    }
    const sort = ["name", "path", "extension", "size", "modified"].includes(
      q.sort ?? "",
    )
      ? q.sort
      : "size";
    return {
      where: conditions.join(" AND "),
      args,
      order: `${sort} ${q.direction === "asc" ? "ASC" : "DESC"},id ASC`,
    };
  }
  files(scan: number, q: FileQuery) {
    const f = this.filter(scan, q);
    const total = Number(
      this.db
        .prepare(`SELECT count(*) n FROM entries WHERE ${f.where}`)
        .get(...f.args)!.n,
    );
    const rows = this.db
      .prepare(
        `SELECT * FROM entries WHERE ${f.where} ORDER BY ${f.order} LIMIT ? OFFSET ?`,
      )
      .all(...f.args, Math.min(q.limit ?? 100, 1000), q.offset ?? 0)
      .map((r) => this.decode(r)!);
    return { rows, total };
  }
  *entries(scan: number, q?: FileQuery): Generator<Entry> {
    const f = q
      ? this.filter(scan, q)
      : { where: "scan=?", args: [scan], order: "id" };
    for (const row of this.db
      .prepare(`SELECT * FROM entries WHERE ${f.where} ORDER BY ${f.order}`)
      .iterate(...f.args))
      yield this.decode(row)!;
  }
  folder(
    scan: number,
    id: number,
    offset = 0,
    sort = "size",
    direction = "desc",
  ): FolderPage {
    const entry = this.entry(scan, id);
    if (!entry?.directory)
      throw new Error("Folder is not available in this scan.");
    if (!["name", "size", "modified"].includes(sort)) sort = "size";
    const children = this.db
      .prepare(
        `SELECT * FROM entries WHERE scan=? AND parent=? ORDER BY ${sort} ${direction === "asc" ? "ASC" : "DESC"},id LIMIT 200 OFFSET ?`,
      )
      .all(scan, id, offset)
      .map((r) => this.decode(r)!);
    const total = Number(
      this.db
        .prepare("SELECT count(*) n FROM entries WHERE scan=? AND parent=?")
        .get(scan, id)!.n,
    );
    const breadcrumbs: Entry[] = [];
    let current: Entry | undefined = entry;
    while (current) {
      breadcrumbs.unshift(current);
      current =
        current.parent === null ? undefined : this.entry(scan, current.parent);
    }
    return {
      entry,
      children,
      breadcrumbs,
      omitted: Math.max(0, total - offset - children.length),
      omittedSize: Math.max(
        0,
        entry.size - children.reduce((a, n) => a + n.size, 0),
      ),
    };
  }
  clear() {
    this.db.exec(
      "DELETE FROM entries; DELETE FROM scans; DELETE FROM seen_directories; VACUUM;",
    );
  }
  close() {
    this.flush();
    this.db.close();
  }
}
