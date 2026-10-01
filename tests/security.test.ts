import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateSettings,
  validateQuery,
  validateTarget,
} from "../electron/validation";
import { defaults } from "../src/shared/types";
test("settings reject invalid values and constrain resource use", () => {
  assert.deepEqual(validateSettings(defaults), defaults);
  assert.throws(() => validateSettings({ ...defaults, resultCount: 1000000 }));
  assert.throws(() => validateSettings({ ...defaults, theme: "evil" }));
});
test("query validates fields and bounds IPC pages", () => {
  assert.deepEqual(validateQuery({ limit: 100 }), { limit: 100 });
  assert.throws(() => validateQuery({ limit: 100001 }));
  assert.throws(() => validateQuery({ sort: "__proto__" }));
  assert.throws(() => validateQuery({ min: -1 }));
});
test("targets reject relative and null-containing paths", () => {
  assert.throws(() => validateTarget("relative"));
  assert.throws(() => validateTarget("/tmp/\0"));
});
