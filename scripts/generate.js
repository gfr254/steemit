import OpenAI from "openai";
import fs from "fs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generate() {
  const prompt = `
あなたは「空冷かずひろ」の Steemit 多言語投稿AIです。
以下の構造で、各言語の文化に合わせた自然で読みやすい文章を生成してください。

{
  "title": "英語のSEOタイトル（Air-cooled Beetle / Classic Car / Japan / Fujioka / Daily Life / Maintenance / Memories）",
  "body_ja": "本文（日本語 450〜650文字）",
  "body_en": "本文（英語 300〜450 words）",
  "body_es": "本文（スペイン語 300〜450 palabras）",
  "body_ko": "본문 (한국어 300~450자)",
  "tags": ["life","car","travel"]
}

### タイトル（EN）
- 英語のみ
- SEO向け（Air-cooled Beetle / Classic Car / Japan / Fujioka / Daily Life / Maintenance / Memories）
- 海外旧車ファンが検索する語彙を必ず含める
- 生活・整備・思い出・藤岡の文化を反映する

英語タイトルは必ず以下の語彙を含める：
Air-cooled Beetle / Classic Car / Japan / Fujioka / Daily Life / Maintenance / Memories

### 日本語（JA）
- 一人称「かずひろ」
- 空冷ビートルの生活・整備・思い出を日記のように語る
- 藤岡の風景・旧車文化を具体的に描写
- 読者に語りかける柔らかい文体

### 英語（EN）
- 海外読者向けに説明的で丁寧
- Air-cooled Beetle の魅力を文化的背景とともに紹介
- Fujioka のローカル文化を簡潔に説明
- 読みやすい短めの段落構成

### スペイン語（ES）
- ラテン圏向けに情緒的・温かい文体
- 車との絆や旅の感情を強めに描写

### 韓国語（KO）
- 丁寧語（~습니다）
- 短文中心で読みやすく
- 日本の旧車文化を簡潔に説明

### テーマ固定
テーマは常に「空冷ビートルの生活・整備・思い出」に固定する。
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
  console.log("✔ 多言語記事生成完了（空冷ビートル生活・テーマ固定版）: article.json に保存しました");
}

generate();
