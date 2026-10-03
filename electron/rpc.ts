import { Worker } from "node:worker_threads";
import path from "node:path";
export class ScannerClient {
  private worker: Worker;
  private next = 0;
  private failure: Error | null = null;
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  constructor(
    onProgress: (p: unknown) => void,
    onFailure: (message: string) => void,
    workerPath = path.join(__dirname, "worker.cjs"),
    indexPath?: string,
    nativeHelper?: string,
  ) {
    this.worker = new Worker(workerPath, {
      workerData: { indexPath, nativeHelper },
    });
    const fail = (e: Error) => {
      if (this.failure) return;
      this.failure = e;
      for (const p of this.pending.values()) p.reject(e);
      this.pending.clear();
      onFailure(e.message);
    };
    this.worker.on("message", (m) => {
      if (m.event === "progress") {
        onProgress(m.data);
        return;
      }
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error));
      else p.resolve(m.data);
    });
    this.worker.on("error", (e) => fail(e));
    this.worker.on("exit", (code) =>
      fail(new Error(`Scanner stopped (${code}). Restart DiskAtlas.`)),
    );
  }
  call<T>(method: string, ...args: unknown[]): Promise<T> {
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      const id = ++this.next;
      this.pending.set(id, { resolve: (v) => resolve(v as T), reject });
      try {
        this.worker.postMessage({ id, method, args });
      } catch (e) {
        this.pending.delete(id);
        reject(e);
      }
    });
  }
  async close() {
    this.failure = new Error("Scanner stopped. Restart DiskAtlas.");
    for (const p of this.pending.values()) p.reject(this.failure);
    this.pending.clear();
    await this.worker.terminate();
  }
}
