import OpenAI from "openai";
import fs from "fs";
import { factualityGuardAvoidancePrompt, buildSubjectiveMarkerRetryInstruction, findUnsupportedPersonalDrivingClaim, findUnsupportedPublicOpinionClaim, missingSubjectiveFieldFromRejection, subjectiveMarkerPrompt } from "./article-validation.js";
import { isNonPersonalTitle } from "./publication-safety.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const RETRYABLE_STEEM_ERROR_CODES = new Set([-32603]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableSteemError(error) {
  if (!error || typeof error !== "object") return false;
  if (typeof error.code === "number" && RETRYABLE_STEEM_ERROR_CODES.has(error.code)) return true;
  const message = String(error.message || error).toLowerCase();
  return [
    "internal error",
    "temporarily unavailable",
    "timeout",
    "network error",
    "fetch failed",
    "failed to fetch"
  ].some((fragment) => message.includes(fragment));
}

async function rpc(method, params, retries = 4) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch("https://api.steemit.com", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 })
      });
      if (!response.ok) throw new Error("Steem RPC HTTP " + response.status);
      const payload = await response.json();
      if (payload?.error) {
        const error = new Error("Steem RPC error for " + method + ": " + JSON.stringify(payload.error));
        error.code = payload.error?.code;
        error.data = payload.error?.data;
        throw error;
      }
      return payload.result;
    } catch (error) {
      lastError = error;
      if (attempt < retries && isRetryableSteemError(error)) {
        const delayMs = 250 * (2 ** attempt);
        console.warn("[Steem RPC] " + method + " failed (attempt " + (attempt + 1) + "/" + (retries + 1) + "); retrying in " + delayMs + "ms: " + error.message);
        await sleep(delayMs);
        continue;
      }
      throw error;
    }
  }
  throw lastError || new Error("Steem RPC request failed for " + method);
}

async function findOldestPlaceholder(mode = "combined") {
  const author = process.env.STEEM_AUTHOR;
  if (!author) {
    console.warn("[Steem] STEEM_AUTHOR is not set; skipping blog history lookup.");
    return { target: null, existingTitles: [] };
  }

  try {
    const found = new Map();
    const existingPosts = new Map();
    let cursor = null;
    const existingTitles = [];

    for (let page = 0; page < 10; page++) {
      const rows = await rpc("condenser_api.get_discussions_by_blog", [{ tag: author, limit: 100, ...(cursor ? { start_author: cursor.author, start_permlink: cursor.permlink } : {}) }]);
      if (!Array.isArray(rows) || rows.length === 0) break;
      for (const item of rows) {
        if (item.author !== author) continue;
        if (item.title === "*" && item.body === "*") found.set(item.permlink, item);
        else if (item.title && item.title !== "*") {
          existingTitles.push(item.title);
          existingPosts.set(item.permlink, item);
        }
      }
      const last = rows[rows.length - 1];
      if (cursor && last.author === cursor.author && last.permlink === cursor.permlink) break;
      cursor = { author: last.author, permlink: last.permlink };
      if (rows.length < 100) break;
    }

    const titleKey = value => String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
    const grouped = new Map();
    for (const item of existingPosts.values()) {
      const key = titleKey(item.title);
      if (key.length > 2) grouped.set(key, [...(grouped.get(key) || []), item]);
    }

    const replacements = [];
    for (const group of grouped.values()) {
      if (group.length < 2) continue;
      const chronological = group.slice().sort((x, y) => String(x.created).localeCompare(String(y.created)));
      for (const item of chronological.slice(1)) replacements.push({ ...item, replaceDuplicate: true, replaceTitleOnly: true, expectedTitle: item.title });
    }
    replacements.sort((x, y) => String(x.created).localeCompare(String(y.created)));
    const titleHistory = [...new Set(existingTitles)];
    const previousTitles = titleHistory.slice(0, 100);

    if (mode !== "regular" && replacements.length) {
      const selected = replacements[0];
      selected.remainingDuplicates = replacements.length;
      selected.replacementIndex = Math.floor(Date.parse(selected.created) / 86400000);
      selected.previousTitles = previousTitles;
      return { target: selected, existingTitles: titleHistory };
    }
    if (mode === "correction") return { target: null, existingTitles: titleHistory };

    const sorted = [...found.values()].sort((x, y) => x.created.localeCompare(y.created));
    if (!sorted.length) return { target: null, existingTitles: titleHistory };
    sorted[0].remainingPlaceholders = sorted.length;
    sorted[0].previousTitles = previousTitles.slice(0, 30);
    return { target: sorted[0], existingTitles: titleHistory };
  } catch (error) {
    console.error("[Steem] Unable to fetch blog history for author " + author + "; treating as empty history.", error);
    return { target: null, existingTitles: [] };
  }
}

