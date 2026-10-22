export const SUBJECTIVE_MARKERS = Object.freeze({
  body_ja: Object.freeze(["印象", "感じ", "見え", "かもしれない", "ように"]),
  body_en: Object.freeze(["seem", "impression", "may", "might", "could"]),
  body_es: Object.freeze(["parece", "impresión", "impresion", "puede", "podría", "podria"]),
  body_ko: Object.freeze(["느낌", "인상", "듯", "수 있", "보일"]),
});

export function getMissingSubjectiveField(article) {
  for (const [field, markers] of Object.entries(SUBJECTIVE_MARKERS)) {
    const text = typeof article?.[field] === "string" ? article[field] : "";
    if (!markers.some(marker => text.toLowerCase().includes(marker.toLowerCase()))) return field;
  }
  return null;
}

export function validateSubjectiveMarkers(article) {
  const field = getMissingSubjectiveField(article);
  return field ? "Draft rejected: " + field + " lacks cautious, subjective wording" : null;
}

export function subjectiveMarkerPrompt() {
  const requirements = Object.entries(SUBJECTIVE_MARKERS).map(([field, markers]) => field + ": " + markers.join(", "));
  return "Each language body must include at least one accepted marker from this list. Use it for a visual impression, not as a substitute for evidence or to add a factual claim. Keep the four bodies meaning-aligned.\n" + requirements.join("\n");
}

export function missingSubjectiveFieldFromRejection(rejection) {
  return String(rejection || "").match(/^Draft rejected: (body_(?:ja|en|es|ko)) lacks cautious, subjective wording$/)?.[1] || null;
}

export function buildSubjectiveMarkerRetryInstruction(fields) {
  const uniqueFields = [...new Set(fields)].filter(field => Object.hasOwn(SUBJECTIVE_MARKERS, field));
  if (!uniqueFields.length) throw new Error("At least one valid body field is required");
  const requirements = uniqueFields.map(field => field + ": " + SUBJECTIVE_MARKERS[field].join(", ")).join("; ");
  return "Validation feedback: revise only " + uniqueFields.join(" and ") + " to add at least one exact accepted subjective marker. Preserve the title, tags, and all other language bodies unchanged. Keep the same meaning and do not add unsupported factual claims. Return the full required JSON. Accepted markers: " + requirements + ".";
}

const PERSONAL_DRIVING_CLAIM_PATTERNS = Object.freeze([
  /(?:私|僕|わたし|ぼく)[^。！？\n]{0,24}(?:運転|ドライブ)[^。！？\n]{0,20}(?:した|して|経験|思い出)/,
  /(?:運転|ドライブ)[^。！？\n]{0,16}(?:しました|してきました|したこと(?:が)?(?:あります|ある)|した経験(?:が)?(?:あります|ある))/,
]);

export function findUnsupportedPersonalDrivingClaim(text) {
  const source = String(text ?? "");
  for (const pattern of PERSONAL_DRIVING_CLAIM_PATTERNS) {
    const match = source.match(pattern);
    if (match) return match[0].match(/運転|ドライブ/)?.[0] ?? null;
  }
  return null;
}