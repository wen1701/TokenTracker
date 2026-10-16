import React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { CPASection } from "./CPASection.jsx";
vi.mock("../../lib/copy", () => ({ copy: (key) => key }));

it("saves connection separately from enabling and clears the secret field after save", async () => {
  const user = userEvent.setup();
  const cpa = { config: { enabled: false, baseUrl: "", hasManagementKey: false }, save: vi.fn(async () => {}) };
  render(<CPASection cpa={cpa} />);
  await act(async () => {
    await user.type(screen.getByLabelText("cpa.url"), "https://cpa.example");
    await user.type(screen.getByLabelText("cpa.key"), "secret");
    await user.click(screen.getByRole("button", { name: "cpa.save" }));
  });
  expect(cpa.save).toHaveBeenCalledWith({ baseUrl: "https://cpa.example", managementKey: "secret" });
  expect(screen.getByLabelText("cpa.key")).toHaveValue("");
  await act(async () => user.click(screen.getByRole("switch", { name: "cpa.enabled" })));
  expect(cpa.save).toHaveBeenLastCalledWith({ enabled: true });
});

it("keeps saved credentials when the password field is empty and reports save failures", async () => {
  const cpa = { config: { enabled: true, baseUrl: "https://cpa.example", hasManagementKey: true }, save: vi.fn(async () => { throw new Error("unavailable"); }) };
  render(<CPASection cpa={cpa} />);
  await act(async () => userEvent.click(screen.getByRole("button", { name: "cpa.save" })));
  expect(cpa.save).toHaveBeenCalledWith({ baseUrl: "https://cpa.example" });
  expect(screen.getByRole("alert")).toBeInTheDocument();
});