function normalizeTitle(value) { return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("en"); }

async function generateUniqueTitle(target, existingTitles) {
  const titleList = [...new Set(existingTitles)].slice(0, 100).map((title) => "- " + title).join("\n") || "- none";
  let correction = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Generate a concise, accurate English title for an existing Steemit article. Return JSON only." },
        { role: "user", content: [
          "Suggest a new title for this already-published article. Only the title will be updated; its body and URL must remain unchanged. Do not use first person or imply that the author owns, drives, or leads the subject. Keep it specific and factual.",
          "Current title: " + String(target.title || ""),
          "Article text (factual source):\n" + String(target.body || "").slice(0, 8000),
          "Existing titles that must not be reused or closely paraphrased:\n" + titleList,
          "Use a specific title supported by the article text. Do not add unsupported facts or dates. Return JSON with one property: title.",
          correction
        ].filter(Boolean).join("\n") }
      ],
      response_format: { type: "json_object" }
    });
    const draft = JSON.parse(response.choices[0].message.content);
    const title = String(draft.title || "").trim();
    if (isNonPersonalTitle(title) && !existingTitles.some((existing) => normalizeTitle(existing) === normalizeTitle(title))) return title;
    correction = "The proposed title was empty, already exists, or implies personal ownership. Choose a clearly different, specific title without first-person wording; do not change the article body or URL.";
    console.warn("Title-only replacement title collided with history; retrying (attempt " + (attempt + 1) + "/3).");
  }
  throw new Error("Could not generate a unique title for the published duplicate; no post was updated");
}

const MAX_DRAFT_GENERATION_ATTEMPTS = 5;

async function generateDraft(prompt, target, existingTitles = []) {
  let retryPrompt = prompt;
  let rejection = null;
  const missingMarkerFields = new Set();
  const otherRetryInstructions = [];
  for (let attempt = 1; attempt <= MAX_DRAFT_GENERATION_ATTEMPTS; attempt++) {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You generate high-quality multilingual JSON for Steemit." },
        { role: "user", content: retryPrompt }
      ],
      response_format: { type: "json_object" }
    });
    const article = JSON.parse(response.choices[0].message.content);
    article.target = target ? { author: target.author, permlink: target.permlink, parent_author: target.parent_author, parent_permlink: target.parent_permlink, created: target.created, replaceDuplicate: target.replaceDuplicate, replaceTitleOnly: target.replaceTitleOnly } : null;
    rejection = validateDraft(article, target, existingTitles);
    if (!rejection) return article;
    if (attempt < MAX_DRAFT_GENERATION_ATTEMPTS) {
      console.warn("Draft rejected by validation; requesting a correction (attempt " + (attempt + 1) + "/" + MAX_DRAFT_GENERATION_ATTEMPTS + "): " + rejection);
      const markerField = missingSubjectiveFieldFromRejection(rejection);
      if (markerField) {
        missingMarkerFields.add(markerField);
      } else {
        const correction = buildRetryInstruction(rejection);
        const instruction = correction + (rejection !== "Draft rejected: title duplicates an existing post" ? " Rewrite all four language versions from scratch, keep their meaning aligned, and do not reuse or paraphrase the banned titles." : "");
        if (!otherRetryInstructions.includes(instruction)) otherRetryInstructions.push(instruction);
      }
      retryPrompt = [prompt, ...otherRetryInstructions, missingMarkerFields.size ? buildSubjectiveMarkerRetryInstruction([...missingMarkerFields]) : ""].filter(Boolean).join("\n\n");
    }
  }
  throw new Error(rejection || "Draft failed factuality validation");
}

