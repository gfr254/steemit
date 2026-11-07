const nativeFetch = globalThis.fetch;
const MAX_RETRIES = 4;
const BASE_DELAY_MS = 250;
const STEEM_RPC_HOSTS = new Set([
  "api.justyy.com",
  "api.steemit.com",
  "api.steemitdev.com"
]);

function isRetryableRpcPayload(payload) {
  const error = payload?.error;
  if (!error) return false;
  if (error.code === -32603) return true;
  const message = String(error.message || "").toLowerCase();
  return message.includes("internal error") || message.includes("temporarily unavailable");
}

function isReadOnlySteemRpc(input, init) {
  const url = input instanceof Request ? input.url : String(input);
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return false;
  }
  if (!STEEM_RPC_HOSTS.has(parsedUrl.hostname)) return false;

  const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method !== "POST") return false;

  let body = init?.body;
  if (body == null && input instanceof Request) return false;
  if (typeof body !== "string") return false;
  try {
    const request = JSON.parse(body);
    // Never automatically replay a transaction broadcast: a timeout can happen
    // after the chain accepted it, and replaying could create duplicate effects.
    return typeof request.method === "string" && !request.method.includes("broadcast");
  } catch {
    return false;
  }
}

globalThis.fetch = async function fetchWithSteemRpcRetry(input, init) {
  if (!isReadOnlySteemRpc(input, init)) return nativeFetch(input, init);

  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await nativeFetch(input, init);
      let retry = response.status === 429 || response.status >= 500;
      if (!retry && response.ok) {
        try {
          retry = isRetryableRpcPayload(await response.clone().json());
        } catch {
          retry = false;
        }
      }

      if (!retry || attempt >= MAX_RETRIES) return response;
      const delayMs = BASE_DELAY_MS * (2 ** attempt);
      console.warn("[Steem RPC] Read request returned a transient response (" + response.status + "); retrying in " + delayMs + "ms (" + (attempt + 1) + "/" + MAX_RETRIES + ").");
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    } catch (error) {
      if (attempt >= MAX_RETRIES) throw error;
      const delayMs = BASE_DELAY_MS * (2 ** attempt);
      console.warn("[Steem RPC] Read request failed; retrying in " + delayMs + "ms (" + (attempt + 1) + "/" + MAX_RETRIES + "): " + error.message);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
};
