// GitHub Actions から、どのSteem RPCノード・メソッドが使えるかを調べる確認用スクリプト
// 使い方: node scripts/probe-rpc.js
const author = process.env.STEEM_AUTHOR || "";

// 値そのものは出さず、形式だけを確認する(Secretはログ上で *** に置き換えられる)
console.log("STEEM_AUTHOR set:", Boolean(author));
console.log("  length:", author.length);
console.log("  starts with @:", author.startsWith("@"));
console.log("  has surrounding whitespace:", author !== author.trim());
console.log("  valid account-name format:", /^[a-z][a-z0-9.-]{2,15}$/.test(author));
console.log("");

// ※ 先頭の3つ以外は動作未確認の候補。使えないものは FAILED と表示される
const nodes = [
  process.env.STEEM_RPC_URL,
  "https://api.justyy.com",
  "https://api.steemit.com",
  "https://api.moecki.online",
  "https://steemd.steemworld.org",
  "https://steem.justyy.com",
].filter(Boolean);

const tests = [
  { name: "get_dynamic_global_properties", method: "condenser_api.get_dynamic_global_properties", params: [] },
  { name: "get_accounts", method: "condenser_api.get_accounts", params: [[author]] },
  { name: "get_discussions_by_author_before_date", method: "condenser_api.get_discussions_by_author_before_date", params: [author, "", "2100-01-01T00:00:00", 5] },
  { name: "get_discussions_by_blog", method: "condenser_api.get_discussions_by_blog", params: [{ tag: author, limit: 5 }] },
  { name: "bridge.get_account_posts", method: "bridge.get_account_posts", params: { sort: "posts", account: author, limit: 5 } },
];

async function call(node, method, params) {
  const started = Date.now();
  try {
    const response = await fetch(node, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "Mozilla/5.0 (compatible; steemit-post-bot/1.0)",
      },
      body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
      signal: AbortSignal.timeout(20000),
    });
    const text = await response.text();
    let summary;
    try {
      const json = JSON.parse(text);
      if (json.error) summary = "RPC error " + JSON.stringify(json.error).slice(0, 100);
      else if (Array.isArray(json.result)) summary = "OK rows=" + json.result.length;
      else summary = "OK";
    } catch {
      summary = "non-JSON " + text.slice(0, 60).replace(/\s+/g, " ");
    }
    return `HTTP ${response.status} ${summary} (${Date.now() - started}ms)`;
  } catch (error) {
    return "FAILED " + (error?.cause?.code || error?.message || error);
  }
}

for (const node of nodes) {
  console.log("== " + node);
  for (const test of tests) {
    console.log("   " + test.name.padEnd(40) + (await call(node, test.method, test.params)));
  }
  console.log("");
}
