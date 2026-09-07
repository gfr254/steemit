import { Client, PrivateKey } from "dsteem";
import OpenAI from "openai";

// ====== RPC ノード ======
const client = new Client("https://api.justyy.com");

// ====== Secrets ======
const postingKey = process.env.STEEM_POST_KEY;
const author = process.env.STEEM_AUTHOR;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ====== GitHub RAW URL（ここだけ変更すればOK） ======
const RAW_IMAGE_URL = "https://raw.githubusercontent.com/gfr254/steemit/main/images/beetle.png";

// ====== AI に生成させるプロンプト ======
const prompt = `
あなたは「空冷かずひろ」という Steemit 自動投稿AIです。
以下の構造で JSON を生成してください：

{
  "title": "投稿タイトル（SEO向け）",
  "body": "本文（600〜900文字）",
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
      { role: "system", content: "You generate JSON for Steemit auto posting." },
      { role: "user", content: prompt }
    ],
    response_format: { type: "json_object" }
  });

  const article = JSON.parse(response.choices[0].message.content);

  // 軽量化
  article.tags = ["life", "car", "travel"];
  if (article.body.length > 800) {
    article.body = article.body.substring(0, 800);
  }

  return article;
}

// ====== Steemit 投稿処理 ======
async function postToSteemit(article) {
  console.log("🚀 Steemit 投稿中...");

  const permlink = "ai-post-" + Date.now();

  // GitHub RAW URL を本文の先頭に挿入
  const bodyWithImage = `![空冷ビートル](${RAW_IMAGE_URL})\n\n${article.body}`;

  const json_metadata = {
    tags: article.tags,
    app: "ai-writer"
  };

  const op = [
    "comment",
    {
      parent_author: "",
      parent_permlink: article.tags[0],
      author: author,
      permlink: permlink,
      title: article.title,
      body: bodyWithImage,
      json_metadata: JSON.stringify(json_metadata),
    },
  ];

  const result = await client.broadcast.sendOperations(
    [op],
    PrivateKey.fromString(postingKey)
  );

  console.log("✔ 投稿成功！");
  console.log(result);
}

// ====== 実行フロー ======
(async () => {
  await validatePostingKey();
  const article = await generateContent();
  await postToSteemit(article);
})();
