import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { defaults, type Settings } from "../src/shared/types";
import { validateSettings } from "./validation";
export class PreferencesStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private file: string) {}
  async load(): Promise<Settings> {
    try {
      return validateSettings(JSON.parse(await readFile(this.file, "utf8")));
    } catch {
      return { ...defaults };
    }
  }
  save(input: Settings): Promise<Settings> {
    const next = validateSettings(input);
    const task = this.queue.then(async () => {
      await mkdir(path.dirname(this.file), { recursive: true });
      await writeFile(this.file + ".tmp", JSON.stringify(next, null, 2));
      await rename(this.file + ".tmp", this.file);
      return next;
    });
    this.queue = task.catch(() => {});
    return task;
  }
}
