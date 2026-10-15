import OpenAI from "openai";
import fs from "fs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function rpc(method, params) {
  const response = await fetch("https://api.steemit.com", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }) });
  if (!response.ok) throw new Error("Steem RPC HTTP " + response.status);
  const payload = await response.json();
  if (payload.error) throw new Error("Steem RPC error: " + JSON.stringify(payload.error));
  return payload.result;
}

async function findOldestPlaceholder() {
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
        for (const item of chronological.slice(1)) replacements.push({ ...item, replaceDuplicate: true, expectedTitle: item.title });
      }
      replacements.sort((x, y) => String(x.created).localeCompare(String(y.created)));
      const previousTitles = [...new Set(existingTitles)].slice(0, 100);
      if (replacements.length) {
        const selected = replacements[0];
        selected.remainingDuplicates = replacements.length;
        selected.replacementIndex = Math.floor(Date.parse(selected.created) / 86400000);
        selected.previousTitles = previousTitles;
        return selected;
      }
      const sorted = [...found.values()].sort((x, y) => x.created.localeCompare(y.created));
      if (!sorted.length) return null;
      sorted[0].remainingPlaceholders = sorted.length;
      sorted[0].previousTitles = previousTitles.slice(0, 30);
      return sorted[0];
    }
    
async function generateDraft(prompt, target) {
  let retryPrompt = prompt;
  let rejection = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You generate high-quality multilingual JSON for Steemit." },
        { role: "user", content: retryPrompt }
      ],
      response_format: { type: "json_object" }
    });
    const article = JSON.parse(response.choices[0].message.content);
    article.target = target ? { author: target.author, permlink: target.permlink, parent_author: target.parent_author, parent_permlink: target.parent_permlink, created: target.created, replaceDuplicate: Boolean(target.replaceDuplicate), expectedTitle: target.expectedTitle } : null;
    rejection = validateDraft(article, target);
    if (!rejection) return article;
    if (attempt < 3) {
      console.warn("Draft rejected by factuality guard; requesting a safer rewrite (attempt " + (attempt + 1) + "/3): " + rejection);
      retryPrompt += "\n\n" + buildRetryInstruction(rejection) + " Rewrite all four language versions from scratch, keep their meaning aligned, and do not introduce unsupported claims.";
    }
  }
  throw new Error(rejection || "Draft failed factuality validation");
}

function buildRetryInstruction(rejection) {
  const missingMarker = rejection.match(/^Draft rejected: (body_(?:ja|en|es|ko)) lacks cautious, subjective wording$/);
  if (missingMarker) {
    const examples = { body_ja: "印象, 感じます, 見えます, かもしれません, ように見えます", body_en: "seem, seems, impression, may, might, could", body_es: "parece, impresión, puede, podría", body_ko: "느낌, 인상, 듯, 수 있, 보일" };
    const field = missingMarker[1];
    return "Validation feedback: " + field + " needs explicit subjective wording. Add at least one exact phrase from this accepted list to that body: " + examples[field] + ". Keep it as a visual impression, not a factual claim.";
  }
  const guardedTerm = rejection.match(/^Draft rejected by factuality guard: (.+)$/);
  if (guardedTerm) return "Validation feedback: remove the exact guarded term or unsupported claim \"" + guardedTerm[1] + "\" from the article. Do not replace it with a different factual claim.";
  return "Validation feedback: correct this issue without adding unsupported factual claims: " + rejection + ".";
}

function validateDraft(article, target) {
  if (!target) return null;
  const articleText = [article.title, article.body_ja, article.body_en, article.body_es, article.body_ko].join("\n");
  const riskyPatterns = ["[0-9]", "safe|safety|security|drive|driving|repair|maintenance|production|manufactur|histor|popular|famous|many people|loved|every year|owners?|events?|market|experts?|functionality|worldwide|all other|timeless|always|everyone", "安全|安心|運転|ドライブ|修理|整備|生産|製造|歴史|人気|多くの人|愛され|毎年|イベント|市場|所有者|オーナー|専門家|機能性|世界中|すべて|全て|唯一|最も", "seguridad|conducir|manejo|reparación|reparacion|mantenimiento|producción|produccion|historia|popular|amado|cada año|evento|mercado|propietario|experto|funcionalidad|todos|siempre|atemporal", "안전|운전|정비|수리|생산|인기|사랑받|매년|행사|시장|소유자|전문가|기능성|역사|모든|세계|기능"].map(value => new RegExp(value, "i"));
  const risky = riskyPatterns.find(pattern => pattern.test(articleText));
  if (risky) return "Draft rejected by factuality guard: " + (articleText.match(risky)?.[0] || risky.source);
  const markers = { body_ja: ["印象", "感じ", "見え", "かもしれない", "ように"], body_en: ["seem", "impression", "may", "might", "could"], body_es: ["parece", "impresión", "impresion", "puede", "podría", "podria"], body_ko: ["느낌", "인상", "듯", "수 있", "보일"] };
  for (const [field, choices] of Object.entries(markers)) {
    const text = typeof article[field] === "string" ? article[field] : "";
    if (!choices.some(marker => text.toLowerCase().includes(marker.toLowerCase()))) return "Draft rejected: " + field + " lacks cautious, subjective wording";
  }
  return null;
}

