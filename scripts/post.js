import { Client, PrivateKey } from "dsteem";
import fs from "fs";

// ====== RPC ノード（最も安定） ======
const client = new Client("https://api.justyy.com");

// ====== Secrets ======
const postingKey = process.env.STEEM_POST_KEY;
const author = process.env.STEEM_AUTHOR;

// ====== 投稿内容 ======
const title = fs.readFileSync("post_title.txt", "utf-8").trim();
const body = fs.readFileSync("post.md", "utf-8");
const tags = JSON.parse(fs.readFileSync("post_tags.json", "utf-8"));

// ====== Posting Key 判定 ======
async function validatePostingKey() {
  try {
    const accounts = await client.database.getAccounts([author]);

    if (!accounts || accounts.length === 0) {
      console.error("❌ ERROR: RPC がアカウント情報を返しませんでした（author が空の可能性）");
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

// ====== Steemit 投稿処理 ======
async function postToSteemit() {
  try {
    console.log("🚀 Steemit 投稿中...");

    const permlink = "ai-post-" + Date.now();

    const json_metadata = {
      tags: tags,
      app: "ai-writer/1.0",
    };

    const op = [
      "comment",
      {
        parent_author: "",
        parent_permlink: tags[0] || "blog",
        author: author,
        permlink: permlink,
        title: title,
        body: body,
        json_metadata: JSON.stringify(json_metadata),
      },
    ];

    const result = await client.broadcast.sendOperations([op], PrivateKey.fromString(postingKey));

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
  await postToSteemit();
})();
