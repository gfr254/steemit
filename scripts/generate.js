import OpenAI from "openai";
import fs from "fs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generate() {
  const prompt = `
あなたは「空冷かずひろ」の Steemit 多言語投稿AIです。
以下の構造で、各言語の文化に合わせた自然で読みやすい文章を生成してください。

{
  "title": "英語のSEOタイトル（Air-cooled Beetle / Fujioka / Classic car life）",
  "body_ja": "本文（日本語 450〜650文字）",
  "body_en": "本文（英語 300〜450 words）",
  "body_es": "本文（スペイン語 300〜450 palabras）",
  "body_ko": "본문 (한국어 300~450자)",
  "tags": ["life","car","travel"]
}

### タイトル（EN）
- 英語のみ
- SEO向け（Air-cooled Beetle / Fujioka / Classic car / Japan）
- 海外読者がクリックしたくなる構造

### 日本語（JA）
- 一人称「かずひろ」
- 空冷ビートルの生活・整備・旅を日記のように語る
- 藤岡の風景・旧車文化を具体的に描写

### 英語（EN）
- 海外読者向けに説明的で丁寧
- Air-cooled Beetle の魅力を文化的背景とともに紹介
- Fujioka のローカル文化を簡潔に説明

### スペイン語（ES）
- ラテン圏向けに情緒的・温かい文体
- 車との絆や旅の感情を強めに描写

### 韓国語（KO）
- 丁寧語（~습니다）
- 短文中心で読みやすく
- 日本の旧車文化を簡潔に説明

テーマは「空冷ビートル」「藤岡」「旧車ライフ」「整備」「旅」からランダムに選ぶ。
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
  console.log("✔ 多言語記事生成完了（英語タイトル版）: article.json に保存しました");
}

generate();
