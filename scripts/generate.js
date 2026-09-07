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

英語タイトルは必ず以下の語彙を含める：
Air-cooled Beetle / Classic Car / Japan / Fujioka / Daily Life / Maintenance / Memories

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
  console.log("✔ 多言語記事生成完了: article.json に保存しました");
}

generate();
