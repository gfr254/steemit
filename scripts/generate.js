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
  const found = new Map(); let cursor = null;
  for (let page = 0; page < 10; page++) {
    const rows = await rpc("condenser_api.get_discussions_by_blog", [{ tag: author, limit: 100, ...(cursor ? { start_author: cursor.author, start_permlink: cursor.permlink } : {}) }]);
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const item of rows) if (item.author === author && item.title === "*" && item.body === "*") found.set(item.permlink, item);
    const last = rows[rows.length - 1]; if (cursor && last.author === cursor.author && last.permlink === cursor.permlink) break;
    cursor = { author: last.author, permlink: last.permlink }; if (rows.length < 100) break;
  }
  return [...found.values()].sort((a,b) => a.created.localeCompare(b.created))[0] || null;
}

async function generate() {
  const target = await findOldestPlaceholder();
  const prompt = `
あなたは「空冷かずひろ」のSteemit多言語投稿AIです。
テーマは、空冷VWの文化、歴史、日本の旧車事情、イベント、デザインを海外読者に紹介する内容に固定します。

重要な前提:
- 筆者は現時点で空冷VWを所有していません。
- 筆者自身の運転、修理、整備、所有体験として書いてはいけません。
- 公開情報、歴史資料、イベント観察、専門家の説明、オーナーの話を区別してください。
- 確認できない年式、仕様、価格、店舗名、地域情報、出来事を創作しないでください。
- 整備や安全に関する内容は一般的な知識にとどめ、専門店への確認を促してください。

### 本文構造
本文は以下の構造にする：
1. 紹介する文化・歴史・イベントのテーマ
2. 背景や用語の説明
3. 日本の空冷VW文化との関係
4. 海外読者にも伝わる見どころ
5. 事実と個人の感想を分けたまとめ

### 英語タイトル生成ルール
次の語を中心に、海外の旧車ファンにも意味が伝わるタイトルにする：
Air-cooled Beetle / VW History / Classic Car Culture / Japan

追加できる語：
Japanese Car Culture / Beetle History / Design Story /
VW Event / Classic Car Community / Air-cooled Culture

タイトルにFujiokaなど確認できない地域名を入れてはいけません。
筆者が所有者であると誤解される表現を使ってはいけません。

### タグ生成ルール
固定タグ：
aircooled / beetle / classiccar / japan / vwculture / history

可変タグ：
history / design / event / community / japaneseclassiccar / volkswagen

### 出力形式
{
  "title": "英語タイトル",
  "body_ja": "本文（日本語）",
  "body_en": "本文（英語）",
  "body_es": "本文（スペイン語）",
  "body_ko": "본문 (한국어)",
  "tags": ["固定タグ＋可変タグ"]
}
`;
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You generate high-quality multilingual JSON for Steemit." },
      { role: "user", content: prompt + (target ? "\n\n編集対象の元投稿日: " + target.created + "。既存投稿を編集するため、permlinkを変えない。" : "\n\n編集対象なし。通常の新規記事を生成する。") }
    ],
    response_format: { type: "json_object" }
  });

  const article = JSON.parse(response.choices[0].message.content);
  article.target = target ? { author: target.author, permlink: target.permlink, parent_author: target.parent_author, parent_permlink: target.parent_permlink, created: target.created } : null;

  fs.writeFileSync("article.json", JSON.stringify(article, null, 2));
  console.log("✔ 整備固定記事生成完了: article.json に保存しました");
}

generate();
