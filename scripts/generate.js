const STEEM_NODES = [
  process.env.STEEM_RPC_URL,
  "https://api.steemit.com",
  "https://steem.justyy.com",
].filter(Boolean);

function isRetryableHttpStatus(status) {
  return status >= 500 || status === 429 || status === 403;
}

async function rpc(method, params, retries = 3) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    // 試行ごとにノードをローテーション
    const node = STEEM_NODES[attempt % STEEM_NODES.length];
    try {
      const response = await fetch(node, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "Mozilla/5.0 (compatible; steemit-post-bot/1.0)",
        },
        body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
      });
      if (!response.ok) {
        if (attempt < retries && isRetryableHttpStatus(response.status)) {
          const delayMs = 1000 * (attempt + 1) * 2;
          console.warn(`Steem RPC HTTP ${response.status} @ ${node}; retrying in ${delayMs}ms (attempt ${attempt + 1}/${retries + 1})`);
          await sleep(delayMs);
          continue;
        }
        throw new Error(`Steem RPC HTTP ${response.status} @ ${node}`);
      }
      const payload = await response.json();
      if (payload?.error) {
        if (attempt < retries && isTransientSteemError(payload.error)) {
          const delayMs = 1000 * (attempt + 1) * 2;
          console.warn(`Steem RPC transient error @ ${node}; retrying in ${delayMs}ms: ${JSON.stringify(payload.error)}`);
          await sleep(delayMs);
          continue;
        }
        throw new Error("Steem RPC error: " + JSON.stringify(payload.error));
      }
      return payload.result;
    } catch (error) {
      lastError = error;
      if (attempt < retries && isTransientSteemError(error)) {
        const delayMs = 1000 * (attempt + 1) * 2;
        console.warn(`Steem RPC request failed transiently @ ${node}; retrying in ${delayMs}ms: ${error.message}`);
        await sleep(delayMs);
        continue;
      }
      throw error;
    }
  }
  throw lastError || new Error("Steem RPC failed after retries");
}
