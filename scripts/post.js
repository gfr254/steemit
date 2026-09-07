import { Client, PrivateKey } from "dsteem";

const client = new Client("https://api.justyy.com");  // ← ここを変更
const postingKey = process.env.STEEM_POST_KEY;
const author = process.env.STEEM_AUTHOR;

(async () => {
  try {
    const accounts = await client.database.getAccounts([author]);
    const postingPubKey = accounts[0].posting.key_auths[0][0];

    const keyObj = PrivateKey.fromString(postingKey);
    const pub = keyObj.createPublic().toString();

    if (pub !== postingPubKey) {
      console.error("❌ この鍵は Posting Key ではありません（Active Key の可能性）");
      process.exit(1);
    } else {
      console.log("✔ この鍵は正しい Posting Key です");
    }
  } catch (e) {
    console.error("❌ Posting Key 判定中にエラー:", e);
    process.exit(1);
  }
})();
