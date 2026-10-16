import Foundation

struct CPAConfig: Decodable, Equatable {
    let enabled: Bool
    let baseUrl: String
    let hasManagementKey: Bool
    let accountEnabled: [String: Bool]?

    func isAccountEnabled(_ id: String) -> Bool { accountEnabled?[id] ?? true }
}

struct CPAQuotaResponse: Decodable, Equatable {
    let enabled: Bool
    let configured: Bool
    let fetchedAt: String?
    let accounts: [CPAAccountQuota]
    let error: String?

    enum CodingKeys: String, CodingKey {
        case enabled, configured, accounts, error
        case fetchedAt = "fetched_at"
    }

    func applyingSelection(_ config: CPAConfig) -> CPAQuotaResponse {
        CPAQuotaResponse(enabled: enabled, configured: configured, fetchedAt: fetchedAt,
                         accounts: accounts.map { account in
            guard !config.isAccountEnabled(account.id) else { return account }
            return CPAAccountQuota(id: account.id, provider: account.provider, label: account.label,
                                   plan: account.plan, enabled: false, windows: [], metrics: [], error: nil)
        }, error: error)
    }
}

struct CPAAccountQuota: Decodable, Equatable, Identifiable {
    let id: String
    let provider: String
    let label: String
    let plan: String
    let enabled: Bool?
    var isEnabled: Bool { enabled ?? true }
    let windows: [CPAQuotaWindow]
    let metrics: [CPAQuotaMetric]
    let error: String?
}

struct CPAQuotaWindow: Decodable, Equatable, Identifiable {
    let id: String
    let label: String
    let usedPercent: Double
    let resetAt: String?
    let windowSeconds: Double?

    enum CodingKeys: String, CodingKey {
        case id, label
        case usedPercent = "used_percent"
        case resetAt = "reset_at"
        case windowSeconds = "window_seconds"
    }
}

struct CPAQuotaMetric: Decodable, Equatable, Identifiable {
    var id: String { key }
    let key: String
    let label: String
    let value: Double
    let unit: String?
    let format: String
    let currency: String?
}

enum CPAQuotaDate {
    static func parse(_ value: String?) -> Date? {
        guard let value else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: value)
    }
}

/// Shares the official-provider rollover rules, with separate per-account keys.
/// A first observation establishes a baseline; disabling discards it. Cached or
/// out-of-order responses can never rewind the baseline and repeat a celebration.
struct CPAResetTracker {
    private var snapshot = WeeklyLimitResetDetector.Snapshot()
    private var latestFetch: Date?

    mutating func clear() {
        snapshot = WeeklyLimitResetDetector.Snapshot()
        latestFetch = nil
    }

    mutating func clear(accountID: String) {
        let prefix = "cpa.\(accountID)."
        snapshot.lastPercent = snapshot.lastPercent.filter { !$0.key.hasPrefix(prefix) }
        snapshot.lastEventAt = snapshot.lastEventAt.filter { !$0.key.hasPrefix(prefix) }
        snapshot.lastResetAt = snapshot.lastResetAt.filter { !$0.key.hasPrefix(prefix) }
    }

    mutating func consume(_ response: CPAQuotaResponse, now: Double) -> [LimitResetEvent] {
        guard response.enabled else { clear(); return [] }
        guard response.error == nil,
              let fetched = CPAQuotaDate.parse(response.fetchedAt),
              latestFetch.map({ fetched > $0 }) ?? true else { return [] }
        latestFetch = fetched
        for account in response.accounts where !account.isEnabled { clear(accountID: account.id) }
        let readings = response.accounts.filter { $0.isEnabled && $0.error == nil }.flatMap { account in
            account.windows.compactMap { window -> (provider: String, windowKey: String, windowLabel: String, usedPercent: Double, resetAt: Double?)? in
                guard window.usedPercent.isFinite, (0...100).contains(window.usedPercent) else { return nil }
                return (
                    provider: account.provider,
                    windowKey: "cpa.\(account.id).\(account.plan).\(window.id).\(window.windowSeconds ?? 0)",
                    windowLabel: "CPA · \(account.label) · \(window.label)",
                    usedPercent: window.usedPercent,
                    resetAt: CPAQuotaDate.parse(window.resetAt)?.timeIntervalSince1970
                )
            }
        }
        let result = WeeklyLimitResetDetector().evaluate(readings: readings, snapshot: snapshot, now: now)
        snapshot = result.snapshot
        return result.events
    }
}
