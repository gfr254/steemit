import steem from "steem";
import fs from "fs";

const wif = process.env.STEEM_POST_KEY;

// --- 記事読み込み ---
const article = fs.readFileSync("article.txt", "utf-8");

// --- タグ自動付与（空冷ビートル専用） ---
const tags = [
  "beetle",
  "aircooled",
  "vw",
  "classiccar",
  "japan",
  "blog"
];

// --- 投稿データ ---
const post = {
  author: "gfr254",
  title: "【空冷ビートル】今日の自動投稿",
  body: article,
  json_metadata: JSON.stringify({ tags })
};

// --- 投稿処理 ---
steem.broadcast.comment(
  wif,
  "",        // 親投稿なし
  "beetle",  // カテゴリ
  post.author,
  Date.now().toString(),
  post.title,
  post.body,
  post.json_metadata,
  (err, result) => {
    if (err) {
      console.error("投稿エラー:", err);
    } else {
      console.log("Steemit 投稿成功:", result);
    }
  }
);
