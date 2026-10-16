"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createCPAIntegration, parseConfigPatch, normalizeCodex, normalizeClaude, normalizePlugin } = require("../src/lib/cpa");

async function fixture(t, fetchImpl, now) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tt-cpa-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const configPath = path.join(dir, "config.json");
  const service = createCPAIntegration({ configPath, fetchImpl, now });
  t.after(() => service.invalidate());
  return { service, configPath };
}
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const enabled = { enabled: true, baseUrl: "https://cpa.example", managementKey: "test-secret" };

test("disabled by default and persists masked credentials without replacing other settings", async (t) => {
  let calls = 0;
  const { service, configPath } = await fixture(t, async () => { calls++; });
  assert.equal((await service.getConfig()).enabled, false);
  assert.deepEqual((await service.getLimits()).accounts, []);
  assert.equal(calls, 0);
  await fs.writeFile(configPath, JSON.stringify({ scanRoots: { codex: ["/example"] } }));
  const saved = await service.saveConfig(enabled);
  assert.equal(saved.hasManagementKey, true);
  assert.ok(!JSON.stringify(saved).includes("test-secret"));
  await service.saveConfig({ enabled: false });
  const raw = JSON.parse(await fs.readFile(configPath, "utf8"));
  assert.equal(raw.cpa.managementKey, "test-secret");
  assert.deepEqual(raw.scanRoots, { codex: ["/example"] });
  assert.equal((await fs.stat(configPath)).mode & 0o777, 0o600);
  assert.equal((await service.getLimits()).enabled, false);
  assert.equal(calls, 0);
});

test("rejects invalid endpoints, malformed switches, and incomplete enabled configuration", () => {
  for (const baseUrl of ["file:///tmp/key", "https://user:pass@example.com", "https://example.com?q=secret", "not a url"]) {
    assert.throws(() => parseConfigPatch({ baseUrl }), /invalid_url/);
  }
  assert.throws(() => parseConfigPatch({ enabled: "false" }), /invalid_config/);
  assert.throws(() => parseConfigPatch({ enabled: true }), /configuration_required/);
  assert.throws(() => parseConfigPatch({ managementKey: "key\nvalue" }), /invalid_config/);
});

test("concurrent menu toggles and connection edits preserve the latest switch state", async (t) => {
  const { service, configPath } = await fixture(t, async () => { throw new Error("unexpected network"); });
  await service.saveConfig(enabled);
  await Promise.all([service.saveConfig({ enabled: false }), service.saveConfig({ managementKey: "updated-secret" })]);
  const saved = JSON.parse(await fs.readFile(configPath, "utf8")).cpa;
  assert.equal(saved.enabled, false);
  assert.equal(saved.managementKey, "updated-secret");
  await assert.rejects(service.saveConfig({ enabled: "true" }));
  assert.equal((await service.saveConfig({ enabled: true })).enabled, true);
});

test("normalizes actual Codex/Claude shapes without inventing windows or dollar balances", () => {
  const codex = normalizeCodex({ plan_type: "prolite", rate_limit: { primary_window: { used_percent: 9, limit_window_seconds: 604800, reset_at: 1792656552 } }, credits: { balance: "62430.2353" } });
  assert.equal(codex.windows[0].label, "7d");
  assert.equal(codex.windows[0].used_percent, 9);
  assert.equal(codex.windows.length, 1);
  assert.equal(codex.metrics[0].unit, "credits");
  assert.equal(codex.metrics[0].format, "number");
  const claude = normalizeClaude({ five_hour: { utilization: 0, resets_at: null }, seven_day: { utilization: 100, resets_at: "2026-10-17T09:00:00.056528+00:00" } });
  assert.equal(claude.windows[0].reset_at, null);
  assert.equal(claude.windows[1].used_percent, 100);
  assert.deepEqual(normalizeCodex({ rate_limit: { primary_window: { used_percent: null } } }).windows, []);
  assert.deepEqual(normalizePlugin({ groups: [{ buckets: [{ window: "daily", remainingFraction: "bad" }] }] }).windows, []);
  assert.deepEqual(normalizePlugin({ groups: [{ buckets: [{ window: "daily", remainingFraction: [] }] }] }).windows, []);
  assert.deepEqual(normalizeCodex({ rate_limit: { primary_window: { used_percent: " " } } }).windows, []);
  assert.equal(normalizeCodex({ rate_limit: { primary_window: { used_percent: 25, reset_at: 1e30 } } }).windows[0].reset_at, null);
  assert.equal(normalizePlugin({ groups: [{ buckets: [{ window: "weekly", remainingFraction: 0 }] }] }).windows[0].used_percent, 100);
});

