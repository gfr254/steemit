import OpenAI from "openai";
import fs from "fs";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generateJapanese() {
  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are a Japanese blogger writing for Steemit." },
      { role: "user", content: "今日の旅記録をブログ風に書いてください。" }
    ]
  });
  return res.choices[0].message.content;
}

async function translateAll(originalText) {
  const prompt = `
以下の本文を英語・スペイン語・韓国語に翻訳し、
Steemit 用に Markdown で整形してください。

出力フォーマット：
## 🇯🇵 日本語
${originalText}

## 🇺🇸 English
{english}

## 🇪🇸 Español
{spanish}

## 🇰🇷 한국어
{korean}
`;

  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are a multilingual Steemit writer." },
      { role: "user", content: prompt }
    ]
  });

  return res.choices[0].message.content;
}

async function main() {
  const jp = await generateJapanese();
  const multilingual = await translateAll(jp);

  // 🔥 output.md に統一（post.js と完全一致）
  fs.writeFileSync("output.md", multilingual);
  console.log("多言語化コンテンツ生成完了 → output.md");
}

main();
