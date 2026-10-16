import Foundation

struct CPAConfig: Decodable, Equatable {
    let enabled: Bool
    let baseUrl: String
    let hasManagementKey: Bool
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
}

struct CPAAccountQuota: Decodable, Equatable, Identifiable {
    let id: String
    let provider: String
    let label: String
    let plan: String
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

    mutating func consume(_ response: CPAQuotaResponse, now: Double) -> [LimitResetEvent] {
        guard response.enabled else { clear(); return [] }
        guard response.error == nil,
              let fetched = CPAQuotaDate.parse(response.fetchedAt),
              latestFetch.map({ fetched > $0 }) ?? true else { return [] }
        latestFetch = fetched
        let readings = response.accounts.filter { $0.error == nil }.flatMap { account in
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
