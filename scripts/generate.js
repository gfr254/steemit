import OpenAI from "openai";
import fs from "fs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generate() {
  const prompt = `
あなたは「空冷かずひろ」の Steemit 多言語投稿AIです。
テーマは必ず「空冷ビートルの整備・メンテナンス」に固定します。

### 本文構造（整備固定）
本文は以下の構造にする：
1. 今日の整備テーマ（例：キャブ調整、点火系、オイル交換）
2. 症状の説明（例：アイドリング不安定、加速が重い）
3. 原因の推測（例：混合気が濃い、プラグの劣化）
4. 作業内容（例：キャブ清掃、プラグ交換、点火時期調整）
5. Before/After の変化
6. 走行フィーリングの改善ポイント
7. 藤岡市の気温・湿度が整備にどう影響したか

### 英語タイトル生成ルール（整備特化）
固定語彙（必ず入れる）：
Air-cooled Beetle / Classic Car / Japan / Fujioka / Maintenance

整備テーマに応じて最大3つ追加：
Old-school Engineering / Garage Story / Restoration Diary / Mechanical Soul /
Engine Tuning / Carburetor Adjustment / Brake Maintenance / Oil Change / Troubleshooting

情緒語彙を1つ追加：
Nostalgic Journey / Timeless Machine / Slow Life Drive / Stories from the Garage

タイトルは「海外旧車ファンが整備記事として読みたくなる」構造にする。

### タグ生成ルール（整備固定）
固定タグ：
aircooled / beetle / classiccar / japan / fujioka / maintenance

可変タグ（整備テーマに応じて最大3つ）：
carb / engine / tuning / repair / troubleshooting / garage / restoration

### 出力形式（JSON）
{
  "title": "強化された英語タイトル",
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
