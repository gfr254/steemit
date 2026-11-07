import OpenAI from "openai";
import fs from "fs";
import { factualityGuardAvoidancePrompt, buildSubjectiveMarkerRetryInstruction, findUnsupportedPersonalDrivingClaim, findUnsupportedPublicOpinionClaim, missingSubjectiveFieldFromRejection, subjectiveMarkerPrompt, validateSubjectiveMarkers, buildRetryInstruction } from "./article-validation.js";
import { isNonPersonalTitle } from "./publication-safety.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientSteemError(error) {
  if (!error) return false;
  const message = typeof error === "string" ? error : JSON.stringify(error);
  if (/circuit breaker open|Upstream temporarily unavailable|temporarily unavailable|request rejected without dialing upstream|too many requests|service unavailable|network/i.test(message)) {
    return true;
  }
  const code = Number(error?.code ?? error?.data?.code);
  return [1100, 1101, 500, 503, 429].includes(code);
}

async function rpc(method, params, retries = 3) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch("https://api.steemit.com", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }) });
      if (!response.ok) {
        const isRetryableHttpError = response.status >= 500 || response.status === 429;
        if (attempt < retries && isRetryableHttpError) {
          const delayMs = 1000 * (attempt + 1) * 2;
          console.warn(`Steem RPC HTTP ${response.status}; retrying in ${delayMs}ms (attempt ${attempt + 1}/${retries + 1})`);
          await sleep(delayMs);
          continue;
        }
        throw new Error("Steem RPC HTTP " + response.status);
      }
      const payload = await response.json();
      if (payload?.error) {
        if (attempt < retries && isTransientSteemError(payload.error)) {
          const delayMs = 1000 * (attempt + 1) * 2;
          console.warn(`Steem RPC transient error; retrying in ${delayMs}ms (attempt ${attempt + 1}/${retries + 1}): ${JSON.stringify(payload.error)}`);
          await sleep(delayMs);
          continue;
        }
        throw new Error("Steem RPC error: " + JSON.stringify(payload.error));
      }
      return payload.result;
    } catch (error) {
      lastError = error;
      if (attempt < retries && isTransientSteemError(error)) {
        const delayMs = 1000 * (attempt + 1) * 2;
        console.warn(`Steem RPC request failed transiently; retrying in ${delayMs}ms (attempt ${attempt + 1}/${retries + 1}): ${error.message}`);
        await sleep(delayMs);
        continue;
      }
      throw error;
    }
  }
  throw lastError || new Error("Steem RPC failed after retries");
}

async function findOldestPlaceholder(mode = "combined") {
      const author = process.env.STEEM_AUTHOR;
      const found = new Map(); const existingPosts = new Map(); let cursor = null; const existingTitles = [];
      for (let page = 0; page < 10; page++) {
        const rows = await rpc("condenser_api.get_discussions_by_blog", [{ tag: author, limit: 100, ...(cursor ? { start_author: cursor.author, start_permlink: cursor.permlink } : {}) }]);
        if (!Array.isArray(rows) || rows.length === 0) break;
        for (const item of rows) {
          if (item.author !== author) continue;
          if (item.title === "*" && item.body === "*") found.set(item.permlink, item);
          else if (item.title && item.title !== "*") { existingTitles.push(item.title); existingPosts.set(item.permlink, item); }
        }
        const last = rows[rows.length - 1]; if (cursor && last.author === cursor.author && last.permlink === cursor.permlink) break;
        cursor = { author: last.author, permlink: last.permlink }; if (rows.length < 100) break;
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
          "Suggest a new title for this already-published article. Only the title will be updated; its body and URL must remain unchanged. Do not use first person or imply that the author owns, dr[...]
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
    correction = "The proposed title was empty, already exists, or implies personal ownership. Choose a clearly different, specific title without first-person wording; do not change the article body or URL. Return JSON with one property: title.";
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
    article.target = target ? { author: target.author, permlink: target.permlink, parent_author: target.parent_author, parent_permlink: target.parent_permlink, created: target.created, replaceDuplicate: target.replaceDuplicate, replaceTitleOnly: target.replaceTitleOnly, expectedTitle: target.expectedTitle, remainingDuplicates: target.remainingDuplicates } : null;
    rejection = validateDraft(article, target, existingTitles);
    if (!rejection) return article;
    if (attempt < MAX_DRAFT_GENERATION_ATTEMPTS) {
      console.warn("Draft rejected by validation; requesting a correction (attempt " + (attempt + 1) + "/" + MAX_DRAFT_GENERATION_ATTEMPTS + "): " + rejection);
      const markerField = missingSubjectiveFieldFromRejection(rejection);
      if (markerField) {
        missingMarkerFields.add(markerField);
      } else {
        const correction = buildRetryInstruction(rejection);
        const instruction = correction + (rejection !== "Draft rejected: title duplicates an existing post" ? " Rewrite all four language versions from scratch, keep their meaning aligned, and do not repeat the rejected issue." : "");
        if (!otherRetryInstructions.includes(instruction)) otherRetryInstructions.push(instruction);
      }
      retryPrompt = [prompt, ...otherRetryInstructions, missingMarkerFields.size ? buildSubjectiveMarkerRetryInstruction([...missingMarkerFields]) : ""].filter(Boolean).join("\n\n");
    }
  }
  throw new Error(rejection || "Draft failed factuality validation");
}

