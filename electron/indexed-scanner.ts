import { opendir, lstat } from "node:fs/promises";
import path from "node:path";
import type { Stats, Dir } from "node:fs";
export interface ScanIO {
  stat: (p: string) => Promise<Stats>;
  open: (p: string) => Promise<Dir>;
}
import type {
  Entry,
  Progress,
  ScanOptions,
  Summary,
} from "../src/shared/types";
import { IndexStore } from "./index-store";
import type { TypeStat } from "../src/shared/types";
import { categoryOf } from "../src/shared/categories";
export async function scanIndexed(
  store: IndexStore,
  scanId: number,
  root: string,
  options: ScanOptions,
  cancelled: () => boolean,
  progress: (p: Progress) => void,
  io: ScanIO = { stat: lstat, open: opendir },
): Promise<Summary> {
  const began = Date.now();
  const stat = await io.stat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error("Choose a real directory, not a file or symbolic link.");
  store.add(scanId, {
    id: 0,
    parent: null,
    name: path.basename(root) || root,
    path: root,
    extension: "",
    category: "Other",
    size: 0,
    modified: stat.mtimeMs,
    directory: true,
    children: [],
  });
  if (Number.isSafeInteger(stat.ino) && stat.ino > 0)
    store.seen(scanId, `${stat.dev}:${stat.ino}`);
  let nextId = 1;
  const result: Summary = {
    types: [],
    categoryStats: [],
    extensionCount: 0,
    largestFile: null,
    largestFolder: null,
    scannedAt: new Date().toISOString(),
    cached: false,
    root,
    rootIdentity: `${stat.dev}:${stat.ino}`,
    files: 0,
    folders: 1,
    bytes: 0,
    elapsed: 0,
    current: root,
    skipped: 0,
    status: "complete",
    warnings: [],
  };

  let last = 0;
  const emit = (force = false) => {
    result.elapsed = Date.now() - began;
    if (force || Date.now() - last > 100) {
      last = Date.now();
      progress({
        files: result.files,
        folders: result.folders,
        bytes: result.bytes,
        elapsed: result.elapsed,
        current: result.current,
        skipped: result.skipped,
      });
    }
  };
  const skip = (p: string, error: unknown) => {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      String(error.code).includes("SQLITE")
    )
      throw error;
    result.skipped++;
    if (result.warnings.length < 100)
      result.warnings.push(
        `${p}: ${error instanceof Error ? error.message : String(error)}`,
      );
  };
  emit(true);
  outer: while (true) {
    if (cancelled()) {
      result.status = "cancelled";
      break;
    }
    const parent = store.pending(scanId);
    if (!parent) break;
    store.visited(scanId, parent.id);
    result.current = parent.path;
    try {
      const check = await io.stat(parent.path);
      if (check.isSymbolicLink() || !check.isDirectory()) {
        skip(parent.path, new Error("Directory changed during scan."));
        continue;
      }
      const dir = await io.open(parent.path);
      for await (const item of dir) {
        if (cancelled()) {
          result.status = "cancelled";
          break outer;
        }

        const full = path.join(parent.path, item.name);
        if (
          store.filename !== ":memory:" &&
          [
            store.filename,
            store.filename + "-wal",
            store.filename + "-shm",
          ].includes(full)
        )
          continue;

        try {
          const s = await io.stat(full);
          if (s.isSymbolicLink()) {
            result.skipped++;
            continue;
          }
          if (!s.isDirectory() && !s.isFile()) {
            result.skipped++;
            continue;
          }
          const directory = s.isDirectory();
          if (
            directory &&
            options.ignoredFolders.some(
              (x) =>
                x.toLowerCase() === item.name.toLowerCase() ||
                path.resolve(x).toLowerCase() === full.toLowerCase(),
            )
          )
            continue;
          const extension = directory
            ? ""
            : path.extname(item.name).toLowerCase();
          if (
            !directory &&
            options.ignoredExtensions
              .map((x) => x.toLowerCase().replace(/^([^.])/, ".$1"))
              .includes(extension)
          )
            continue;
          if (directory && s.ino && store.seen(scanId, `${s.dev}:${s.ino}`)) {
            result.skipped++;
            continue;
          }
          const id = nextId++;
          const node: Entry = {
            id,
            parent: parent.id,
            name: item.name,
            path: full,
            extension,
            category: categoryOf(extension),
            size: directory ? 0 : s.size,
            modified: s.mtimeMs,
            directory,
            children: [],
          };
          store.add(scanId, node);
          if (directory) {
            result.folders++;
          } else {
            result.files++;
            result.bytes += s.size;
          }
        } catch (e) {
          skip(full, e);
        }
        emit();
      }
    } catch (e) {
      skip(parent.path, e);
    }
    emit();
  }
  if (result.status === "complete" && result.warnings.length)
    result.status = "partial";
  store.aggregate(scanId);
  result.types = store.types(scanId) as unknown as TypeStat[];
  result.categoryStats = store.categories(scanId) as unknown as TypeStat[];
  result.extensionCount = store.extensionCount(scanId);
  result.largestFile = store.largest(scanId, false);
  result.largestFolder = store.largest(scanId, true);
  emit(true);
  return result;
}