function buildRetryInstruction(rejection) {
  if (rejection === "Draft rejected: title duplicates an existing post") return "The title duplicates an existing post. Change only the English title to a concise, specific title that is distinct from prior titles while preserving the original topic.";
  const markerField = missingSubjectiveFieldFromRejection(rejection);
  if (markerField) return buildSubjectiveMarkerRetryInstruction([markerField]);
  const guardedTerm = rejection.match(/^Draft rejected by factuality guard: (.+)$/);
  if (guardedTerm) return "Validation feedback: remove the exact guarded term or unsupported claim \"" + guardedTerm[1] + "\" from the title and all four language bodies. Avoid the full related concept if it implies an unsubstantiated claim.";
  return "Validation feedback: correct this issue without adding unsupported factual claims: " + rejection + ".";
}

function validateDraft(article, target, existingTitles = []) {
  const title = String(article?.title || "").trim();
  if (!title) return "Draft rejected: title is empty";
  if (existingTitles.some((existing) => normalizeTitle(existing) === normalizeTitle(title))) return "Draft rejected: title duplicates an existing post";
  if (!target) return null;
  const articleText = [article.title, article.body_ja, article.body_en, article.body_es, article.body_ko].join("\n");
  const personalDrivingClaim = findUnsupportedPersonalDrivingClaim(articleText);
  if (personalDrivingClaim) return "Draft rejected by factuality guard: " + personalDrivingClaim;
  const unsupportedPublicOpinion = findUnsupportedPublicOpinionClaim(articleText);
  if (unsupportedPublicOpinion) return "Draft rejected by factuality guard: " + unsupportedPublicOpinion;
  const riskyPatterns = ["[0-9]", "safe|safety|security|repair|maintenance|production|manufactur|histor|popular|famous|many people|every year|owners?|events?|market|experts?|functionality|worldwi"];
  const risky = riskyPatterns.find(pattern => pattern.test(articleText));
  if (risky) return "Draft rejected by factuality guard: " + (articleText.match(risky)?.[0] || risky.source);
  const markerRejection = validateSubjectiveMarkers(article);
  if (markerRejection) return markerRejection;
  return null;
}

