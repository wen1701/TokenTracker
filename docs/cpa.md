# CLIProxyAPI account quotas

CPA quota tracking is a local, opt-in feature. It is off by default and does not
change the existing token usage queue or official-provider quota checks.

## Setup

1. Open **Settings → CPA Account Quotas** in the local dashboard.
2. Save the CPA or CPAMP server root URL (without `/v1` or a management API path).
   Direct CPA connections use the CPA management key. Connections through CPAMP
   use its **CPAMP admin key**: the manager verifies that key, then substitutes
   its saved upstream CPA management key. The model-inference client key is a
   different credential.
3. Enable **Track CPA quotas**. Account quotas appear on the Limits page and in
   the macOS popover and expanded Dynamic Island.
4. Use **Track CPA Quotas** in the macOS status-item menu to pause or resume.
   The same persistent backend setting is used by the dashboard and native menu;
   other open views pick up changes on their next poll (at most 15 seconds).

An empty management-key input preserves the saved key. Configuration is stored in
the local tracker `config.json` with mode 0600; the key is never returned by the
API, placed in the front-end bundle, logged, or included in cloud usage uploads.
Use the existing HTTPS management endpoint or a local tunnel when connecting to
a remote CPA instance; this feature does not change CPA's management policy.

## Supported queries

- v8 account discovery: `GET /v8/management/credentials`. If and only if this
  discovery route returns 404, negotiate the v0 compatibility API using
  `GET /v0/management/auth-files`. This supports CPAMP's existing management
  forwarding without exposing another CPA port. Authentication failures never
  trigger a fallback.
- Installed quota plugins: `GET /v8/management/plugins/{id}/quota?auth_index=...`.
- Codex and Claude accounts without a quota plugin: the existing
  `POST /v8/management/requests/api-call` delegates the quota query to the account's
  official upstream endpoint. CPA substitutes `$TOKEN$` on the server. A negotiated
  v0/CPAMP connection uses `POST /v0/management/api-call` throughout the query;
  account-level failures never change the connection's selected API version.
- v0 quota-capable accounts use `/v0/management/quota/fetch` for normalized
  plugin/probe queries, including deployments without a `quota_plugin_id` field.
- Other account types require an available quota plugin; unsupported accounts
  are explicitly labelled rather than represented as an exhausted quota.

Codex Credits remain credits, not a dollar balance. Plugin currency summaries
retain the provider's currency. Missing windows, unknown reset times and failed
queries are not converted to zero usage or zero balance.

The backend caches results for five minutes, bounds concurrency to three accounts,
and applies a 20-second total query deadline. Disabling or editing the connection
aborts its pending query, invalidates the cache and discards superseded results.

## Reset celebration

The native macOS client reuses the existing **Confetti on limits reset** and reset
toast preferences, both available in the status-item menu. It compares separate
per-account, per-plan, per-window baselines with the existing rollover detector:
the reset time must advance by over 60 seconds and usage must drop by at least
five percentage points. Initial observations, re-enabling, cached responses,
out-of-order responses, unavailable accounts and plan changes do not celebrate.
Repeated reads of one reset produce one celebration burst, even if several
account windows reset together. This observes upstream resets; it never invokes
CPA reset or credential-mutation endpoints.

## Local endpoints

All requests require TokenTracker local API authentication and an allowed
loopback origin, including GET requests.

- `GET /functions/tokentracker-cpa-config` returns `enabled`, `baseUrl`, and
  `hasManagementKey`; it never returns the key.
- `POST /functions/tokentracker-cpa-config` accepts a partial update of `enabled`,
  `baseUrl`, or `managementKey`. Concurrent CPA saves are serialized.
- `GET /functions/tokentracker-cpa-limits` returns per-account windows, numeric
  summaries, update timestamps and bounded error codes. It does no CPA work when
  the setting is disabled.

## Validation and build

```sh
npm ci
npm --prefix dashboard ci
node --test test/cpa.test.js test/local-api-cpa.test.js test/cpa-reset-native.test.js
npm --prefix dashboard run test -- src/hooks/use-cpa.test.js src/components/settings/CPASection.test.jsx
npm --prefix dashboard run typecheck
npm run dashboard:build
```

The reset behavior test compiles and executes production Swift models and the
real rollover detector on macOS. The native app still needs the normal Xcode /
XcodeGen / Vortex build and embedded runtime bundle; installing only the CLI
package does not change an already-installed native menu-bar executable. Follow
the repository's macOS build instructions in `CLAUDE.md` for native packaging.

## Fork macOS builds

In `wen1701/TokenTracker`, pushes to `codex/cpa-quota-build` run **Build CPA macOS
test app** in GitHub Actions. It checks the CPA backend/dashboard behavior, runs
native model tests, builds a universal app, signs its embedded runtime/widget/app
in order, and uploads a DMG, zipped app and checksums as **TokenTracker-CPA-macOS**.
Artifacts are kept for 30 days. This workflow has read-only repository access and
does not create a release or publish npm packages. It also supports manual runs
once the workflow is available on the default branch.

The macOS updater targets `wen1701/TokenTracker`, so future upstream releases do
not replace the CPA customization. The inherited npm publishing job is restricted
to the original upstream repository and is skipped in this fork.
