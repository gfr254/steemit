import { Client, PrivateKey } from "dsteem";
import fs from "fs";

// ====== 投稿可能な RPC ノードのみ ======
const RPC_NODES = [
  "https://api.justyy.com",
  "https://api.steemit.com",
  "https://api.steemitdev.com"
];

// ====== RPC 生存確認付きクライアント ======
async function getClient() {
  for (const url of RPC_NODES) {
    try {
      const c = new Client(url);
      await c.database.getDynamicGlobalProperties(); // 生存確認
      console.log("✔ RPC OK:", url);
      return c;
    } catch (e) {
      console.log("❌ RPC NG:", url);
    }
  }
  throw new Error("❌ 全 RPC ノードが死んでいます（Steemit 側の障害）");
}

const client = await getClient();

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

async function ensureRcHeadroom(op) {
  async function rpc(method, params) {
    const response = await fetch("https://api.justyy.com", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 })
    });
    const payload = await response.json();
    if (!response.ok || payload.error) throw new Error("RC preflight failed: " + (payload.error?.message || response.status));
    return payload.result;
  }
  const results = await Promise.all([
    rpc("rc_api.find_rc_accounts", { accounts: [author] }),
    rpc("rc_api.get_resource_params", {}),
    rpc("rc_api.get_resource_pool", {}),
    rpc("condenser_api.get_dynamic_global_properties", [])
  ]);
  const account = results[0].rc_accounts?.find(item => item.account === author);
  const params = results[1];
  const pools = results[2];
  const globals = results[3];
  if (!account) throw new Error("RC preflight could not find the posting account");
  const txSize = Buffer.byteLength(JSON.stringify(op), "utf8") + 512;
  const comment = op[1];
  const sizes = params.size_info;
  const state = sizes.resource_state_bytes;
  const stateBytes = state.transaction_object_base_size + state.transaction_object_byte_size * txSize + state.comment_object_base_size + state.comment_object_permlink_char_size * comment.permlink.length + state.comment_object_parent_permlink_char_size * comment.parent_permlink.length;
  const counts = { resource_history_bytes: txSize, resource_state_bytes: stateBytes, resource_execution_time: sizes.resource_execution_time.comment_operation_exec_time };
  const vestingUnits = BigInt(globals.total_vesting_shares.split(" ")[0].replace(".", ""));
  const rcRegen = vestingUnits / 144000n;
  let estimated = 0n;
  for (const [name, count] of Object.entries(counts)) {
    const config = params.resource_params[name];
    const curve = config.price_curve_params;
    const pool = BigInt(pools.resource_pool[name].pool);
    const numerator = (((rcRegen * BigInt(curve.coeff_a)) >> BigInt(curve.shift)) + 1n) * BigInt(count) * BigInt(config.resource_dynamics_params.resource_unit);
    estimated += numerator / (BigInt(curve.coeff_b) + pool) + 1n;
  }
  const maxMana = BigInt(account.max_rc);
  const storedMana = BigInt(account.rc_manabar.current_mana);
  const elapsed = BigInt(Math.max(0, Math.floor(Date.now() / 1000) - Number(account.rc_manabar.last_update_time)));
  const regenerated = elapsed * maxMana / 432000n;
  const current = storedMana + regenerated > maxMana ? maxMana : storedMana + regenerated;
  const threshold = estimated * 5n / 4n;
  console.log("RC preflight", JSON.stringify({ current: current.toString(), estimated: estimated.toString(), threshold: threshold.toString(), txSize }));
  if (current < threshold) throw new Error("Insufficient RC headroom; no transaction broadcast");
}
function normalizeTitle(value) { return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("en"); }
    function normalizeBody(value) { return String(value ?? "").replace(/!\[[^\]]*\]\([^)]+\)/g, " ").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/<[^>]*>/g, " ").normalize("NFKC").toLocaleLowerCase("en").replace(/\s+/g, " ").trim(); }
    async function listAuthorHistory() {
      const posts = new Map(); let startPermlink = ""; let beforeDate = "2100-01-01T00:00:00";
      for (let page = 0; page < 100; page += 1) {
        let rows = null, lastError = null;
        for (const url of RPC_NODES) {
          try {
            const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method: "condenser_api.get_discussions_by_author_before_date", params: [author, startPermlink, beforeDate, 100], id: page + 1 }), signal: AbortSignal.timeout(15_000) });
            const payload = await response.json();
            if (!response.ok || payload.error || !Array.isArray(payload.result)) throw new Error("Steemit history RPC failed");
            rows = payload.result; break;
          } catch (error) { lastError = error; }
        }
        if (!rows) throw lastError || new Error("Steemit history unavailable; publication stopped");
        if (rows.length === 0) return [...posts.values()];
        const priorCount = posts.size;
        for (const post of rows) if (post.author === author && post.permlink) posts.set(post.permlink, post);
        if (posts.size === priorCount && rows.length === 100) throw new Error("Steemit history pagination did not advance; publication stopped");
        if (rows.length < 100) return [...posts.values()];
        const oldest = rows.at(-1);
        if (!oldest?.permlink || !oldest?.created) throw new Error("Steemit history returned an invalid cursor; publication stopped");
        startPermlink = oldest.permlink; beforeDate = oldest.created;
      }
      throw new Error("Steemit history exceeds the 10,000-post duplicate-check limit; publication stopped");
    }

    async function postToSteemit(article) {
  console.log(article.target ? "🚀 Steemit 既存投稿を更新中..." : "🚀 Steemit 投稿中...");

  // ====== permlink（禁止文字 T/Z を除去） ======
  const target = article.target;
  if (target) {
    if (target.author !== author) throw new Error("Target author mismatch");
    const existing = await client.database.getContent(author, target.permlink);
    if (!existing || existing.title !== "*" || existing.body !== "*") throw new Error("Target is no longer a placeholder; refusing to overwrite");
  }

  const permlink = target ? target.permlink :
    "beetle-" +
    new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "-")
      .replace("Z", "");

  const bodyWithImage = `
![Air-cooled Beetle](${RAW_IMAGE_URL})

## 🇯🇵 日本語
${article.body_ja}

> 注意：筆者は現時点で空冷VWを所有していません。この記事は、公開情報、販売情報、専門家の説明、オーナーの体験談をもとにした空冷VWの文化や歴史を紹介する記事です。整備や購入を検討する際は、専門店へ確認してください。

---

## 🇺🇸 English
${article.body_en}

> Note: The author does not currently own an air-cooled Volkswagen. This is a cultural and historical article based on public information, historical sources, event observations, expert explanations, and owner experiences. Please consult a specialist before buying or repairing a vehicle.

---

## 🇪🇸 Español
${article.body_es}

> Nota: El autor actualmente no posee un Volkswagen refrigerado por aire. Este artículo presenta la cultura y la historia de los Volkswagen refrigerados por aire a partir de información pública, fuentes históricas, eventos y experiencias de propietarios.

---

## 🇰🇷 한국어
${article.body_ko}

> 안내: 작성자는 현재 공랭식 폭스바겐을 소유하고 있지 않습니다. 이 글은 공개 정보, 역사 자료, 행사 관찰, 전문가 설명 및 소유자 경험을 바탕으로 공랭식 폭스바겐의 문화와 역사를 소개하는 글입니다.
`;
  const json_metadata = {
    tags: [
      "aircooled",
      "beetle",
      "classiccar",
      "japan",
      "vwculture",
      "history",
      ...(article.tags || [])
    ],
    app: "ai-writer"
  };

  const op = [
    "comment",
    {
      parent_author: target ? target.parent_author : "",
      parent_permlink: target ? target.parent_permlink : "life",
      author: author,
      permlink: permlink,
      title: article.title.trim(),
      body: bodyWithImage,
      json_metadata: JSON.stringify(json_metadata),
    },
  ];

  const candidateTitle = normalizeTitle(article.title);
      const candidateBody = normalizeBody(bodyWithImage);
      const history = await listAuthorHistory();
      const duplicate = history.find((entry) => entry.permlink !== target?.permlink && (normalizeTitle(entry.title) === candidateTitle || (candidateBody.length >= 300 && normalizeBody(entry.body) === candidateBody)));
      if (duplicate) {
        console.log(JSON.stringify({ published: false, skipped: true, reason: normalizeTitle(duplicate.title) === candidateTitle ? "duplicate_title" : "duplicate_body", title: article.title, existingPermlink: duplicate.permlink }));
        return { skipped: true, permlink: duplicate.permlink };
      }

      await ensureRcHeadroom(op);
  const result = await safePost(op);

  console.log("✔ 投稿成功！");
  console.log(result);
}

(async () => {
  const article = loadArticle();
  if (process.env.GITHUB_REF !== "refs/heads/main" || process.env.GITHUB_EVENT_NAME !== "schedule") {
    console.log("DRY RUN — no Steemit transaction broadcast");
    console.log(JSON.stringify(article, null, 2));
    return;
  }
  await postToSteemit(article);
})();
