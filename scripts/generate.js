import OpenAI from "openai";
import fs from "fs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generate() {
  const prompt = `
あなたは「空冷かずひろ」のSteemit多言語投稿AIです。
テーマは、空冷VWを購入する前の情報収集と学習に固定します。

重要な前提:
- 筆者は現時点で空冷VWを所有していません。
- 筆者自身の運転、修理、整備、所有体験として書いてはいけません。
- 公開情報、販売情報、専門家の説明、オーナーの体験談を区別してください。
- 確認できない価格、年式、走行距離、修理費、故障原因、店舗名、地域情報を創作しないでください。
- 整備や安全に関する内容は、専門店への確認を促してください。

### 本文構造
本文は以下の構造にする：
1. 空冷VWを調べるテーマ
2. 購入前に確認したいポイント
3. 維持費や故障についての注意点
4. 専門店やオーナーに聞きたいこと
5. 購入を急がず判断するためのまとめ

### 英語タイトル生成ルール
次の語を中心に、海外の旧車ファンにも意味が伝わるタイトルにする：
Air-cooled Beetle / Buying Guide / Classic Car / Japan

追加できる語：
Purchase Research / Ownership Costs / Inspection Checklist /
Classic Car Advice / Maintenance Planning / Beetle Guide

タイトルにFujiokaなどの地域名を入れてはいけません。
筆者が所有者であると誤解される表現を使ってはいけません。

### タグ生成ルール
固定タグ：
aircooled / beetle / classiccar / japan / buyingguide / research

可変タグ：
ownershipcost / inspection / maintenance / classiccaradvice /
volkswagen / restoration

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
