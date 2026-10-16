"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

test("native CPA store recovers from a failed startup read when server readiness overlaps it", (t) => {
  if (process.platform !== "darwin") return t.skip("requires macOS Swift runtime");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tt-cpa-startup-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const main = path.join(dir, "StartupTest.swift");
  fs.writeFileSync(main, String.raw`
import Foundation

actor APIClient {
    static let shared = APIClient()
    private var configCalls = 0
    private var initialRead: CheckedContinuation<CPAConfig, Error>?
    private var enabled = true

    func fetchCPAConfig() async throws -> CPAConfig {
        configCalls += 1
        if configCalls == 1 {
            return try await withCheckedThrowingContinuation { initialRead = $0 }
        }
        return CPAConfig(enabled: enabled, baseUrl: "https://cpa.example", hasManagementKey: true)
    }
    func initialReadStarted() -> Bool { initialRead != nil }
    func failInitialRead() {
        initialRead?.resume(throwing: URLError(.cannotConnectToHost))
        initialRead = nil
    }
    func fetchCPAQuotas() async throws -> CPAQuotaResponse {
        CPAQuotaResponse(enabled: enabled, configured: true, fetchedAt: "2026-10-17T00:00:00Z", accounts: [], error: nil)
    }
    func setCPAEnabled(_ next: Bool) async throws -> CPAConfig {
        enabled = next
        return CPAConfig(enabled: enabled, baseUrl: "https://cpa.example", hasManagementKey: true)
    }
}

@main
struct StartupTest {
    @MainActor static func main() async throws {
        let store = CPAQuotaStore.shared
        for _ in 0..<400 {
            if await APIClient.shared.initialReadStarted() { break }
            try await Task.sleep(nanoseconds: 5_000_000)
        }
        guard await APIClient.shared.initialReadStarted() else { fatalError("initial read never started") }
        // Server readiness arrives while the early startup request is still pending.
        await store.refresh()
        await APIClient.shared.failInitialRead()
        for _ in 0..<400 {
            if store.config?.hasManagementKey == true && store.quotas != nil && !store.unavailable { break }
            try await Task.sleep(nanoseconds: 5_000_000)
        }
        guard store.config?.hasManagementKey == true, store.config?.enabled == true,
              store.quotas != nil, !store.unavailable else {
            fputs("server-ready refresh was lost; CPA remains disabled\n", stderr)
            exit(1)
        }
        await store.setEnabled(false)
        guard store.config?.enabled == false, store.quotas == nil else { fatalError("disable failed") }
        await store.setEnabled(true)
        guard store.config?.enabled == true, store.quotas != nil else { fatalError("reenable failed") }
        print("CPA startup recovery passed")
    }
}
`);
  const repo = (relative) => path.join(__dirname, "..", "TokenTrackerBar", relative);
  const sources = [
    "Shared/WidgetSnapshot.swift", "Shared/NativeLocalization.swift", "Shared/NativeQAProfile.swift",
    "TokenTrackerBar/Models/MenuBarDisplayPreferences.swift", "TokenTrackerBar/Models/UsageLimits.swift",
    "TokenTrackerBar/Models/LimitsSettingsStore.swift", "TokenTrackerBar/Models/WeeklyLimitResetDetector.swift",
    "TokenTrackerBar/Models/CPAQuota.swift", "TokenTrackerBar/Models/BackgroundRefreshPolicy.swift",
    "TokenTrackerBar/Services/CPAQuotaStore.swift", "TokenTrackerBar/Utilities/Strings.swift",
  ].map(repo);
  const binary = path.join(dir, "startup-test");
  const compile = spawnSync("xcrun", ["swiftc", "-parse-as-library", "-module-cache-path", path.join(dir, "cache"), ...sources, main, "-o", binary], { encoding: "utf8", timeout: 120000 });
  assert.equal(compile.status, 0, compile.stderr || compile.stdout);
  const result = spawnSync(binary, [], { encoding: "utf8", timeout: 10000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /CPA startup recovery passed/);
});
