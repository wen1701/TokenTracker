"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

test("native CPA reset detection celebrates real per-account rollovers once", (t) => {
  if (process.platform !== "darwin") return t.skip("requires the macOS Swift runtime");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tt-cpa-reset-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const main = path.join(dir, "main.swift");
  fs.writeFileSync(main, String.raw`
import Foundation

func check(_ condition: Bool, _ name: String) {
    if !condition { fatalError(name) }
}
func response(_ fetched: String, _ used: Double, _ reset: String?, enabled: Bool = true, error: String? = nil, secondAccount: Bool = false, plan: String = "plus") throws -> CPAQuotaResponse {
    let window: [String: Any] = ["id": "weekly", "label": "7d", "used_percent": used, "reset_at": reset as Any? ?? NSNull(), "window_seconds": 604800]
    var accounts: [[String: Any]] = [["id": "first", "provider": "codex", "label": "Account 1", "plan": plan, "windows": [window], "metrics": [], "error": error as Any? ?? NSNull()]]
    if secondAccount {
        var second = accounts[0]
        second["id"] = "second"
        accounts.append(second)
    }
    let object: [String: Any] = ["enabled": enabled, "configured": true, "fetched_at": fetched, "accounts": accounts, "error": NSNull()]
    return try JSONDecoder().decode(CPAQuotaResponse.self, from: JSONSerialization.data(withJSONObject: object))
}
let oldReset = "2026-10-16T01:00:00Z"
let newReset = "2026-10-23T01:00:00Z"
let before = "2026-10-16T00:59:00Z"
let after = "2026-10-16T01:01:00Z"
let now = CPAQuotaDate.parse(after)!.timeIntervalSince1970
var tracker = CPAResetTracker()
check(try tracker.consume(response(before, 95, oldReset, secondAccount: true), now: now).isEmpty, "first fetch must not celebrate")
check(try tracker.consume(response("2026-10-16T00:59:30Z", 70, oldReset, secondAccount: true), now: now).isEmpty, "a drop without rollover must not celebrate")
let reset = try response(after, 1, newReset, secondAccount: true)
let events = tracker.consume(reset, now: now)
check(events.count == 2, "independent accounts must retain separate reset baselines")
check(events[0].windowKey != events[1].windowKey, "account reset keys must not collide")
check(tracker.consume(reset, now: now).isEmpty, "cached response must not repeat celebration")
check(try tracker.consume(response(before, 95, oldReset), now: now).isEmpty, "late response must not rewind baseline")
check(try tracker.consume(response("2026-10-16T01:02:00Z", 1, newReset), now: now).isEmpty, "next poll must not repeat celebration")
_ = try tracker.consume(response("2026-10-16T01:03:00Z", 95, oldReset, enabled: false), now: now)
check(try tracker.consume(response("2026-10-16T01:04:00Z", 1, newReset), now: now).isEmpty, "reenabling must start a new baseline")
tracker.clear()
_ = try tracker.consume(response(before, 95, oldReset), now: now)
check(try tracker.consume(response(after, 0, nil), now: now).isEmpty, "null reset must not invent rollover")
check(try tracker.consume(response("2026-10-16T01:02:00Z", 1, newReset), now: now).count == 1, "idle null reset must not destroy previous baseline")
tracker.clear()
_ = try tracker.consume(response(before, 95, oldReset), now: now)
check(try tracker.consume(response(after, 1, newReset, error: "unavailable"), now: now).isEmpty, "failed accounts must not celebrate")
check(try tracker.consume(response("2026-10-16T01:02:00Z", 1, newReset), now: now).count == 1, "recovered account may report a genuine reset")
tracker.clear()
_ = try tracker.consume(response(before, 95, oldReset), now: now)
check(try tracker.consume(response(after, 1, newReset, plan: "pro"), now: now).isEmpty, "plan changes must not imitate resets")
print("CPA reset behavior passed")
`);
  const repo = (relative) => path.join(__dirname, "..", "TokenTrackerBar", relative);
  const sources = [
    "Shared/WidgetSnapshot.swift", "Shared/NativeLocalization.swift", "Shared/NativeQAProfile.swift",
    "TokenTrackerBar/Models/MenuBarDisplayPreferences.swift", "TokenTrackerBar/Models/UsageLimits.swift",
    "TokenTrackerBar/Models/LimitsSettingsStore.swift", "TokenTrackerBar/Models/WeeklyLimitResetDetector.swift",
    "TokenTrackerBar/Models/CPAQuota.swift", "TokenTrackerBar/Utilities/Strings.swift",
  ].map(repo);
  const binary = path.join(dir, "cpa-reset");
  const compile = spawnSync("xcrun", ["swiftc", "-module-cache-path", path.join(dir, "cache"), ...sources, main, "-o", binary], { encoding: "utf8", timeout: 120000 });
  assert.equal(compile.status, 0, compile.stderr || compile.stdout);
  const run = spawnSync(binary, [], { encoding: "utf8", timeout: 10000 });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /CPA reset behavior passed/);
});
