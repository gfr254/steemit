import assert from "node:assert/strict";
import test from "node:test";
import { isAuthorizedManualDuplicateTitleUpdate, isNonPersonalTitle, shouldCheckDuplicateBody } from "./publication-safety.js";

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

test("authorizes only run #142 for a title-only duplicate correction on main", () => {
  const article = { title: "Distinct title", titleOnly: true, target: { author: "author", permlink: "later-copy", replaceDuplicate: true, replaceTitleOnly: true, expectedTitle: "Repeated title" } };
  const base = { eventName: "workflow_dispatch", ref: "refs/heads/main", runNumber: "142", expectedRunNumber: "142", article };
  assert.equal(isAuthorizedManualDuplicateTitleUpdate(base), true);
  assert.equal(isAuthorizedManualDuplicateTitleUpdate({ ...base, runNumber: "143" }), false);
  assert.equal(isAuthorizedManualDuplicateTitleUpdate({ ...base, article: { ...article, titleOnly: false } }), false);
});
