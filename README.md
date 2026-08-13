今日
steemit github を使用して自動コンテンツ作成自動投稿を実現したい
結論：Steemit への “自動コンテンツ生成＋自動投稿” は、VS Code（Web版でもOK）＋ GitHub Actions の組み合わせで完全自動化できます。  
あなたがすでに進めている「post.js＋GitHub Actions」の構成に、AIによる自動執筆（Markdown生成）→ 自動投稿を追加するだけで完成します。

Steemit 公式 API は dsteem を使うのが標準で、GitHub Actions での自動投稿はすでに多くの事例があります（例：AI生成記事を GitHub Actions で毎日投稿しているリポジトリ）。

🎯 最終構成（あなた向けに最適化）
GitHub Actions が毎日 AI に Markdown を生成させる（自動執筆）

生成された Markdown を Node.js（dsteem）で Steemit に投稿（自動投稿）

PC を開かなくても毎日ブログが自動生成されて投稿される

🧠 全体フロー（図解）
コード
[GitHub Actions]
     ↓（毎日 AM1:00）
[AI で Markdown 生成]
     ↓
[post.js が Steemit に投稿]
     ↓
[Steemit に自動公開]
🛠️ ① AI に自動で Markdown を生成させる（GitHub Actions 内）
あなたのリポジトリに generate.js を追加します。

generate.js（AI に Markdown を書かせる例）
js
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
🛠️ ② dsteem で Steemit に投稿する（post.js）
あなたが使っている構成をそのまま利用できます。

post.js（Markdown を読み込んで投稿）
js
const dsteem = require('dsteem');
const fs = require('fs');

const client = new dsteem.Client('https://api.steemit.com');
const privateKey = dsteem.PrivateKey.fromString(process.env.STEEM_POST_KEY);

async function main() {
  const author = 'あなたのSteemitユーザー名';
  const permlink = 'auto-post-' + Date.now();
  const title = 'AI 自動生成ブログ';
  const body = fs.readFileSync('post.md', 'utf8');

  const jsonMetadata = { tags: ['steemit', 'ai', 'automation'], app: 'vscode-steemit' };

  const op = [
    'comment',
    {
      parent_author: '',
      parent_permlink: 'blog',
      author,
      permlink,
      title,
      body,
      json_metadata: JSON.stringify(jsonMetadata)
    }
  ];

  await client.broadcast.sendOperations([op], privateKey);
  console.log('Steemit に投稿完了');
}

main();
🛠️ ③ GitHub Actions（自動執筆＋自動投稿）
.github/workflows/steemit.yml

yaml
name: Steemit Auto Writer & Post

on:
  schedule:
    - cron: '0 1 * * *'   # JST 10:00
  workflow_dispatch:

jobs:
  auto-post:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '18'

      - run: npm install

      # AI が Markdown を生成
      - run: node generate.js
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}

      # Steemit に投稿
      - run: node post.js
        env:
          STEEM_POST_KEY: ${{ secrets.STEEM_POST_KEY }}
🔐 GitHub Secrets に登録するもの
OPENAI_API_KEY（AI 生成用）

STEEM_POST_KEY（Steemit Posting Key）

📌 これでできること
毎日自動でブログが生成される

Steemit に自動投稿される

VS Code を開かなくても動く

あなたの既存の構成に完全フィット