async function generate() {
  const mode = process.argv[2] || "combined";
  if (!["combined", "correction", "regular"].includes(mode)) throw new Error("Unknown generation mode: " + mode);
  const history = await findOldestPlaceholder(mode);
  const target = history.target;
  const existingTitles = history.existingTitles;
  if (mode === "correction" && !target?.replaceDuplicate) {
    fs.writeFileSync("article.json", JSON.stringify({ skip: true, reason: "no_replacement_target" }));
    console.log("No eligible duplicate correction remains; correction skipped.");
    return;
  }
  if (target?.replaceTitleOnly) {
    const title = await generateUniqueTitle(target, existingTitles);
    const article = { title, titleOnly: true, target: { author: target.author, permlink: target.permlink, parent_author: target.parent_author, parent_permlink: target.parent_permlink, created: target.created, replaceDuplicate: target.replaceDuplicate, replaceTitleOnly: target.replaceTitleOnly } };
    fs.writeFileSync("article.json", JSON.stringify(article, null, 2));
    console.log("Generated a unique title-only update for an existing duplicate post.");
    return;
  }
  if (target && target.permlink === "3tmtka" && process.env.GITHUB_REF === "refs/heads/main" && process.env.GITHUB_EVENT_NAME === "schedule" && !existingTitles.some((title) => normalizeTitle(title) === normalizeTitle("The Beetle’s Rounded Lines: A Design That Invites a Closer Look"))) {
    const article = {"title":"The Beetle’s Rounded Lines: A Design That Invites a Closer Look","body_ja":"ビートルを見たとき、まず目に入るのは、車全体をつなぐ丸い輪郭と、どこまでも柔らかい線の連なりです。角ばった存在感ではなく、丸みを帯びた姿勢が、見ている人にやわらかな安心感を与えます。","body_en":"When you look at the Beetle, the first thing that stands out is the way its rounded silhouette flows across the whole body. Rather than a sharp or angular presence, the soft curves create a sense of calm and familiarity that draws the eye in gradually.","body_es":"Cuando se ve el Beetle, lo primero que destaca es la forma en que su silueta redondeada recorre todo el cuerpo. En vez de una presencia marcada o angular, las curvas suaves generan una sensación de calma y cercanía que invita a observarlo con calma.","body_ko":"비틀을 바라보면 가장 먼저 눈에 들어오는 건 몸 전체를 부드럽게 연결하는 둥근 실루엣입니다. 날카롭고 각진 존재감이 아니라, 둥근 곡선이 차분함과 친근함을 주며 한 번 더 자세히 보고 싶게 만듭니다."};
    article.target = { author: target.author, permlink: target.permlink, parent_author: target.parent_author, parent_permlink: target.parent_permlink, created: target.created, replaceDuplicate: target.replaceDuplicate, replaceTitleOnly: target.replaceTitleOnly };
    fs.writeFileSync("article.json", JSON.stringify(article, null, 2));
    console.log("Approved first article loaded without another AI call.");
    return;
  }
  const articleNumber = target?.remainingPlaceholders ? (187 - target.remainingPlaceholders) : target?.replaceDuplicate ? target.replacementIndex : 0;
  const topics = ["the Beetle’s overall rounded silhouette", "the way curved lines connect across the body", "the visual balance of front and rear", "how a rounded form stands out among angular shapes"];
  const topic = target ? topics[(articleNumber - 1) % topics.length] : topics[0];
  const previousTitles = (target?.previousTitles || existingTitles.slice(0, 100)).join(" | ") || "none";
  const repairPrompt = target?.replaceDuplicate
        ? [
          "You are revising an existing Steemit article because its title is repeated. Preserve the original article's subject and key meaning; do not turn it into a different topic.",
          "Article number: " + articleNumber,
          "Original title: " + String(target.title || ""),
          "Source article text (use this as the factual source; it may be truncated):\n" + String(target.body || "").slice(0, 8000),
          "Do not reuse or closely paraphrase these previous titles: " + previousTitles,
          "Use only points supported by the source text. Do not invent dates, technical specifications, prices, statistics, named people or places, or personal experience. Do not use digits. Avoid unsupported claims and keep the tone gentle and factual.",
          "Return only JSON with title, body_ja, body_en, body_es, and body_ko."
        ].join("\n")
        : [
          "You are writing one original, gentle design essay about an air-cooled VW for a multilingual Steemit audience.",
          "Article number: " + articleNumber,
          "Visual topic: " + topic,
          "Do not repeat or closely paraphrase these previous titles: " + previousTitles,
          "Critical accuracy rules: " + factualityGuardAvoidancePrompt(),
          subjectiveMarkerPrompt(),
          "Write three concise paragraphs per language. Japanese, English, Spanish, and Korean must convey the same ideas naturally. Return only JSON with title, body_ja, body_en, body_es, body_ko."
        ].join("\n");
  const legacyPrompt = "\nあなたは「空冷かずひろ」のSteemit多言語投稿AIです。\nテーマは、空冷VWの文化、歴史、日本の旧車事情、イベント、デザインといった幅広い視点です。\n以前に使ったタイトルや似た言い回しは避け、正確で柔らかな文章を作成してください。\n日本語、英語、スペイン語、韓国語で同じ意味を自然に表現し、JSONだけを返してください。\n";
  const prompt = target ? repairPrompt : legacyPrompt + "\n\n" + subjectiveMarkerPrompt() + "\n\nDo not reuse or closely paraphrase these previous titles: " + previousTitles;
  const article = await generateDraft(prompt, target, existingTitles);
  fs.writeFileSync("article.json", JSON.stringify(article, null, 2));
  console.log("✔ 整備固定記事生成完了: article.json に保存しました");
}

generate();
