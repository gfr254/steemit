import fs from "fs";
import steem from "steem";

const username = process.env.STEEM_USERNAME;
const postingKey = process.env.STEEM_POSTING_KEY;

async function main() {
  const content = fs.readFileSync("output/content.md", "utf-8");

  const body = `
# 今日の旅記録 🚗✨

![](https://raw.githubusercontent.com/gfr254/steemit/main/images/beetle.png)

${content}

---

Generated automatically via GitHub Actions 🚀
`;

  const permlink = "daily-post-" + Date.now();

  steem.broadcast.comment(
    postingKey,
    "", // 親なし → 新規投稿
    "blog",
    username,
    permlink,
    "今日の旅記録（多言語＋画像）",
    body,
    { tags: ["travel", "beetle", "ai", "multilingual"] },
    (err, result) => {
      if (err) console.error("投稿エラー:", err);
      else console.log("投稿完了:", result);
    }
  );
}

main();
