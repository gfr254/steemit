import assert from "node:assert/strict";
import test from "node:test";
import { isAuthorizedManualDuplicateTitleUpdate, isNonPersonalTitle, shouldCheckDuplicateBody } from "./manual-dispatch-guard.js";

const article = { title: "A distinct supported title", titleOnly: true, target: { author: "author", permlink: "later-copy", replaceDuplicate: true, replaceTitleOnly: true, expectedTitle: "Repeated title" } };
const authorized = { eventName: "workflow_dispatch", ref: "refs/heads/main", runNumber: "140", expectedRunNumber: "140", article };

test("allows only the explicitly numbered title-only duplicate correction", () => {
  assert.equal(isAuthorizedManualDuplicateTitleUpdate(authorized), true);
  assert.equal(isAuthorizedManualDuplicateTitleUpdate({ ...authorized, runNumber: "141" }), false);
  assert.equal(isAuthorizedManualDuplicateTitleUpdate({ ...authorized, eventName: "schedule" }), false);
  assert.equal(isAuthorizedManualDuplicateTitleUpdate({ ...authorized, ref: "refs/heads/topic" }), false);
});

test("the one-time gate rejects new posts and incomplete duplicate targets", () => {
  assert.equal(isAuthorizedManualDuplicateTitleUpdate({ ...authorized, article: { ...article, titleOnly: false } }), false);
  assert.equal(isAuthorizedManualDuplicateTitleUpdate({ ...authorized, article: { ...article, target: { ...article.target, expectedTitle: "" } } }), false);
});

test("a verified title-only duplicate is not blocked solely by its unchanged body", () => {
  assert.equal(shouldCheckDuplicateBody(article, true), false);
  assert.equal(shouldCheckDuplicateBody(article, false), true);
  assert.equal(shouldCheckDuplicateBody({ ...article, titleOnly: false }, true), true);
});

test("replacement titles cannot claim the author personally owns the car", () => {
  assert.equal(isNonPersonalTitle("Embracing Autumn with My Air-cooled Beetle"), false);
  assert.equal(isNonPersonalTitle("The Beetle’s Rounded Lines"), true);
});
