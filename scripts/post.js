import { Client, PrivateKey } from "dsteem";
import OpenAI from "openai";

// ====== RPC ノード ======
const client = new Client("https://api.justyy.com");

// ====== Secrets ======
const postingKey = process.env.STEEM_POST_KEY;
const author = process.env.STEEM_AUTHOR;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ====== GitHub RAW URL ======
const RAW_IMAGE_URL = "https://raw.githubusercontent.com/gfr254/steemit/main/images/beetle.png";

// ====== AI に生成させるプロンプト ======
const prompt = `
あなたは「空冷かずひろ」という Steemit 多言語投稿AIです。
以下の JSON を生成してください：

{
  "title": "投稿タイトル（SEO向け）",
  "body_ja": "本文（日本語 400〜600文字）",
  "body_en": "本文（英語 300〜500 words）",
  "body_es": "本文（スペイン語 300〜500 palabras）",
  "body_ko": "본문 (한국어 300~500자)",
  "tags": ["life","car","travel"]
}

テーマは「空冷ビートル」「藤岡」「旧車ライフ」「整備」「旅」からランダムに選ぶ。
文章は「かずひろ」の一人称で書く。
`;

// ====== Posting Key 判定 ======
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

// ====== AI本文生成 ======
async function generateContent() {
  console.log("🤖 AI が投稿内容を生成中...");

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You generate multilingual JSON for Steemit." },
      { role: "user", content: prompt }
    ],
    response_format: { type: "json_object" }
  });

  const article = JSON.parse(response.choices[0].message.content);

  // 軽量化
  if (article.body_ja.length > 800) article.body_ja = article.body_ja.substring(0, 800);

  return article;
}

// ====== Steemit 投稿（5分ルール自動リトライ） ======
async function safePost(op) {
  try {
    return await client.broadcast.sendOperations([op], PrivateKey.fromString(postingKey));
  } catch (e) {
    if (e.jse_shortmsg && e.jse_shortmsg.includes("You may only post once every 5 minutes")) {
      console.log("⏳ Steemit の 5 分ルールにより待機します...");
      await new Promise(r => setTimeout(r, 300000)); // 5分待機
      console.log("🔁 再投稿します...");
      return await client.broadcast.sendOperations([op], PrivateKey.fromString(postingKey));
    }
    throw e;
  }
}

// ====== Steemit 投稿処理 ======
async function postToSteemit(article) {
  console.log("🚀 Steemit 投稿中...");

  const permlink = "ai-post-" + Date.now();

  const bodyWithImage = `
![空冷ビートル](${RAW_IMAGE_URL})

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

// ====== 実行フロー ======
(async () => {
  await validatePostingKey();
  const article = await generateContent();
  await postToSteemit(article);
})();
