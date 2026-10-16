import React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { CPAQuotaPanel } from "./CPAQuotaPanel.jsx";
const state = vi.hoisted(() => ({ available: true, config: { enabled: true }, data: null, save: vi.fn() }));
vi.mock("../hooks/use-cpa.js", () => ({ useCPA: () => state }));
vi.mock("../lib/copy", () => ({ copy: (key, params) => params ? `${key}:${JSON.stringify(params)}` : key, getCopyLocale: () => "en-US" }));

it("shows per-account remaining quotas, keeps Credits numeric, and labels unsupported accounts", () => {
  state.data = { enabled: true, accounts: [
    { id: "a", provider: "codex", label: "Codex A", plan: "plus", windows: [{ id: "5h", label: "5h", used_percent: 38, reset_at: null }], metrics: [{ key: "credits", label: "Credits", value: 123, unit: "credits", format: "number" }] },
    { id: "b", provider: "antigravity", label: "Account B", plan: "", error: "unsupported", windows: [], metrics: [] },
  ] };
  render(<MemoryRouter><CPAQuotaPanel /></MemoryRouter>);
  expect(screen.getByRole("progressbar", { name: "Codex A 5h" })).toHaveAttribute("value", "62");
  expect(screen.getByText("cpa.credits: 123")).toBeInTheDocument();
  expect(screen.getByText("cpa.error.unsupported")).toBeInTheDocument();
  expect(screen.queryByText(/\$123/)).toBeNull();
});

it("the card quick toggle persists the disabled state", async () => {
  state.data = null;
  state.save.mockResolvedValue({ enabled: false });
  render(<MemoryRouter><CPAQuotaPanel /></MemoryRouter>);
  await act(async () => userEvent.click(screen.getByRole("switch", { name: "cpa.enabled" })));
  expect(state.save).toHaveBeenCalledWith({ enabled: false });
});

it("hides disabled account quotas even when an older row still contains usage", () => {
  state.config = { enabled: true, accountEnabled: { a: false } };
  state.data = { enabled: true, accounts: [
    { id: "a", label: "Hidden by config", windows: [], metrics: [] },
    { id: "b", enabled: false, label: "Hidden by response", windows: [], metrics: [] },
    { id: "c", label: "Still enabled", windows: [], metrics: [] },
  ] };
  render(<MemoryRouter><CPAQuotaPanel /></MemoryRouter>);
  expect(screen.queryByText("Hidden by config")).toBeNull();
  expect(screen.queryByText("Hidden by response")).toBeNull();
  expect(screen.getByText("Still enabled")).toBeInTheDocument();
  state.config = { enabled: true };
});
