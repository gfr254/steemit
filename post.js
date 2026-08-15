import { Client } from "dsteem";
import fs from "fs";

const client = new Client("https://api.steemit.com");

// Steemit の投稿者名を入れる
const author = "gfr254";

// AI が生成した Markdown を読み込む
import path from "path";

const date = new Date().toISOString().slice(0, 10);
const filePath = path.join("posts", `${date}.md`);
const body = fs.readFileSync(filePath, "utf8");

// 毎回ユニークなパーマリンク
const permlink = "ai-post-" + Date.now();

const comment = {
  parent_author: "",
  parent_permlink: "blog",
  author: author,
  permlink: permlink,
  title: "AI Auto Generated Post",
  body: body,
  json_metadata: JSON.stringify({
    tags: ["steemit", "ai", "automation"],
    app: "steemit-auto-writer"
  })
};

client.broadcast
  .comment(comment, process.env.STEEM_POST_KEY)
  .then((result) => {
    console.log("Post success:", result);
  })
  .catch((error) => {
    console.error("Post failed:", error);
  });