async function generate() {
  const target = await findOldestPlaceholder();
  const weekdayJst = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", weekday: "short" }).format(new Date());
  const regularPostDay = weekdayJst === "Sat" || weekdayJst === "Sun";
  if (!target && !regularPostDay) {
    fs.writeFileSync("article.json", JSON.stringify({ skip: true, reason: "no_replacement_target" }));
    console.log("No replacement target remains; weekday post skipped.");
    return;
  }
  if (target && target.permlink === "3tmtka" && process.env.GITHUB_REF === "refs/heads/main" && process.env.GITHUB_EVENT_NAME === "schedule") {
    const article = {"title":"The Beetle’s Rounded Lines: A Design That Invites a Closer Look","body_ja":"ビートルを見たとき、まず目に入るのは、車全体をつなぐ丸い輪郭です。前から横へ、そして後ろへと続く曲線には、角ばった形とは違うやわらかさがあります。\n\nこの魅力は、数値や仕様を知らなくても楽しめます。写真の中でも、イベントで実車を見かけたときでも、少し離れて眺めると、丸みのある形が周囲の景色に独特の印象を加えていることに気づきます。\n\n空冷VWに詳しい人はもちろん、初めて関心を持った人にとっても、デザインは親しみやすい入口です。ビートルの輪郭を眺めることから、その車を大切にする人たちの文化にも興味が広がっていきます。","body_en":"The first thing many people notice about a Beetle is its rounded outline. The curves running from the front, along the sides, and toward the rear create a softer impression than a sharply angular shape.\n\nYou do not need to know technical specifications to appreciate that impression. Whether you see the car in a photograph or in person at an event, stepping back for a moment makes it easier to notice how its rounded form changes the way it sits in the surrounding scene.\n\nFor longtime air-cooled VW fans and newcomers alike, design is an approachable starting point. Looking at the Beetle’s outline can lead to a wider interest in the culture of people who care for these cars.","body_es":"Lo primero que muchas personas notan de un Beetle es su silueta redondeada. Las curvas que van del frente, recorren los laterales y llegan hasta la parte trasera crean una impresión más suave que una forma de líneas angulosas.\n\nNo hace falta conocer las especificaciones técnicas para apreciar esa impresión. Tanto en una fotografía como al verlo en persona en un evento, tomar cierta distancia ayuda a observar cómo su forma redondeada cambia la presencia del automóvil en el paisaje.\n\nPara quienes llevan tiempo interesados en los VW refrigerados por aire y para quienes recién los descubren, el diseño es un punto de partida accesible. Observar el contorno del Beetle puede despertar interés por la cultura de las personas que cuidan estos autos.","body_ko":"비틀을 볼 때 많은 사람이 먼저 알아차리는 것은 둥근 윤곽입니다. 앞부분에서 옆면을 따라 뒤쪽으로 이어지는 곡선은 각진 형태와는 다른 부드러운 인상을 줍니다.\n\n이 느낌을 즐기기 위해 기술 사양을 알 필요는 없습니다. 사진으로 보든 행사에서 실제로 보든, 조금 떨어져 바라보면 둥근 형태가 주변 풍경 속에서 자동차의 인상을 어떻게 만드는지 살펴볼 수 있습니다.\n\n오랫동안 공랭식 폭스바겐에 관심을 가져온 사람에게도, 이제 막 관심을 갖기 시작한 사람에게도 디자인은 쉽게 다가갈 수 있는 출발점입니다. 비틀의 윤곽을 바라보는 일은 이 차를 아끼는 사람들의 문화에 대한 관심으로 이어질 수 있습니다.","tags":["aircooled","beetle","classiccar","japan","vwculture","design"]};
    article.target = { author: target.author, permlink: target.permlink, parent_author: target.parent_author, parent_permlink: target.parent_permlink, created: target.created, replaceDuplicate: Boolean(target.replaceDuplicate), expectedTitle: target.expectedTitle };
    fs.writeFileSync("article.json", JSON.stringify(article, null, 2));
    console.log("Approved first article loaded without another AI call.");
    return;
  }
  const articleNumber = target?.remainingPlaceholders ? (187 - target.remainingPlaceholders) : target?.replaceDuplicate ? target.replacementIndex : 0;
  const topics = ["the Beetle’s overall rounded silhouette","the way curved lines connect across the body","the visual balance of front and rear","how a rounded form stands out among angular shapes","how color can change the impression of a car","the way light and reflections can emphasize curves","how viewing distance changes the impression of proportions","how the car’s outline appears from different angles","the visual rhythm between body and wheels, noting that details vary","how personal choices can change a car’s visual character","the balance between preserving a familiar look and adding personal touches","how a car’s shape reads differently in photographs and in person"];
  const topic = target ? topics[(articleNumber - 1) % topics.length] : topics[0];
  const previousTitles = target ? target.previousTitles.join(" | ") : "none";
  const repairPrompt = target?.replaceDuplicate
        ? [
          "You are revising an existing Steemit article because its title is repeated. Preserve the original article's subject and key meaning; do not turn it into a different topic.",
          "Article number: " + articleNumber,
          "Original title: " + String(target.title || ""),
          "Source article text (use this as the factual source; it may be truncated):\n" + String(target.body || "").slice(0, 8000),
          "Do not reuse or closely paraphrase these previous titles: " + previousTitles,
          "Use only points supported by the source text. Do not invent dates, technical specifications, prices, statistics, named people or places, or personal experience. Do not use digits. Avoid claims about safety, popularity, history, or owners unless the source directly supports them. Write three concise paragraphs per language. Each body must include at least one explicit subjective marker: Japanese use 印象, 感じます, 見えます, かもしれません, or ように見えます; English use seem, seems, impression, may, might, or could; Spanish use parece, impresión, puede, or podría; Korean use 느낌, 인상, 듯, 수 있, or 보일. Return only JSON with a specific, distinct English title, body_ja, body_en, body_es, body_ko, and relevant lowercase ASCII tags."
        ].join("\n")
        : [
          "You are writing one original, gentle design essay about an air-cooled VW for a multilingual Steemit audience.",
          "Article number: " + articleNumber,
          "Visual topic: " + topic,
          "Do not repeat or closely paraphrase these previous titles: " + previousTitles,
          "Critical accuracy rules: No sources are provided, so write only subjective visual interpretation. Do not state historical facts, dates, model years, technical specifications, production or market facts, event frequency, prices, statistics, named people or places, or claims about what owners usually do. Do not invent personal ownership or maintenance experience. Avoid claims that apply to every Beetle; details vary. Do not use digits or numeric claims. Phrase impressions as impressions, not facts. Avoid generic claims of popularity or cultural significance.",
          "Write three concise paragraphs per language. Japanese, English, Spanish, and Korean must convey the same ideas naturally. Return only JSON with title (English), body_ja, body_en, body_es, body_ko, and tags. Use a specific, non-generic English title. Tags should be relevant and use lowercase ASCII."
        ].join("\n")
  const legacyPrompt = "\nあなたは「空冷かずひろ」のSteemit多言語投稿AIです。\nテーマは、空冷VWの文化、歴史、日本の旧車事情、イベント、デザインを海外読者に紹介する内容に固定します。\n\n重要な前提:\n- 筆者は現時点で空冷VWを所有していません。\n- 筆者自身の運転、修理、整備、所有体験として書いてはいけません。\n- 公開情報、歴史資料、イベント観察、専門家の説明、オーナーの話を区別してください。\n- 確認できない年式、仕様、価格、店舗名、地域情報、出来事を創作しないでください。\n- 整備や安全に関する内容は一般的な知識にとどめ、専門店への確認を促してください。\n\n### 本文構造\n本文は以下の構造にする：\n1. 紹介する文化・歴史・イベントのテーマ\n2. 背景や用語の説明\n3. 日本の空冷VW文化との関係\n4. 海外読者にも伝わる見どころ\n5. 事実と個人の感想を分けたまとめ\n\n### 英語タイトル生成ルール\n次の語を中心に、海外の旧車ファンにも意味が伝わるタイトルにする：\nAir-cooled Beetle / VW History / Classic Car Culture / Japan\n\n追加できる語：\nJapanese Car Culture / Beetle History / Design Story /\nVW Event / Classic Car Community / Air-cooled Culture\n\nタイトルにFujiokaなど確認できない地域名を入れてはいけません。\n筆者が所有者であると誤解される表現を使ってはいけません。\n\n### タグ生成ルール\n固定タグ：\naircooled / beetle / classiccar / japan / vwculture / history\n\n可変タグ：\nhistory / design / event / community / japaneseclassiccar / volkswagen\n\n### 出力形式\n{\n  \"title\": \"英語タイトル\",\n  \"body_ja\": \"本文（日本語）\",\n  \"body_en\": \"本文（英語）\",\n  \"body_es\": \"本文（スペイン語）\",\n  \"body_ko\": \"본문 (한국어)\",\n  \"tags\": [\"固定タグ＋可変タグ\"]\n}";
  const prompt = target ? repairPrompt : legacyPrompt;
  const article = await generateDraft(prompt, target);
  fs.writeFileSync("article.json", JSON.stringify(article, null, 2));
  console.log("✔ 整備固定記事生成完了: article.json に保存しました");
}

generate();
