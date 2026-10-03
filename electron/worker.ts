import { parentPort, workerData } from "node:worker_threads";
import { lstat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { once } from "node:events";
import { eligibleNtfs, scanNtfs } from "./ntfs";
import { scanIndexed } from "./indexed-scanner";
import { IndexStore } from "./index-store";
import { csvCell } from "./analysis";
import type { FileQuery, ScanOptions, Summary } from "../src/shared/types";
const store = new IndexStore(workerData?.indexPath ?? ":memory:");
const restored = store.latest();
let result: Summary | null = restored?.summary ?? null;
let active = restored?.id ?? 0;
let stopped = false;
let busy = false;
let exporting = 0;
parentPort!.on(
  "message",
  async ({
    id,
    method,
    args,
  }: {
    id: number;
    method: string;
    args: unknown[];
  }) => {
    try {
      let data: unknown;
      if (method === "cancel") {
        stopped = true;
      } else if (method === "scan") {
        if (busy) throw new Error("A scan is already running.");
        busy = true;
        stopped = false;
        const scanId = store.begin(args[0] as string);
        try {
          let next: Summary;
          let fallback: string | undefined;
          if (
            workerData?.nativeHelper &&
            eligibleNtfs(args[0] as string, args[1] as ScanOptions)
          ) {
            try {
              next = await scanNtfs(
                store,
                scanId,
                args[0] as string,
                workerData.nativeHelper,
                () => stopped,
                (p) => parentPort!.postMessage({ event: "progress", data: p }),
              );
            } catch (e) {
              store.resetEntries(scanId);
              fallback = (e as Error).message;
            }
          }
          if (!next!) {
            next = await scanIndexed(
              store,
              scanId,
              args[0] as string,
              args[1] as ScanOptions,
              () => stopped,
              (p) => parentPort!.postMessage({ event: "progress", data: p }),
            );
            next.backend = "filesystem";
            next.accelerationFallback = fallback;
          }
          store.finish(scanId, next);
          result = next;
          active = scanId;
          data = result;
          if (!exporting) store.retain(active);
        } catch (e) {
          store.fail(scanId);
          throw e;
        } finally {
          busy = false;
        }
      } else if (method === "snapshots") {
        data = store.snapshots();
      } else if (method === "restore") {
        if (busy) throw new Error("Wait for the scan to finish.");
        result = store.restore(args[0] as number);
        active = args[0] as number;
        data = result;
      } else if (method === "summary") {
        if (result) {
          try {
            const root = await lstat(result.root);
            result.unavailable =
              root.isSymbolicLink() ||
              !root.isDirectory() ||
              (!!result.rootIdentity &&
                result.rootIdentity !== `${root.dev}:${root.ino}`);
          } catch {
            result.unavailable = true;
          }
        }
        data = result;
      } else if (method === "clear") {
        if (busy || exporting)
          throw new Error("Wait for scanning and exports to finish.");
        store.clear();
        result = null;
      } else {
        if (!result) throw new Error("Scan a folder first.");
        const snapshot = result;
        const snapshotId = active;
        if (method === "files")
          data = store.files(active, args[0] as FileQuery);
        else if (method === "folder")
          data = store.folder(
            active,
            args[0] as number,
            args[1] as number,
            args[2] as string,
            args[3] as string,
          );
        else if (method === "entry")
          data = store.entry(active, args[0] as number);
        else if (method === "export") {
          const [destination, format, q] = args as [string, string, FileQuery];
          const stream = createWriteStream(destination, { encoding: "utf8" });
          let failure: Error | undefined;
          stream.on("error", (e) => {
            failure = e;
          });
          const write = async (s: string) => {
            if (failure) throw failure;
            if (!stream.write(s)) await once(stream, "drain");
          };
          exporting++;
          try {
            if (format === "json") {
              await write(
                '{"summary":' + JSON.stringify(snapshot) + ',"entries":[\n',
              );
              let i = 0;
              for (const entry of store.entries(snapshotId))
                await write((i++ ? ",\n" : "") + JSON.stringify(entry));
              await write("\n]}");
            } else {
              await write("Name,Path,Type,Size,Modified\r\n");
              for (const n of store.entries(snapshotId, q))
                await write(
                  [
                    n.name,
                    n.path,
                    n.extension,
                    n.size,
                    new Date(n.modified).toISOString(),
                  ]
                    .map(csvCell)
                    .join(",") + "\r\n",
                );
            }
            stream.end();
            await once(stream, "finish");
          } catch (e) {
            stream.destroy();
            throw e;
          } finally {
            exporting--;
            if (!exporting && !busy) store.retain(active);
          }
          data = destination;
        } else throw new Error("Unsupported request.");
      }
      parentPort!.postMessage({ id, data });
    } catch (error) {
      parentPort!.postMessage({
        id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
);
