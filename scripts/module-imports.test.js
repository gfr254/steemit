import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isNonPersonalTitle, shouldCheckDuplicateBody } from "./publication-safety.js";
import { validateSubjectiveMarkers } from "./factuality.js";

test("generator imports helpers from modules that export them", async () => {
  const source = await readFile(new URL("./generate.js", import.meta.url), "utf8");
  assert.ok(source.includes("from \"./factuality.js\""));
  assert.ok(source.includes("import { isNonPersonalTitle } from \"./publication-safety.js\""));
  assert.equal(typeof isNonPersonalTitle, "function");
  assert.equal(typeof shouldCheckDuplicateBody, "function");
  assert.equal(typeof validateSubjectiveMarkers, "function");
});
