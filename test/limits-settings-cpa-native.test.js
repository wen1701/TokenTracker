"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

test("CPA participates in shared provider ordering, persistence and bridge snapshots", (t) => {
  if (process.platform !== "darwin") return t.skip("requires macOS Swift runtime");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tt-cpa-order-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const main = path.join(dir, "main.swift");
  fs.writeFileSync(main, String.raw`
import Foundation
let suite = "CPAOrderTest.\(UUID().uuidString)"
let defaults = UserDefaults(suiteName: suite)!
defer { defaults.removePersistentDomain(forName: suite) }
let store = LimitsSettingsStore(userDefaults: defaults)
precondition(store.providerOrder.last == "cpa")
store.moveProviderFromMenu(from: IndexSet(integer: store.providerOrder.firstIndex(of: "cpa")!), to: 0)
precondition(store.providerOrder.first == "cpa")
precondition(store.providerOrder.count == Set(store.providerOrder).count)
precondition(LimitsSettingsStore(userDefaults: defaults).providerOrder.first == "cpa")
precondition(store.applyBridgeSnapshot([
    "providerOrder": ["devin", "cpa", "claude"],
    "updatedAt": NSNumber(value: Int64.max / 1024),
]))
precondition(Array(store.providerOrder.prefix(3)) == ["devin", "cpa", "claude"])
print("CPA provider ordering passed")
`);
  const binary = path.join(dir, "order-test");
  const source = path.join(__dirname, "..", "TokenTrackerBar/TokenTrackerBar/Models/LimitsSettingsStore.swift");
  const compile = spawnSync("xcrun", ["swiftc", "-module-cache-path", path.join(dir, "cache"), source, main, "-o", binary], { encoding: "utf8", timeout: 120000 });
  assert.equal(compile.status, 0, compile.stderr || compile.stdout);
  const result = spawnSync(binary, [], { encoding: "utf8", timeout: 10000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /CPA provider ordering passed/);
});
