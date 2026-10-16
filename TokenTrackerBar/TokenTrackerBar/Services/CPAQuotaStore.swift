import Foundation
import Combine

@MainActor
final class CPAQuotaStore: ObservableObject {
    static let shared = CPAQuotaStore()
    @Published private(set) var config: CPAConfig?
    @Published private(set) var quotas: CPAQuotaResponse?
    @Published private(set) var updating = false
    @Published private(set) var unavailable = false
    private var timer: AnyCancellable?
    private var refreshing = false
    private var generation = 0
    private var tracker = CPAResetTracker()

    private init() {
        timer = Timer.publish(every: 15, on: .main, in: .common).autoconnect().sink { [weak self] _ in
            Task { await self?.refresh() }
        }
        Task { await refresh() }
    }

    func refresh() async {
        guard !refreshing, !updating else { return }
        refreshing = true
        defer { refreshing = false }
        let issued = generation
        do {
            let next = try await APIClient.shared.fetchCPAConfig()
            guard issued == generation else { return }
            if config?.enabled != next.enabled || config?.baseUrl != next.baseUrl {
                tracker.clear()
                quotas = nil
            }
            config = next
            unavailable = false
            guard next.enabled else { quotas = nil; return }
            let fetched = try await APIClient.shared.fetchCPAQuotas()
            guard issued == generation else { return }
            quotas = fetched.enabled ? fetched : nil
            if let first = tracker.consume(fetched, now: Date().timeIntervalSince1970).first {
                NotificationCenter.default.post(name: .weeklyLimitReset, object: first)
            }
        } catch {
            guard issued == generation else { return }
            unavailable = true
            quotas = nil
        }
    }

    func setEnabled(_ enabled: Bool) async {
        guard !updating else { return }
        generation += 1
        updating = true
        do {
            config = try await APIClient.shared.setCPAEnabled(enabled)
            quotas = nil
            tracker.clear()
            unavailable = false
        } catch { unavailable = true }
        updating = false
        await refresh()
    }
}
