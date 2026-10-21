const DEFAULT_ENDPOINTS = ["https://api.justyy.com", "https://api.steemit.com"];
const METHODS = author => [
  ["rc_api.find_rc_accounts", { accounts: [author] }],
  ["rc_api.get_resource_params", {}],
  ["rc_api.get_resource_pool", {}],
  ["condenser_api.get_dynamic_global_properties", []]
];

const sleepDefault = ms => new Promise(resolve => setTimeout(resolve, ms));

async function request(fetchImpl, endpoint, method, params, timeoutMs) {
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("invalid JSON response (HTTP " + response.status + ")");
  }
  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message || "HTTP " + response.status);
  }
  return payload.result;
}

export async function fetchRcPreflight({ author, fetchImpl = globalThis.fetch, endpoints = DEFAULT_ENDPOINTS, retries = 1, delayMs = 1000, sleep = sleepDefault, logger = console, timeoutMs = 8000 } = {}) {
  if (typeof author !== "string" || author.length === 0) throw new Error("RC preflight requires an account name");
  if (typeof fetchImpl !== "function" || endpoints.length === 0) throw new Error("RC preflight has no usable RPC endpoint");

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    for (const endpoint of endpoints) {
      try {
        const results = [];
        for (const [method, params] of METHODS(author)) {
          results.push(await request(fetchImpl, endpoint, method, params, timeoutMs));
        }
        logger.info?.("RC preflight RPC OK: " + endpoint);
        return results;
      } catch (error) {
        lastError = error;
        logger.warn?.("RC preflight RPC failed: " + endpoint + " (attempt " + (attempt + 1) + "): " + error.message);
      }
    }
    if (attempt < retries) await sleep(delayMs * (attempt + 1));
  }
  throw new Error("RC preflight failed on all RPC nodes: " + (lastError?.message || "unknown RPC error"));
}
