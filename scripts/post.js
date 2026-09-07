import { Client, PrivateKey } from "dsteem";
import OpenAI from "openai";

// ====== RPC ノード（最も安定） ======
const client = new Client("https://api.justyy.com");

// ====== Secrets ======
const postingKey = process.env.STEEM_POST_KEY;
const author = process.env.STEEM_AUTHOR;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ====== AI に生成させるプロンプト ======
const prompt = `
あなたは「空冷かずひろ」という Steemit 自動投稿AIです。
以下の構造で JSON を生成してください：

{
  "title": "投稿タイトル（SEO向け）",
  "body": "本文（1000〜1500文字）",
  "tags": ["tag1","tag2","tag3"]
}

テーマは「空冷ビートル」「藤岡」「旧車ライフ」「整備」「旅」からランダムに選ぶ。
文章は「かずひろ」の一人称で書く。
`;

// ====== Posting Key 判定 ======
async function validatePostingKey() {
  try {
    const accounts = await client.database.getAccounts([author]);

    if (!accounts || accounts.length === 0) {
      console.error("❌ ERROR: RPC がアカウント情報を返しません（author が空の可能性）");
      process.exit(1);
    }

    const postingPubKey = accounts[0].posting.key_auths[0][0];
    const keyObj = PrivateKey.fromString(postingKey);
    const pub = keyObj.createPublic().toString();

    if (pub !== postingPubKey) {
      console.error("❌ ERROR: この鍵は Posting Key ではありません（Active Key の可能性）");
      process.exit(1);
    }

    console.log("✔ Posting Key は正しいです");
  } catch (e) {
    console.error("❌ Posting Key 判定中にエラー:", e);
    process.exit(1);
  }
}

// ====== AI に投稿内容を生成させる ======
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

  console.log("✔ AI 投稿内容生成完了");
  return article;
}

// ====== Steemit 投稿処理 ======
async function postToSteemit(article) {
  try {
    console.log("🚀 Steemit 投稿中...");

    const permlink = "ai-post-" + Date.now();

    const json_metadata = {
      tags: article.tags,
      app: "ai-writer/1.0",
    };

    const op = [
      "comment",
      {
        parent_author: "",
        parent_permlink: article.tags[0] || "blog",
        author: author,
        permlink: permlink,
        title: article.title,
        body: article.body,
        json_metadata: JSON.stringify(json_metadata),
      },
    ];

    const result = await client.broadcast.sendOperations(
      [op],
      PrivateKey.fromString(postingKey)
    );

    console.log("✔ 投稿成功！");
    console.log(result);
  } catch (e) {
    console.error("❌ 投稿失敗:", e);
    process.exit(1);
  }
}

// ====== 実行フロー ======
(async () => {
  await validatePostingKey();
  const article = await generateContent();
  await postToSteemit(article);
})();
