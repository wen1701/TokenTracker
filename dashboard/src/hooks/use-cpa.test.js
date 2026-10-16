import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useCPA } from "./use-cpa.js";
vi.mock("../lib/local-api-auth", () => ({ getLocalApiAuthHeaders: async () => ({ "x-tokentracker-local-auth": "local-token" }) }));
const host = vi.hoisted(() => ({ local: true }));
vi.mock("../lib/host-mode", () => ({ isLocalDashboardHost: () => host.local }));
const response = (body) => ({ ok: true, json: async () => body });
afterEach(() => { vi.unstubAllGlobals(); host.local = true; });

it("does not query any backend on a cloud dashboard", async () => {
  host.local = false;
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const { result } = renderHook(() => useCPA({ pollLimits: true }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(fetch).not.toHaveBeenCalled();
});

it("does not query quotas while disabled and sends authenticated toggle updates", async () => {
  let enabled = false;
  const fetch = vi.fn(async (url, options) => {
    expect(options.headers["x-tokentracker-local-auth"]).toBe("local-token");
    if (options.method === "POST") enabled = JSON.parse(options.body).enabled;
    return response(url.endsWith("-limits") ? { enabled, accounts: [] } : { enabled, baseUrl: "https://cpa.example", hasManagementKey: true });
  });
  vi.stubGlobal("fetch", fetch);
  const { result } = renderHook(() => useCPA({ pollLimits: true }));
  await waitFor(() => expect(result.current.available).toBe(true));
  expect(fetch).toHaveBeenCalledTimes(1);
  await act(() => result.current.save({ enabled: true }));
  await waitFor(() => expect(result.current.data?.enabled).toBe(true));
  await act(() => result.current.save({ enabled: false }));
  await waitFor(() => expect(result.current.config.enabled).toBe(false));
  expect(result.current.data).toBeNull();
});

it("aborts a pending quota read when disabled and ignores a late response", async () => {
  let enabled = true, release, signal;
  vi.stubGlobal("fetch", vi.fn(async (url, options) => {
    if (options.method === "POST") enabled = JSON.parse(options.body).enabled;
    if (url.endsWith("-limits")) {
      signal = options.signal;
      return new Promise((resolve) => { release = () => resolve(response({ enabled: true, accounts: [{ id: "stale" }] })); });
    }
    return response({ enabled, baseUrl: "https://cpa.example", hasManagementKey: true });
  }));
  const { result } = renderHook(() => useCPA({ pollLimits: true }));
  await waitFor(() => expect(release).toBeTypeOf("function"));
  await act(() => result.current.save({ enabled: false }));
  expect(signal.aborted).toBe(true);
  await act(async () => release());
  expect(result.current.data).toBeNull();
  expect(result.current.config.enabled).toBe(false);
});
