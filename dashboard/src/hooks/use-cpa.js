import { useCallback, useEffect, useRef, useState } from "react";
import { isLocalDashboardHost } from "../lib/host-mode";
import { getLocalApiAuthHeaders } from "../lib/local-api-auth";

const CONFIG_PATH = "/functions/tokentracker-cpa-config";
const LIMITS_PATH = "/functions/tokentracker-cpa-limits";

function applySelection(data, config) {
  if (!config.enabled || !data) return null;
  return { ...data, accounts: data.accounts.map((account) => config.accountEnabled?.[account.id] === false
    ? { ...account, enabled: false, windows: [], metrics: [], error: null } : account) };
}

export function useCPA({ pollLimits = false } = {}) {
  const [config, setConfig] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const controller = useRef(null);
  const saving = useRef(false);
  const generation = useRef(0);

  const request = useCallback(async (path, options = {}) => {
    const headers = await getLocalApiAuthHeaders();
    const response = await fetch(path, { ...options, headers: { ...headers, "Content-Type": "application/json" }, cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "unavailable");
    return body;
  }, []);

  const refresh = useCallback(async () => {
    if (!isLocalDashboardHost() || saving.current) { setLoading(false); return; }
    controller.current?.abort();
    const pending = new AbortController();
    controller.current = pending;
    const issued = ++generation.current;
    try {
      const next = await request(CONFIG_PATH, { signal: pending.signal });
      if (issued !== generation.current) return;
      setConfig(next);
      setData((previous) => applySelection(previous, next));
      if (next.enabled && pollLimits) {
        const limits = await request(LIMITS_PATH, { signal: pending.signal });
        if (issued !== generation.current) return;
        setData(limits.enabled ? applySelection(limits, next) : null);
      }
      setError(null);
    } catch (e) {
      if (issued === generation.current && e.name !== "AbortError") {
        setData(null);
        setError(e.message);
      }
    } finally {
      if (issued === generation.current) setLoading(false);
    }
  }, [pollLimits, request]);

  useEffect(() => {
    void refresh();
    if (!isLocalDashboardHost()) return undefined;
    const timer = window.setInterval(refresh, 15_000);
    window.addEventListener("tt:cpa-changed", refresh);
    return () => {
      generation.current += 1;
      controller.current?.abort();
      window.clearInterval(timer);
      window.removeEventListener("tt:cpa-changed", refresh);
    };
  }, [refresh]);

  const save = useCallback(async (patch) => {
    saving.current = true;
    setBusy(true);
    generation.current += 1;
    controller.current?.abort();
    try {
      const next = await request(CONFIG_PATH, { method: "POST", body: JSON.stringify(patch) });
      setConfig(next);
      setData((previous) => patch.accountEnabled ? applySelection(previous, next) : null);
      setError(null);
      return next;
    } finally {
      saving.current = false;
      setBusy(false);
      window.dispatchEvent(new Event("tt:cpa-changed"));
    }
  }, [request]);

  return { available: config !== null, config, data, error, busy, loading, save, refresh };
}
