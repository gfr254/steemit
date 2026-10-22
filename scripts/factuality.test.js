import assert from "node:assert/strict";
import test from "node:test";
import { buildSubjectiveMarkerRetryInstruction, findUnsupportedPersonalDrivingClaim, getMissingSubjectiveField, subjectiveMarkerPrompt, validateSubjectiveMarkers } from "./factuality.js";

const validBodies = { body_ja: "丸みのある形にやわらかな印象を受けます。", body_en: "The rounded shape seems gentle.", body_es: "La forma redondeada parece suave.", body_ko: "둥근 형태가 부드러운 느낌입니다." };

test("initial guidance lists accepted markers for every language", () => {
  const prompt = subjectiveMarkerPrompt();
  for (const field of Object.keys(validBodies)) assert.ok(prompt.includes(field));
  for (const markers of [["印象", "感じ", "見え"], ["seem", "impression", "may", "might", "could"], ["parece", "impresión", "puede"], ["느낌", "인상", "듯"]]) for (const marker of markers) assert.ok(prompt.includes(marker));
});

test("valid subjective markers pass and each missing language is identified", () => {
  assert.equal(validateSubjectiveMarkers(validBodies), null);
  for (const field of Object.keys(validBodies)) {
    const article = { ...validBodies, [field]: "A neutral sentence without subjective wording." };
    assert.equal(getMissingSubjectiveField(article), field);
    assert.match(validateSubjectiveMarkers(article), new RegExp(field));
  }
});

test("retry feedback changes only the rejected language body", () => {
  const instruction = buildSubjectiveMarkerRetryInstruction(["body_en"]);
  assert.match(instruction, /revise only body_en/i);
  assert.match(instruction, /all other language bodies unchanged/i);
  assert.match(instruction, /seem, impression, may, might, could/);
});

test("multiple marker failures are deduplicated", () => {
  const instruction = buildSubjectiveMarkerRetryInstruction(["body_en", "body_ja", "body_en"]);
  assert.match(instruction, /body_en and body_ja/);
  assert.equal((instruction.match(/body_en:/g) || []).length, 1);
});
\ntest("neutral driving references do not trigger the personal-experience guard", () => {\n  assert.equal(findUnsupportedPersonalDrivingClaim("運転席から眺める丸い輪郭は、やわらかな印象です。"), null);\n  assert.equal(findUnsupportedPersonalDrivingClaim("車を運転するときの視界を想像すると、曲線の印象が変わります。"), null);\n});\n\ntest("claims of personal driving experience remain blocked", () => {\n  assert.equal(findUnsupportedPersonalDrivingClaim("私はビートルを運転した経験があります。"), "運転");\n  assert.equal(findUnsupportedPersonalDrivingClaim("ビートルをドライブしたことがあります。"), "ドライブ");\n  assert.equal(findUnsupportedPersonalDrivingClaim("運転しました。"), "運転");\n});\n