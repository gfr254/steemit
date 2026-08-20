import OpenAI from "openai";
import fs from "fs";

// --- 7日ローテーションテーマ ---
const beetleThemes = [
  "空冷ビートルの歴史と誕生秘話",
  "空冷ビートルの整備日記（今日のメンテ）",
  "空冷ビートルの豆知識・トリビア",
  "空冷ビートルの旅記録（ドライブ日記）",
  "空冷ビートルの部品紹介・カスタム",
  "空冷ビートルの故障あるあると対策",
  "空冷ビートルの写真ギャラリー（AI画像生成）"
];

// --- 今日のテーマを決定 ---
const todayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24)) % beetleThemes.length;
const todayTheme = beetleThemes[todayIndex];

console.log("今日のテーマ:", todayTheme);

// --- OpenAI API ---
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// --- 記事生成 ---
async function generateArticle() {
  const prompt = `
あなたは空冷ビートル専門のブロガーです。
今日のテーマは「${todayTheme}」です。

Steemit向けに、読みやすく、専門的で、親しみやすい記事を書いてください。
見出し、箇条書き、整備ポイント、歴史的背景、旅の描写などを含めてください。
`;

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are a professional blogger." },
      { role: "user", content: prompt }
    ]
  });

  const article = completion.choices[0].message.content;

  fs.writeFileSync("article.txt", article);
  console.log("記事生成完了: article.txt に保存しました");
}

generateArticle();
