"use strict";

const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const { writeFileAtomic, chmod600IfPossible } = require("./fs");

const CACHE_MS = 60_000;
const TIMEOUT_MS = 20_000;

function publicConfig(config) {
  return {
    enabled: config.enabled === true,
    baseUrl: typeof config.baseUrl === "string" ? config.baseUrl : "",
    hasManagementKey: Boolean(config.managementKey),
    accountEnabled: { ...config.accountEnabled },
  };
}

function parseConfigPatch(patch, current = {}) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("invalid_config");
  const next = { ...current, enabled: current.enabled === true };
  if (Object.hasOwn(patch, "enabled")) {
    if (typeof patch.enabled !== "boolean") throw new Error("invalid_config");
    next.enabled = patch.enabled;
  }
  if (Object.hasOwn(patch, "baseUrl")) {
    if (typeof patch.baseUrl !== "string") throw new Error("invalid_url");
    next.baseUrl = patch.baseUrl.trim();
    if (next.baseUrl) {
      let url;
      try { url = new URL(next.baseUrl); } catch { throw new Error("invalid_url"); }
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
        throw new Error("invalid_url");
      }
      next.baseUrl = url.href.replace(/\/+$/, "");
    }
  }
  if (Object.hasOwn(patch, "managementKey")) {
    if (typeof patch.managementKey !== "string" || /[\r\n]/.test(patch.managementKey)) throw new Error("invalid_config");
    next.managementKey = patch.managementKey.trim();
  }
  if (Object.hasOwn(patch, "accountEnabled")) {
    const selections = patch.accountEnabled;
    if (!selections || typeof selections !== "object" || Array.isArray(selections)
      || Object.entries(selections).some(([id, value]) => !/^[a-f0-9]{24}$/.test(id) || typeof value !== "boolean")) {
      throw new Error("invalid_config");
    }
    next.accountEnabled = { ...current.accountEnabled, ...selections };
  }
  if (next.enabled && (!next.baseUrl || !next.managementKey)) throw new Error("configuration_required");
  return next;
}

function number(value) {
  if (!["number", "string"].includes(typeof value) || (typeof value === "string" && !value.trim())) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function text(value, max = 120) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max) : "";
}