function buildRetryInstruction(rejection) {
  if (rejection === "Draft rejected: title duplicates an existing post") return "The title duplicates an existing post. Change only the English title to a concise, specific title that is distinct and supported by the source text.";
  const markerField = missingSubjectiveFieldFromRejection(rejection);
  if (markerField) return buildSubjectiveMarkerRetryInstruction([markerField]);
  const guardedTerm = rejection.match(/^Draft rejected by factuality guard: (.+)$/);
  if (guardedTerm) return "Validation feedback: remove the exact guarded term or unsupported claim \"" + guardedTerm[1] + "\" from the title and all four language bodies. Avoid the full related claim family, and keep the wording factual and specific.";
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
    const article = { title, titleOnly: true, target: { author: target.author, permlink: target.permlink, parent_author: target.parent_author, parent_permlink: target.parent_permlink, created: target.created, replaceDuplicate: target.replaceDuplicate, replaceTitleOnly: target.replaceTitleOnly, expectedTitle: target.expectedTitle, remainingDuplicates: target.remainingDuplicates } };
    fs.writeFileSync("article.json", JSON.stringify(article, null, 2));
    console.log("Generated a unique title-only update for an existing duplicate post.");
    return;
  }
  if (target && target.permlink === "3tmtka" && process.env.GITHUB_REF === "refs/heads/main" && process.env.GITHUB_EVENT_NAME === "schedule" && !existingTitles.some((title) => normalizeTitle(title) === normalizeTitle("The Beetle’s Rounded Lines: A Design That Invites a Closer Look"))) {
    const article = {"title":"The Beetle’s Rounded Lines: A Design That Invites a Closer Look","body_ja":"ビートルを見たとき、まず目に入るのは、車全体をつなぐ丸い輪郭です。","body_en":"When the Beetle comes into view, the first thing that stands out is the way its rounded silhouette connects the whole car into a single shape.","body_es":"Cuando se contempla el Beetle, lo primero que llama la atención es la forma en que su silueta redondeada une todo el coche en una sola figura.","body_ko":"비틀을 바라보면 가장 먼저 눈에 띄는 것은 둥근 실루엣이 차 전체를 하나의 형태로 이어준다는 점입니다."};
    article.target = { author: target.author, permlink: target.permlink, parent_author: target.parent_author, parent_permlink: target.parent_permlink, created: target.created, replaceDuplicate: true, replaceTitleOnly: false, expectedTitle: target.title };
    fs.writeFileSync("article.json", JSON.stringify(article, null, 2));
    console.log("Approved first article loaded without another AI call.");
    return;
  }
  const articleNumber = target?.remainingPlaceholders ? (187 - target.remainingPlaceholders) : target?.replaceDuplicate ? target.replacementIndex : 0;
  const topics = ["the Beetle’s overall rounded silhouette","the way curved lines connect across the body","the visual balance of front and rear","how a rounded form stands out among angular sh"]; 
  const topic = target ? topics[(articleNumber - 1) % topics.length] : topics[0];
  const previousTitles = (target?.previousTitles || existingTitles.slice(0, 100)).join(" | ") || "none";
  const repairPrompt = target?.replaceDuplicate
        ? [
          "You are revising an existing Steemit article because its title is repeated. Preserve the original article's subject and key meaning; do not turn it into a different topic.",
          "Article number: " + articleNumber,
          "Original title: " + String(target.title || ""),
          "Source article text (use this as the factual source; it may be truncated):\n" + String(target.body || "").slice(0, 8000),
          "Do not reuse or closely paraphrase these previous titles: " + previousTitles,
          "Use only points supported by the source text. Do not invent dates, technical specifications, prices, statistics, named people or places, or personal experience. Do not use digits. Avoid claims based on personal taste over the article's evidence.",
          subjectiveMarkerPrompt()
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
  const legacyPrompt = "\nあなたは「空冷かずひろ」のSteemit多言語投稿AIです。\nテーマは、空冷VWの文化、歴史、日本の旧車事情、イベント、デザインに関する穏やかな文章です。\n一貫した事実ベースの内容にし、過去のタイトルと似すぎないようにしてください。\nReturn JSON with title, body_ja, body_en, body_es, body_ko.";
  const prompt = target ? repairPrompt : legacyPrompt + "\n\n" + subjectiveMarkerPrompt() + "\n\nDo not reuse or closely paraphrase these previous titles: " + previousTitles;
  const article = await generateDraft(prompt, target, existingTitles);
  fs.writeFileSync("article.json", JSON.stringify(article, null, 2));
  console.log("✔ 整備固定記事生成完了: article.json に保存しました");
}

generate();
