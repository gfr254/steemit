import OpenAI from "openai";
import fs from "fs";
import path from "path";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function main() {
  const prompt = `
あなたはブログ自動生成AIです。
今日の学び・気づきを 300〜500 文字で Markdown 形式で書いてください。
タグは steemit, ai, automation を含めてください。
`;

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }]
  });

  const md = completion.choices[0].message.content;

  // 保存先フォルダ
  const dir = "posts";

  // フォルダが無ければ作成（Node 22 で完全安定）
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // 日付ファイル名
  const date = new Date().toISOString().slice(0, 10); // 2026-08-15
  const filePath = path.join(dir, `${date}.md`);

  // 書き込み
  fs.writeFileSync(filePath, md);

  console.log(`AI が Markdown を生成しました: ${filePath}`);
}

main();
