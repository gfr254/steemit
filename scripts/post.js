import { Client } from 'dsteem';
import fs from 'fs';
import OpenAI from "openai";

const client = new Client('https://api.steemit.com');

// --- Author & Key validation ---
const author = process.env.STEEM_USERNAME;
const postingKey = process.env.STEEM_POST_KEY;

if (!author || author.trim() === "") {
  console.error("❌ ERROR: STEEM_USERNAME が設定されていません（author が undefined）");
  process.exit(1);
}

if (!postingKey || postingKey.trim() === "") {
  console.error("❌ ERROR: STEEM_POST_KEY が設定されていません（posting key が undefined）");
  process.exit(1);
}

console.log("✔ AUTHOR:", author);
console.log("✔ POSTING KEY length:", postingKey.length);

// --- AIタイトル生成 ---
async function generateTitle() {
  const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const prompt = `
あなたは Steemit ブログのタイトルを作るAIです。
今日の出来事として自然で魅力的なタイトルを1つだけ生成してください。
30文字以内、日本語。
`;

  const result = await ai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }]
  });

  return result.choices[0].message.content.trim();
}

// --- AIタグ生成 ---
async function generateTags(bodyText) {
  const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const prompt = `
以下の本文から Steemit 用のタグを抽出してください。
・最大5個
・英語タグ
・短く
・本文の内容に関連するものだけ
・配列形式で返す（例: ["ai","blog","tech"]）

本文:
${bodyText}
`;

  const result = await ai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }]
  });

  // AIの返答をそのまま配列として扱う
  try {
    return JSON.parse(result.choices[0].message.content);
  } catch (e) {
    console.error("⚠ タグ解析失敗。fallbackとして ['ai','blog'] を使用");
    return ["ai", "blog"];
  }
}

// --- メイン処理 ---
async function main() {
  console.log("🎯 AIタイトル生成中...");
  const title = await generateTitle();
  console.log("✔ タイトル:", title);

  // 本文読み込み
  const body = fs.readFileSync('output.md', 'utf8');

  console.log("🏷 AIタグ生成中...");
  const tags = await generateTags(body);
  console.log("✔ タグ:", tags);

  // パーマリンク生成
  const permlink = 'ai-post-' + Date.now();

  // 投稿データ
  const comment = {
    parent_author: "",
    parent_permlink: "blog",
    author: author,
    permlink: permlink,
    title: title,
    body: body,
    json_metadata: JSON.stringify({
      tags: tags,
      app: "steemit-auto-writer"
    })
  };

  console.log("🚀 Steemit 投稿中...");
  client.broadcast.comment(comment, postingKey)
    .then(result => {
      console.log("🎉 投稿成功:", result);
    })
    .catch(error => {
      console.error("❌ 投稿失敗:", error);
    });
}

main();
