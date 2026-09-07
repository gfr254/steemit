import { Client, PrivateKey } from "dsteem";
import fs from "fs";

// ====== RPC ノード冗長化 ======
const RPC_NODES = [
  "https://api.justyy.com",
  "https://api.steemit.com",
  "https://steem.justyy.workers.dev"
];

function getClient() {
  const node = RPC_NODES[Math.floor(Math.random() * RPC_NODES.length)];
  console.log("🔌 RPC ノード:", node);
  return new Client(node);
}

const client = getClient();

const postingKey = process.env.STEEM_POST_KEY;
const author = process.env.STEEM_AUTHOR;

const RAW_IMAGE_URL = "https://gfr254.github.io/steemit/beetle.png";

// ====== article.json 読み込み（破損検出付き） ======
function loadArticle() {
  console.log("📄 article.json を読み込みます...");

  if (!fs.existsSync("article.json")) {
    throw new Error("❌ article.json が存在しません（generate.js が失敗）");
  }

  const raw = fs.readFileSync("article.json", "utf-8");

  if (!raw || raw.trim().length < 50) {
    throw new Error("❌ article.json が破損しています（内容が空または不完全）");
  }

  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    throw new Error("❌ article.json が JSON として読み込めません（破損）");
  }

  const required = ["title", "body_ja", "body_en", "body_es", "body_ko"];
  for (const key of required) {
    if (!json[key] || json[key].length < 10) {
      throw new Error(`❌ article.json の ${key} が破損しています`);
    }
  }

  console.log("✔ article.json は正常です");
  return json;
}

// ====== 5分ルール自動リトライ ======
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

  const permlink = "beetle-" + new Date().toISOString().replace(/[:.]/g, "-");

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
    tags: [
      "aircooled",
      "beetle",
      "classiccar",
      "japan",
      "fujioka",
      "maintenance",
      ...article.tags
    ],
    app: "ai-writer"
  };

  const op = [
    "comment",
    {
      parent_author: "",
      parent_permlink: "life",
      author: author,
      permlink: permlink,
      title: article.title.trim(),
      body: bodyWithImage,
      json_metadata: JSON.stringify(json_metadata),
    },
  ];

  const result = await safePost(op);

  console.log("✔ 投稿成功！");
  console.log(result);
}

(async () => {
  const article = loadArticle();
  await postToSteemit(article);
})();
