"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");
const { createLocalApiHandler } = require("../src/lib/local-api");

test("CPA local API requires authentication, masks keys and preserves toggle state", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tt-cpa-api-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const handler = createLocalApiHandler({ queuePath: path.join(dir, "queue.jsonl"), trackerDataDir: dir });
  const call = async (endpoint, { method = "GET", headers = {}, body } = {}) => {
    const req = Readable.from(body == null ? [] : [Buffer.from(JSON.stringify(body))]);
    req.method = method;
    req.headers = { host: "localhost", ...headers };
    let status, payload;
    const res = { writeHead(code) { status = code; }, end(chunk) { payload = JSON.parse(String(chunk)); } };
    assert.equal(await handler(req, res, new URL(`http://localhost${endpoint}`)), true);
    return { status, payload };
  };
  for (const route of ["config", "limits"]) assert.equal((await call(`/functions/tokentracker-cpa-${route}`)).status, 401);
  const token = (await call("/api/local-auth")).payload.token;
  const headers = { "x-tokentracker-local-auth": token };
  const endpoint = "/functions/tokentracker-cpa-config";
  assert.equal((await call(endpoint, { headers })).payload.enabled, false);
  const saved = await call(endpoint, { headers, method: "POST", body: { baseUrl: "https://cpa.example", managementKey: "private-management-key" } });
  assert.equal(saved.status, 200);
  assert.equal(saved.payload.hasManagementKey, true);
  assert.ok(!JSON.stringify(saved).includes("private-management-key"));
  assert.equal((await call(endpoint, { headers, method: "POST", body: { enabled: true } })).payload.enabled, true);
  assert.equal((await call(endpoint, { headers, method: "POST", body: { enabled: false } })).payload.enabled, false);
  assert.deepEqual((await call("/functions/tokentracker-cpa-limits", { headers })).payload.accounts, []);
  assert.equal((await call(endpoint, { headers: { ...headers, origin: "https://untrusted.example" } })).status, 401);
  assert.equal((await call(endpoint, { headers, method: "POST", body: { enabled: "false" } })).status, 400);
  assert.equal((await call(endpoint, { headers, method: "DELETE" })).status, 405);
});
