import SwiftUI

struct CPAQuotaView: View {
    @ObservedObject private var store = CPAQuotaStore.shared
    @ObservedObject private var localization = LocalizationObserver.shared

    private var allAccountsDisabled: Bool {
        guard let accounts = store.quotas?.accounts, !accounts.isEmpty else { return false }
        return accounts.allSatisfy { !$0.isEnabled }
    }

    var body: some View {
        if store.config?.enabled == true && !allAccountsDisabled {
            VStack(alignment: .leading, spacing: 10) {
                SectionHeader(title: Strings.cpaTitle)
                if store.unavailable || store.quotas?.error != nil {
                    Text(Strings.cpaUnavailable).font(.caption).foregroundStyle(.secondary)
                } else if let quotas = store.quotas {
                    if quotas.accounts.isEmpty { Text(Strings.noData).font(.caption).foregroundStyle(.secondary) }
                    ForEach(quotas.accounts.filter { $0.isEnabled }) { account in
                        VStack(alignment: .leading, spacing: 5) {
                            HStack {
                                Text(account.label).lineLimit(1).help(account.label)
                                Spacer()
                                Text(account.plan.isEmpty ? account.provider : account.plan).foregroundStyle(.secondary)
                            }.font(.caption)
                            if account.error != nil {
                                Text(account.error == "unsupported" ? Strings.cpaUnsupported : Strings.cpaUnavailable)
                                    .font(.caption2).foregroundStyle(.secondary)
                            }
                            ForEach(account.windows) { window in
                                VStack(alignment: .leading, spacing: 3) {
                                    HStack {
                                        Text(window.label)
                                        Spacer()
                                        Text(Strings.cpaRemaining(Int((100 - window.usedPercent).rounded())))
                                    }.font(.caption2)
                                    UsageLimitBar(percent: 100 - window.usedPercent, fillColor: .green, pacePercent: nil, paceOver: false)
                                    if let reset = CPAQuotaDate.parse(window.resetAt) {
                                        Text("\(Strings.cpaResets) \(reset.formatted(date: .abbreviated, time: .shortened))")
                                            .font(.caption2).foregroundStyle(.secondary)
                                    }
                                }
                            }
                            ForEach(account.metrics) { metric in
                                HStack(spacing: 4) {
                                    Text(metric.key == "credits" ? Strings.cpaCredits : metric.label)
                                    if metric.format == "currency", let currency = metric.currency {
                                        Text(metric.value, format: .currency(code: currency))
                                    } else {
                                        Text(metric.value, format: .number.precision(.fractionLength(0...2)))
                                        if let unit = metric.unit, !unit.isEmpty, unit != "credits" { Text(unit) }
                                    }
                                }.font(.caption2).foregroundStyle(.secondary)
                            }
                        }
                    }
                } else {
                    Text(Strings.loadingData).font(.caption).foregroundStyle(.secondary)
                }
            }
            .padding(12)
        }
    }
}
