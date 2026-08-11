import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const file = path.join('posts', `${today}.md`);

  const prompt = `
以下のテンプレートに沿って Steemit 投稿用の Markdown を生成してください。
テーマ：今日の学び
文体：丁寧・読みやすい
長さ：800〜1200文字

---
title: 今日の学び
tags: [steemit, ai, automation]
---

`;

  const completion = await client.responses.create({
    model: "gpt-4.1-mini",
    input: prompt
  });

  fs.writeFileSync(file, completion.output_text);
}

main();