test("uses per-account fallback and plugins, handles upstream errors, and caches concurrent polls", async (t) => {
  const calls = [];
  const { service } = await fixture(t, async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.redirect, "error");
    if (url.endsWith("/credentials")) return response({ files: [
      { auth_index: "codex-a", provider: "codex", id_token: { chatgpt_account_id: "workspace" } },
      { auth_index: "claude-a", provider: "claude" },
      { auth_index: "gemini-a", provider: "antigravity", supports_quota: true, quota_plugin_id: "quota-google" },
      { auth_index: "unsupported-a", provider: "unknown" },
      { auth_index: "disabled-a", provider: "codex", disabled: true },
    ] });
    if (url.includes("/plugins/")) return response({ groups: [{ displayName: "Gemini", buckets: [{ window: "daily", remainingFraction: 0.8, resetTime: "2026-10-17T00:00:00Z" }] }] });
    const request = JSON.parse(options.body);
    assert.equal(request.header.Authorization, "Bearer $TOKEN$");
    if (request.auth_index === "claude-a") return response({ status_code: 401, body: '{"error":"private error with secrets"}' });
    assert.equal(request.header["ChatGPT-Account-Id"], "workspace");
    return response({ status_code: 200, body: JSON.stringify({ rate_limit: { primary_window: { used_percent: 38, limit_window_seconds: 18000, reset_at: 1792166614 } } }) });
  });
  await service.saveConfig(enabled);
  const [a, b] = await Promise.all([service.getLimits(), service.getLimits()]);
  assert.deepEqual(a, b);
  assert.equal(a.accounts.length, 4);
  assert.equal(a.accounts[0].windows[0].used_percent, 38);
  assert.equal(a.accounts[1].error, "unauthorized");
  assert.ok(Math.abs(a.accounts[2].windows[0].used_percent - 20) < 1e-6);
  assert.equal(a.accounts[3].error, "unsupported");
  assert.ok(!JSON.stringify(a).includes("test-secret"));
  assert.ok(!JSON.stringify(a).includes("workspace"));
  assert.ok(!JSON.stringify(a).includes("private error"));
  await service.getLimits();
  assert.equal(calls.length, 4);
});

test("switching off aborts in-flight work and cannot republish the old response", async (t) => {
  let started;
  const ready = new Promise((resolve) => { started = resolve; });
  let aborted = false;
  const { service } = await fixture(t, async (_url, { signal }) => {
    started();
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); }, { once: true }));
  });
  await service.saveConfig(enabled);
  const pending = service.getLimits();
  await ready;
  await service.saveConfig({ enabled: false });
  assert.equal((await pending).enabled, false);
  assert.equal(aborted, true);
  assert.deepEqual((await service.getLimits()).accounts, []);
});

