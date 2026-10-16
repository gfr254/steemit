import assert from "node:assert/strict";
import test from "node:test";
import { isNonPersonalTitle, shouldCheckDuplicateBody } from "./publication-safety.js";

const duplicate = { title: "New title", titleOnly: true, target: { replaceDuplicate: true, replaceTitleOnly: true, expectedTitle: "Repeated title" } };

test("a history-verified title-only duplicate may keep its existing body", () => {
  assert.equal(shouldCheckDuplicateBody(duplicate, true), false);
  assert.equal(shouldCheckDuplicateBody(duplicate, false), true);
  assert.equal(shouldCheckDuplicateBody({ ...duplicate, titleOnly: false }, true), true);
});

test("replacement titles cannot imply personal ownership", () => {
  assert.equal(isNonPersonalTitle("Embracing Autumn with My Air-cooled Beetle"), false);
  assert.equal(isNonPersonalTitle("The Beetle’s Rounded Lines"), true);
  assert.equal(isNonPersonalTitle(""), false);
});
