import assert from "node:assert/strict";
import test from "node:test";
import { fetchRcPreflight } from "./rc-preflight.js";

const ok = result => ({ ok: true, status: 200, json: async () => ({ result }) });
const failed = message => ({ ok: true, status: 200, json: async () => ({ error: { message } }) });
const quiet = { info() {}, warn() {} };

test("RC preflight switches nodes and serializes requests after a database lock", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const { method } = JSON.parse(init.body);
    calls.push(url + " " + method);
    if (url.includes("justyy")) return failed("Unable to acquire database lock");
    return ok({ method });
  };
  const results = await fetchRcPreflight({ author: "test-account", fetchImpl, logger: quiet });
  assert.equal(results.length, 4);
  assert.equal(calls.length, 5);
  assert.match(calls[0], /justyy.*find_rc_accounts/);
  assert.match(calls[1], /steemit.*find_rc_accounts/);
  assert.deepEqual(calls.slice(1).map(x => x.split(" ").at(-1)), ["rc_api.find_rc_accounts", "rc_api.get_resource_params", "rc_api.get_resource_pool", "condenser_api.get_dynamic_global_properties"]);
});

test("RC preflight retries once after all nodes fail transiently", async () => {
  let calls = 0;
  const waits = [];
  const fetchImpl = async (_url, init) => {
    calls += 1;
    if (calls <= 2) return failed("Unable to acquire database lock");
    return ok({ method: JSON.parse(init.body).method });
  };
  const results = await fetchRcPreflight({ author: "test-account", endpoints: ["https://one", "https://two"], fetchImpl, sleep: async ms => waits.push(ms), logger: quiet });
  assert.equal(results.length, 4);
  assert.equal(calls, 6);
  assert.deepEqual(waits, [1000]);
});

test("RC preflight fails closed when every attempt fails", async () => {
  let calls = 0;
  await assert.rejects(fetchRcPreflight({ author: "test-account", endpoints: ["https://one"], fetchImpl: async () => { calls += 1; return failed("Unable to acquire database lock"); }, sleep: async () => {}, logger: quiet }), /failed on all RPC nodes/);
  assert.equal(calls, 2);
});
