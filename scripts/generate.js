import OpenAI from "openai";
import fs from "fs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generate() {
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
      { role: "user", content: prompt }
    ],
    response_format: { type: "json_object" }
  });

  const article = JSON.parse(response.choices[0].message.content);

  fs.writeFileSync("article.json", JSON.stringify(article, null, 2));
  console.log("✔ 整備固定記事生成完了: article.json に保存しました");
}

generate();