test("quota queries reuse the upstream two-minute cache while re-enabling fetches immediately", async (t) => {
  let time = Date.parse("2026-10-17T00:00:00Z");
  let calls = 0;
  const { service } = await fixture(t, async (url) => {
    calls++;
    return url.endsWith("/credentials")
      ? response({ files: [{ provider: "codex", auth_index: "a" }] })
      : response({ status_code: 200, body: JSON.stringify({ credits: { balance: 12 } }) });
  }, () => time);
  await service.saveConfig(enabled);
  const first = await service.getLimits();
  assert.equal(calls, 2);
  for (let seconds = 15; seconds < 120; seconds += 15) {
    time = Date.parse(first.fetched_at) + seconds * 1000;
    assert.deepEqual(await service.getLimits(), first);
  }
  time = Date.parse(first.fetched_at) + 119_999;
  assert.deepEqual(await service.getLimits(), first);
  assert.equal(calls, 2, "local polls before two minutes must not query CPA");
  time += 1;
  const [next, concurrent] = await Promise.all([service.getLimits(), service.getLimits()]);
  assert.deepEqual(next, concurrent);
  assert.notEqual(next.fetched_at, first.fetched_at);
  assert.equal(calls, 4, "two-minute expiry must issue only one new query round");
  await service.saveConfig({ enabled: false });
  assert.equal((await service.getLimits()).enabled, false);
  assert.equal(calls, 4);
  await service.saveConfig({ enabled: true });
  assert.equal((await service.getLimits()).enabled, true);
  assert.equal(calls, 6, "re-enabling must bypass the remaining cache interval");
});

test("management HTTP 200 does not hide upstream 429 or malformed quota data", async (t) => {
  const { service } = await fixture(t, async (url) => url.endsWith("/credentials")
    ? response({ files: [{ provider: "codex", auth_index: "a" }] })
    : response({ status_code: 429, body: "not json" }));
  await service.saveConfig(enabled);
  assert.equal((await service.getLimits()).accounts[0].error, "rate_limited");
});

test("CPAMP v0 discovery selects legacy forwarding paths for account quota calls", async (t) => {
  const calls = [];
  const { service } = await fixture(t, async (url, options) => {
    calls.push({ url, method: options.method });
    if (url.endsWith("/v8/management/credentials")) return response({}, 404);
    if (url.endsWith("/v0/management/auth-files")) return response({ files: [
      { auth_index: "codex-a", provider: "codex" },
      { auth_index: "claude-a", provider: "claude" },
      { auth_index: "plugin-a", provider: "antigravity", supports_quota: true },
    ] });
    if (url.endsWith("/v0/management/quota/fetch")) {
      assert.deepEqual(JSON.parse(options.body), { auth_index: "plugin-a" });
      return response({ groups: [{ displayName: "Gemini", buckets: [{ window: "daily", remainingFraction: 0.5 }] }] });
    }
    assert.ok(url.endsWith("/v0/management/api-call"));
    const request = JSON.parse(options.body);
    assert.equal(request.header.Authorization, "Bearer $TOKEN$");
    return response({ status_code: 200, body: JSON.stringify(request.auth_index === "codex-a"
      ? { rate_limit: { primary_window: { used_percent: 38, limit_window_seconds: 18000 } } }
      : { seven_day: { utilization: 90, resets_at: "2026-10-23T00:00:00Z" } }) });
  });
  await service.saveConfig(enabled);
  const limits = await service.getLimits();
  assert.equal(limits.error, null);
  assert.equal(limits.api_version, "v0");
  assert.deepEqual(limits.accounts.map((a) => a.windows[0].used_percent), [38, 90, 50]);
  assert.equal(calls.length, 5);
  await service.getLimits();
  assert.equal(calls.length, 5, "cached polls must not repeat discovery");
});

test("management authentication failures never negotiate another API version", async (t) => {
  for (const status of [401, 403]) {
    let calls = 0;
    const { service } = await fixture(t, async () => { calls++; return response({}, status); });
    await service.saveConfig(enabled);
    assert.equal((await service.getLimits()).error, status === 401 ? "unauthorized" : "forbidden");
    assert.equal(calls, 1);
  }
});

test("a v8 account-level 404 does not downgrade the already-negotiated connection", async (t) => {
  const calls = [];
  const { service } = await fixture(t, async (url) => {
    calls.push(url);
    return url.endsWith("/credentials") ? response({ files: [{ provider: "codex", auth_index: "a" }] }) : response({}, 404);
  });
  await service.saveConfig(enabled);
  const limits = await service.getLimits();
  assert.equal(limits.api_version, "v8");
  assert.equal(limits.accounts[0].error, "not_found");
  assert.equal(calls.some((url) => url.includes("/v0/")), false);
});