function resetTime(value) {
  const ms = typeof value === "number" ? value * 1000 : Date.parse(value);
  const date = new Date(ms);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function windowEntry(id, label, used, reset, seconds = null) {
  const percent = number(used);
  if (percent == null) return null;
  return { id, label: text(label), used_percent: Math.min(100, Math.max(0, percent)), reset_at: resetTime(reset), window_seconds: number(seconds) };
}

function normalizeCodex(body) {
  const windows = [];
  const add = (prefix, limits) => {
    for (const name of ["primary_window", "secondary_window"]) {
      const raw = limits?.[name];
      if (!raw) continue;
      const seconds = number(raw.limit_window_seconds);
      const label = seconds === 18000 ? "5h" : seconds === 604800 ? "7d" : name;
      const entry = windowEntry(`${prefix}.${name}`, label, raw.used_percent, raw.reset_at, seconds);
      if (entry) windows.push(entry);
    }
  };
  add("standard", body.rate_limit);
  for (const limit of Array.isArray(body.additional_rate_limits) ? body.additional_rate_limits : []) {
    const name = text(limit.limit_name || limit.metered_feature);
    if (name) add(name, limit.rate_limit);
  }
  const balance = number(body.credits?.balance);
  return {
    plan: text(body.plan_type), windows,
    metrics: balance == null ? [] : [{ key: "credits", label: "Credits", value: balance, unit: "credits", format: "number" }],
  };
}

function normalizeClaude(body) {
  const windows = [];
  for (const name of ["five_hour", "seven_day", "seven_day_opus", "seven_day_sonnet"]) {
    const raw = body[name];
    if (!raw) continue;
    const label = { five_hour: "5h", seven_day: "7d", seven_day_opus: "Opus 7d", seven_day_sonnet: "Sonnet 7d" }[name];
    const entry = windowEntry(name, label, raw.utilization, raw.resets_at, name === "five_hour" ? 18000 : 604800);
    if (entry) windows.push(entry);
  }
  return { plan: "", windows, metrics: [] };
}

function normalizePlugin(body) {
  const windows = [];
  const ids = new Set();
  for (const group of Array.isArray(body.groups) ? body.groups : []) {
    for (const bucket of Array.isArray(group.buckets) ? group.buckets : []) {
      const remaining = number(bucket.remainingFraction ?? bucket.remaining_fraction);
      const name = text(bucket.window);
      const groupName = text(group.displayName || group.display_name);
      if (remaining == null || remaining < 0 || remaining > 1 || !name) continue;
      const id = `${groupName}.${name}`;
      if (ids.has(id)) continue;
      ids.add(id);
      windows.push(windowEntry(id, [groupName, name].filter(Boolean).join(" · "), (1 - remaining) * 100, bucket.resetTime || bucket.reset_time));
    }
  }
  const metrics = (Array.isArray(body.summary) ? body.summary : []).flatMap((m) => {
    const value = number(m.value);
    if (value == null || !text(m.key)) return [];
    return [{ key: text(m.key), label: text(m.label || m.key), value, unit: text(m.unit), format: m.format === "currency" ? "currency" : "number", currency: /^[A-Z]{3}$/.test(m.currency) ? m.currency : null }];
  });
  return { plan: text(body.subscription?.plan), windows, metrics };
}

function httpError(status) {
  return ({ 401: "unauthorized", 403: "forbidden", 404: "not_found", 429: "rate_limited", 501: "unsupported" })[status] || "unavailable";
}

function createCPAIntegration({ configPath, fetchImpl = fetch, now = Date.now }) {
  let cache = null;
  let active = null;
  let configKey = null;
  let revision = 0;
  let pendingSave = Promise.resolve();

  async function readDocument() {
    try {
      const document = JSON.parse(await fs.readFile(configPath, "utf8"));
      if (!document || typeof document !== "object" || Array.isArray(document)) throw new Error("invalid_config");
      return document;
    } catch (error) {
      if (error.code === "ENOENT") return {};
      throw new Error("invalid_config");
    }
  }

  async function readConfig() {
    const document = await readDocument();
    return document.cpa && typeof document.cpa === "object" ? document.cpa : {};
  }

  function invalidate() {
    revision += 1;
    active?.controller.abort();
    active = null;
    cache = null;
    configKey = null;
  }

  function saveConfig(patch) {
    const save = pendingSave.then(async () => {
      const document = await readDocument();
      const next = parseConfigPatch(patch, document.cpa);
      document.cpa = next;
      await writeFileAtomic(configPath, JSON.stringify(document, null, 2));
      await chmod600IfPossible(configPath);
      invalidate();
      return publicConfig(next);
    });
    pendingSave = save.catch(() => {});
    return save;
  }

  async function load(config, controller) {
    let apiVersion = "v8";
    const request = async (route, payload) => {
      const legacyRoutes = { "/credentials": "/auth-files", "/requests/api-call": "/api-call" };
      const endpoint = apiVersion === "v0" ? legacyRoutes[route] || route : route;
      const response = await fetchImpl(`${config.baseUrl}/${apiVersion}/management${endpoint}`, {
        method: payload ? "POST" : "GET",
        headers: { Authorization: `Bearer ${config.managementKey}`, "Content-Type": "application/json" },
        ...(payload ? { body: JSON.stringify(payload) } : {}),
        redirect: "error", signal: controller.signal,
      });
      if (!response.ok) throw new Error(httpError(response.status));
      const body = await response.json();
      if (!body || typeof body !== "object") throw new Error("invalid_response");
      return body;
    };
    let response;
    try {
      response = await request("/credentials");
    } catch (error) {
      // CPAMP forwards legacy management routes. Only a missing discovery route
      // permits negotiation; authentication errors must never trigger fallback.
      if (error.message !== "not_found") throw error;
      apiVersion = "v0";
      response = await request("/credentials");
    }
    if (!Array.isArray(response.files)) throw new Error("invalid_response");
    const accounts = response.files.filter((a) => !a.disabled && a.auth_index);
    const results = new Array(accounts.length);
    let cursor = 0;
    const worker = async () => {
      while (cursor < accounts.length && !controller.signal.aborted) {
        const index = cursor++;
        const account = accounts[index];
        const provider = text(account.provider || account.type).toLowerCase();
        const id = crypto.createHash("sha256").update(`${config.baseUrl}\0${account.auth_index}`).digest("hex").slice(0, 24);
        const row = { id, provider, label: text(account.label || account.email || account.name || `${provider} ${index + 1}`), enabled: config.accountEnabled?.[id] !== false, plan: "", windows: [], metrics: [], error: null };
        if (!row.enabled) {
          results[index] = row;
          continue;
        }
        try {
          let normalized;
          if (account.supports_quota && (account.quota_plugin_id || apiVersion === "v0")) {
            try {
              const body = apiVersion === "v0"
                ? await request("/quota/fetch", { auth_index: account.auth_index })
                : await request(`/plugins/${encodeURIComponent(account.quota_plugin_id)}/quota?auth_index=${encodeURIComponent(account.auth_index)}`);
              normalized = normalizePlugin(body);
            } catch (error) {
              if (!["not_found", "unsupported"].includes(error.message)) throw error;
            }
          }
          if (!normalized) {
            if (!["codex", "claude"].includes(provider)) throw new Error("unsupported");
            const header = { Authorization: "Bearer $TOKEN$", Accept: "application/json" };
            if (provider === "claude") header["anthropic-beta"] = "oauth-2025-04-20";
            if (provider === "codex" && typeof account.id_token?.chatgpt_account_id === "string") header["ChatGPT-Account-Id"] = account.id_token.chatgpt_account_id;
            const upstream = await request("/requests/api-call", {
              auth_index: account.auth_index, method: "GET", header,
              url: provider === "codex" ? "https://chatgpt.com/backend-api/wham/usage" : "https://api.anthropic.com/api/oauth/usage",
            });
            if (upstream.status_code !== 200) throw new Error(httpError(upstream.status_code));
            let body;
            try { body = JSON.parse(upstream.body); } catch { throw new Error("invalid_response"); }
            if (!body || typeof body !== "object") throw new Error("invalid_response");
            normalized = provider === "codex" ? normalizeCodex(body) : normalizeClaude(body);
          }
          if (!normalized.windows.length && !normalized.metrics.length) throw new Error("invalid_response");
          Object.assign(row, normalized);
        } catch (error) {
          row.error = controller.signal.aborted ? "timeout" : ["unauthorized", "forbidden", "not_found", "unsupported", "rate_limited", "invalid_response"].includes(error.message) ? error.message : "unavailable";
        }
        results[index] = row;
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, accounts.length) }, worker));
    if (controller.signal.aborted) throw new Error("timeout");
    return { enabled: true, configured: true, api_version: apiVersion, fetched_at: new Date(now()).toISOString(), accounts: results, error: null };
  }

  async function getLimits() {
    const raw = await readConfig();
    const key = JSON.stringify(raw);
    if (key !== configKey) { invalidate(); configKey = key; }
    const state = publicConfig(raw);
    const empty = { enabled: state.enabled, configured: Boolean(state.baseUrl && state.hasManagementKey), accounts: [], error: null };
    if (!state.enabled) return empty;
    if (!empty.configured) return { ...empty, error: "configuration_required" };
    if (cache && now() - cache.at < CACHE_MS) return cache.value;
    if (active) return active.promise;
    const controller = new AbortController();
    const issued = revision;
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const promise = load(raw, controller).catch((error) => ({ ...empty, error: controller.signal.aborted ? "timeout" : ["unauthorized", "forbidden", "not_found", "rate_limited", "invalid_response"].includes(error.message) ? error.message : "unavailable" })).then((value) => {
      if (issued !== revision) return { enabled: false, configured: false, accounts: [], error: null };
      cache = { at: now(), value };
      return value;
    }).finally(() => {
      clearTimeout(timer);
      if (issued === revision) active = null;
    });
    active = { controller, promise };
    return promise;
  }

  return { getConfig: async () => publicConfig(await readConfig()), saveConfig, getLimits, invalidate };
}

module.exports = { createCPAIntegration, parseConfigPatch, normalizeCodex, normalizeClaude, normalizePlugin };
