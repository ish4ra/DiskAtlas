import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PreferencesStore } from "../electron/preferences";
import { defaults } from "../src/shared/types";
test("overlapping preference saves are serialized and survive a reload", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "diskatlas-settings-"));
  const file = path.join(root, "settings.json");
  try {
    const store = new PreferencesStore(file);
    await Promise.all([
      store.save({ ...defaults, theme: "light" }),
      store.save({ ...defaults, theme: "dark", resultCount: 250 }),
    ]);
    assert.equal(JSON.parse(await readFile(file, "utf8")).resultCount, 250);
    assert.equal((await new PreferencesStore(file).load()).theme, "dark");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
