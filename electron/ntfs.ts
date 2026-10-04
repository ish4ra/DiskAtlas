import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createInterface } from "node:readline";
import { lstat } from "node:fs/promises";
import path from "node:path";
import { IndexStore } from "./index-store";
import { categoryOf } from "../src/shared/categories";
import type {
  Entry,
  Progress,
  ScanOptions,
  Summary,
  TypeStat,
} from "../src/shared/types";

export async function probeVolume(
  helper: string,
  root: string,
): Promise<string> {
  const { stdout } = await promisify(execFile)(
    helper,
    ["--probe", path.win32.parse(root).root],
    { windowsHide: true, timeout: 3000, maxBuffer: 4096 },
  );
  const result = JSON.parse(stdout);
  if (typeof result.volumeGuid !== "string")
    throw new Error("Volume identity unavailable");
  return result.volumeGuid;
}
export function eligibleNtfs(root: string, options: ScanOptions) {
  return (
    process.platform === "win32" &&
    /^[a-z]:\\$/i.test(root) &&
    !options.ignoredFolders.length &&
    !options.ignoredExtensions.length
  );
}
export function validateNativeEntry(
  value: unknown,
  root: string,
): Omit<
  Entry,
  "id" | "parent" | "children" | "name" | "extension" | "category"
> {
  const n = value as Record<string, unknown>;
  if (
    !n ||
    typeof n.path !== "string" ||
    !n.path.toLowerCase().startsWith(root.toLowerCase()) ||
    n.path.includes("\0") ||
    n.path.length > 32767 ||
    typeof n.directory !== "boolean" ||
    typeof n.size !== "number" ||
    !Number.isSafeInteger(n.size) ||
    n.size < 0 ||
    typeof n.modified !== "number" ||
    !Number.isSafeInteger(n.modified)
  )
    throw new Error("Invalid native entry");
  if (
    path.win32.normalize(n.path).toLowerCase() !== n.path.toLowerCase() ||
    n.path === root
  )
    throw new Error("Non-canonical native path");
  return {
    path: n.path,
    directory: n.directory,
    size: n.size,
    modified: n.modified,
  };
}
/** Fail closed: unpublished staging is discarded on any helper failure. */
export async function scanNtfs(
  store: IndexStore,
  scan: number,
  root: string,
  helper: string,
  cancelled: () => boolean,
  progress: (p: Progress) => void,
): Promise<Summary> {
  const started = Date.now();
  const stat = await lstat(root);
  store.db.exec(
    "DROP TABLE IF EXISTS temp.ntfs_stage; DROP TABLE IF EXISTS temp.ntfs_paths; CREATE TEMP TABLE ntfs_stage(path TEXT PRIMARY KEY,parent TEXT,data TEXT); CREATE TEMP TABLE ntfs_paths(path TEXT PRIMARY KEY,id INTEGER);",
  );
  const child = spawn(helper, [root], {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
  let errorText = "";
  child.stderr.on("data", (b) => {
    errorText = (errorText + String(b)).slice(-2048);
  });
  const exited = new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  // Attach immediately so a missing executable cannot create an unhandled rejection.
  void exited.catch(() => {});
  const timer = setInterval(() => {
    if (cancelled()) child.kill();
  }, 100);
  let header: { volumeGuid: string; journalId: string } | undefined;
  let done: { entries: number; skipped: number; nextUsn: string } | undefined;
  let count = 0;
  try {
    for await (const line of createInterface({
      input: child.stdout,
      crlfDelay: Infinity,
    })) {
      if (line.length > 262144)
        throw new Error("Native record exceeds protocol bound");
      const message = JSON.parse(line);
      if (message.type === "header" && !header && count === 0) {
        if (
          message.version !== 1 ||
          typeof message.volumeGuid !== "string" ||
          typeof message.journalId !== "string"
        )
          throw new Error("Unsupported native protocol");
        header = message;
      } else if (message.type === "entry" && header && !done) {
        const n = validateNativeEntry(message, root);
        store.db
          .prepare("INSERT INTO ntfs_stage VALUES(?,?,?)")
          .run(
            n.path.toLowerCase(),
            path.win32.dirname(n.path).toLowerCase(),
            JSON.stringify(n),
          );
        count++;
      } else if (message.type === "done" && header && !done) {
        done = message;
      } else throw new Error("Invalid native protocol sequence");
    }
    if (
      (await exited) !== 0 ||
      cancelled() ||
      !header ||
      !done ||
      done.entries !== count ||
      !Number.isSafeInteger(done.skipped) ||
      done.skipped < 0 ||
      typeof done.nextUsn !== "string"
    )
      throw new Error(errorText || "Incomplete NTFS baseline");
    const summary: Summary = {
      root,
      rootIdentity: `${stat.dev}:${stat.ino}`,
      backend: "ntfs",
      volumeGuid: header.volumeGuid,
      journalId: header.journalId,
      // A stable observed journal cursor alone cannot reconcile in-flight writes.
      // Do not persist nextUsn as a replay checkpoint until replay is implemented.

      scannedAt: new Date(started).toISOString(),
      cached: false,
      files: 0,
      folders: 1,
      bytes: 0,
      skipped: done.skipped,
      elapsed: 0,
      current: root,
      status: done.skipped ? "partial" : "complete",
      warnings: done.skipped
        ? ["Some NTFS metadata could not be read or was a reparse point."]
        : [],
      types: [],
      categoryStats: [],
      extensionCount: 0,
      largestFile: null,
      largestFolder: null,
    };
    store.add(scan, {
      id: 0,
      parent: null,
      name: root,
      path: root,
      directory: true,
      size: 0,
      modified: stat.mtimeMs,
      extension: "",
      category: "Other",
      children: [],
    });
    store.db
      .prepare("INSERT INTO ntfs_paths VALUES(?,0)")
      .run(root.toLowerCase());
    let id = 1,
      last = 0;
    for (const row of store.db
      .prepare("SELECT * FROM ntfs_stage ORDER BY length(path),path")
      .iterate()) {
      if (cancelled()) throw new Error("NTFS import cancelled");
      const parent = store.db
        .prepare("SELECT id FROM ntfs_paths WHERE path=?")
        .get(String(row.parent));
      if (!parent) {
        summary.skipped++;
        summary.status = "partial";
        summary.nextUsn = undefined;
        continue;
      }
      const n = JSON.parse(String(row.data));
      const extension = n.directory
        ? ""
        : path.win32.extname(n.path).toLowerCase();
      store.add(scan, {
        ...n,
        id,
        parent: Number(parent.id),
        name: path.win32.basename(n.path),
        extension,
        category: categoryOf(extension),
        children: [],
      });
      if (n.directory) {
        store.db
          .prepare("INSERT INTO ntfs_paths VALUES(?,?)")
          .run(String(row.path), id);
        summary.folders++;
      } else {
        summary.files++;
        summary.bytes += n.size;
      }
      id++;
      if (Date.now() - last > 100) {
        last = Date.now();
        summary.elapsed = Date.now() - started;
        progress(summary);
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    }
    store.aggregate(scan);
    summary.types = store.types(scan) as unknown as TypeStat[];
    summary.categoryStats = store.categories(scan) as unknown as TypeStat[];
    summary.extensionCount = store.extensionCount(scan);
    summary.largestFile = store.largest(scan, false);
    summary.largestFolder = store.largest(scan, true);
    summary.elapsed = Date.now() - started;
    return summary;
  } finally {
    clearInterval(timer);
    if (child.exitCode === null) child.kill();
    await exited.catch(() => {});
    store.flush();
    store.db.exec(
      "DROP TABLE IF EXISTS temp.ntfs_stage; DROP TABLE IF EXISTS temp.ntfs_paths;",
    );
  }
}
