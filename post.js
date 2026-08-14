import { Client } from 'dsteem';
import fs from 'fs';

const client = new Client('https://api.steemit.com');

// 投稿者のアカウント名
const author = 'あなたのSteemitユーザー名';

// AI が生成した Markdown を読み込む
const body = fs.readFileSync('post.md', 'utf8');

// パーマリンクを生成（毎回ユニーク）
const permlink = 'ai-post-' + Date.now();

// 投稿データ
const comment = {
  parent_author: "",              // ← ここが絶対に空文字でないとダメ
  parent_permlink: "blog",        // blog で OK
  author: author,
  permlink: permlink,
  title: "AI Auto Generated Post",
  body: body,
  json_metadata: JSON.stringify({
    tags: ["ai", "blog"],
    app: "steemit-auto-writer"
  })
};

// 投稿実行
client.broadcast.comment(comment, process.env.STEEM_POST_KEY)
  .then(result => {
    console.log("Post success:", result);
  })
  .catch(error => {
    console.error("Post failed:", error);
  });
