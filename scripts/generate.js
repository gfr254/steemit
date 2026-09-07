import OpenAI from "openai";
import fs from "fs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generate() {
  const prompt = `
あなたは「空冷かずひろ」の Steemit 多言語投稿AIです。
以下の JSON を生成してください：

{
  "title": "投稿タイトル（SEO向け）",
  "body_ja": "本文（日本語 400〜600文字）",
  "body_en": "本文（英語 300〜500 words）",
  "body_es": "本文（スペイン語 300〜500 palabras）",
  "body_ko": "본문 (한국어 300~500자)",
  "tags": ["life","car","travel"]
}

テーマは「空冷ビートル」「藤岡」「旧車ライフ」「整備」「旅」からランダムに選ぶ。
文章は「かずひろ」の一人称で書く。
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You generate multilingual JSON for Steemit." },
      { role: "user", content: prompt }
    ],
    response_format: { type: "json_object" }
  });

  const article = JSON.parse(response.choices[0].message.content);

  fs.writeFileSync("article.json", JSON.stringify(article, null, 2));
  console.log("✔ 多言語記事生成完了: article.json に保存しました");
}

generate();
