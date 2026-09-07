import { Client, PrivateKey } from "dsteem";
import fs from "fs";

const client = new Client("https://api.justyy.com");

const postingKey = process.env.STEEM_POST_KEY;
const author = process.env.STEEM_AUTHOR;

const RAW_IMAGE_URL = "https://gfr254.github.io/steemit/beetle.png";

async function validatePostingKey() {
  const accounts = await client.database.getAccounts([author]);
  if (!accounts || accounts.length === 0) {
    console.error("❌ author が空です");
    process.exit(1);
  }

  const postingPubKey = accounts[0].posting.key_auths[0][0];
  const keyObj = PrivateKey.fromString(postingKey);
  const pub = keyObj.createPublic().toString();

  if (pub !== postingPubKey) {
    console.error("❌ Posting Key ではありません");
    process.exit(1);
  }

  console.log("✔ Posting Key は正しいです");
}

function loadArticle() {
  console.log("📄 article.json を読み込みます...");
  const raw = fs.readFileSync("article.json", "utf-8");
  return JSON.parse(raw);
}

async function safePost(op) {
  try {
    return await client.broadcast.sendOperations([op], PrivateKey.fromString(postingKey));
  } catch (e) {
    if (e.jse_shortmsg && e.jse_shortmsg.includes("You may only post once every 5 minutes")) {
      console.log("⏳ Steemit の 5 分ルールにより待機します...");
      await new Promise(r => setTimeout(r, 300000));
      console.log("🔁 再投稿します...");
      return await client.broadcast.sendOperations([op], PrivateKey.fromString(postingKey));
    }
    throw e;
  }
}

async function postToSteemit(article) {
  console.log("🚀 Steemit 投稿中...");

  const permlink = "ai-post-" + Date.now();

  const bodyWithImage = `
![Air-cooled Beetle](${RAW_IMAGE_URL})

## 🇯🇵 日本語
${article.body_ja}

---

## 🇺🇸 English
${article.body_en}

---

## 🇪🇸 Español
${article.body_es}

---

## 🇰🇷 한국어
${article.body_ko}
`;

  const json_metadata = {
    tags: ["life", "car", "travel"],
    app: "ai-writer"
  };

  const op = [
    "comment",
    {
      parent_author: "",
      parent_permlink: "life",
      author: author,
      permlink: permlink,
      title: article.title,
      body: bodyWithImage,
      json_metadata: JSON.stringify(json_metadata),
    },
  ];

  const result = await safePost(op);

  console.log("✔ 投稿成功！");
  console.log(result);
}

(async () => {
  await validatePostingKey();
  const article = loadArticle();
  await postToSteemit(article);
})();
