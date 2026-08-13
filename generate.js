import OpenAI from "openai";
import fs from "fs";

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

  fs.writeFileSync("post.md", md);
  console.log("AI が Markdown を生成しました");
}

main();
