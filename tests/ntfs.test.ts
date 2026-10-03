import test from "node:test";
import assert from "node:assert/strict";
import { validateNativeEntry } from "../electron/ntfs";
test("native protocol rejects out-of-volume, traversal, malformed and unsafe metadata", () => {
  const good = {
    path: "R:\\folder\\file.txt",
    directory: false,
    size: 15,
    modified: 123,
  };
  assert.equal(validateNativeEntry(good, "R:\\").size, 15);
  for (const extra of [
    { path: "S:\\file" },
    { path: "R:\\..\\file" },
    { size: -1 },
    { size: Number.MAX_SAFE_INTEGER + 1 },
    { directory: "false" },
    { modified: NaN },
  ])
    assert.throws(() => validateNativeEntry({ ...good, ...extra }, "R:\\"));
});
