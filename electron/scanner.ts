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
  ScanResult,
} from "../src/shared/types";
import { categoryOf } from "../src/shared/categories";
export async function scan(
  root: string,
  options: ScanOptions,
  cancelled: () => boolean,
  progress: (p: Progress) => void,
  io: ScanIO = { stat: lstat, open: opendir },
): Promise<ScanResult> {
  const began = Date.now();
  const stat = await io.stat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error("Choose a real directory, not a file or symbolic link.");
  const nodes: Entry[] = [
    {
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
    },
  ];
  const result: ScanResult = {
    nodes,
    root,
    files: 0,
    folders: 1,
    bytes: 0,
    elapsed: 0,
    current: root,
    skipped: 0,
    status: "complete",
    warnings: [],
  };
  const stack = [0];
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
    result.skipped++;
    if (result.warnings.length < 100)
      result.warnings.push(
        `${p}: ${error instanceof Error ? error.message : String(error)}`,
      );
  };
  emit(true);
  outer: while (stack.length) {
    if (cancelled()) {
      result.status = "cancelled";
      break;
    }
    const parent = nodes[stack.pop()!];
    result.current = parent.path;
    try {
      const dir = await io.open(parent.path);
      for await (const item of dir) {
        if (cancelled()) {
          result.status = "cancelled";
          break outer;
        }
        if (nodes.length >= options.maxEntries) {
          result.status = "limited";
          break outer;
        }
        const full = path.join(parent.path, item.name);

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
          const id = nodes.length;
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
          nodes.push(node);
          parent.children.push(id);
          if (directory) {
            result.folders++;
            stack.push(id);
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
  for (let i = nodes.length - 1; i > 0; i--)
    nodes[nodes[i].parent!].size += nodes[i].size;
  emit(true);
  return result;
}
