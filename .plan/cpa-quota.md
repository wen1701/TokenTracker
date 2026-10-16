# CPA quota integration

## Goal
Add opt-in CLIProxyAPI account quota tracking, a persistent settings switch,
macOS menu quick toggle, and quota-reset confetti using existing preferences.

## Success
- Disabled by default; disabling stops/aborts CPA polling and clears visible data.
- Local settings store CPA root URL and a backend-only management key (0600).
- Verified Codex/Claude API-call fallback plus normalized plugin quota support.
- Per-account windows and credits retain correct units; unsupported accounts are explicit.
- Dashboard settings and native menu share the backend source of truth.
- Real quota reset triggers existing reset notification/confetti once; initial load,
  stale requests, toggling, and repeated polling do not trigger false celebrations.
- Focused backend/API/UI tests, validators, dashboard build and available Swift checks pass.

## Constraints
- Match existing UI and local API auth; do not change server deployment or official providers.
- No credentials in source, responses, logs, cloud sync, or user-facing output artifacts.
- Do not publish, push, or release upstream without user authorization.
- This machine has Command Line Tools, but xcodebuild currently lacks full Xcode.

## Steps
1. Inspect settings/native/reset seams and establish CPA contracts.
2. Implement persistent backend settings and abortable cached quota queries; test.
3. Add settings, account quota display, native quick toggle, reset celebration; test.
4. Run checks, inspect diff, package reviewable local deliverables and update documentation.

## Progress
- Public repository cloned; AGENTS.md and CLAUDE.md read.
- CPA 8.0.3 server previously verified: Codex x2 + Claude x1 queries work;
  Antigravity account present, no quota plugins installed.
- Added authenticated local CPA config/quota endpoints, 0600 secret persistence,
  serialized partial saves, abortable single-flight queries, 60s caching and bounded concurrency.
- Added dashboard settings, quota card quick switch, per-account display and Chinese copy.
- Added macOS menu quick switch, popover/expanded island quota views, independent
  per-account/plan/window reset baselines, and existing toast/confetti notification reuse.
- Verified 8 focused backend/API tests; 105 shared API/provider regression tests;
  32 frontend tests; real compiled Swift reset behavior; native CPA model/store/view/API
  typecheck; dashboard TypeScript check/build; copy/locale/UI/architecture/version validators.
- Browser QA used isolated fixture credentials and data: enable, view quotas and
  Credits, disable, and confirm that rows clear. Saved user-facing preview screenshots.
- Broader sandbox suite was not green (4079/4151 passed, 54 failed, 4 cancelled,
  14 skipped); it includes loopback-listener/process/Swift environment failures.
  The relevant 105-test subset passed with loopback permissions. No full-suite pass claimed.
- CLI tarball and user-facing setup/validation notes prepared. Source archive and
  patch are being assembled from the verified working tree; native packaging remains blocked.

## Decisions / blockers
- Native quick toggle targets macOS menu bar (current user platform).
- Prefer separate CPA endpoints/data to avoid changing official-provider schemas and caches.
- No remote configuration changes. API-call fallback is available without plugin installation.
- The installed native app is 1.3.14; this work is a separate local 1.4.4 build.
  Full native app packaging is blocked by missing Xcode/XcodeGen and an automatic
  approval-service failure when fetching the pinned project's Vortex dependency.
  Do not replace the installed native application with the CLI artifact.

## Fork build continuation
- User supplied wen1701/TokenTracker and requested SSH; SSH authenticated as wen1701.
- Fork main is the same baseline commit 1223482bfa2f8870de358cf60db5e28d59c67437.
- Working on codex/cpa-quota-build; preserve fork main for review.
- Added a branch-triggered/manual macOS-only artifact workflow with native tests,
  universal app build, inner-to-outer ad-hoc signing and DMG/ZIP/checksums.
- Gated npm publication to upstream and pointed macOS updates to the fork.
- Workflow YAML parsed and 47 backend/API/release workflow checks passed.
- Committed 168548c88277dbe6b3a532cc72083aef0110291f and pushed through SSH
  to fork/codex/cpa-quota-build. Fork main is unchanged.
- Build started: https://github.com/wen1701/TokenTracker/actions/runs/38908785814
- Last verified state: CPA behavior/security checks, dashboard build, embedded
  runtime, Xcode generation and native model tests passed; universal app build
  was in progress (job 116999034403).
- Subsequent browser observation and status HTTP read were blocked by the
  automatic approval service's missing_required_parameter internal error.
  Do not treat the stale status or unavailable approval as a successful DMG build.
- Next: recheck the running job, fix any errors, and verify uploaded DMG/ZIP;
  a PR has not been created. No public release or npm publication.
- Continued: run #1 completed native tests and universal compilation successfully;
  the subsequent architecture check failed because lipo's variadic -verify_arch
  option was placed before the input filename. Corrected the command order and
  added an executable regression using real fat/thin Mach-O object fixtures.
- Final: fix bda03aed11ce67bf69c82d41b0ddfac1aa19272a pushed through SSH.
  https://github.com/wen1701/TokenTracker/actions/runs/38910839644 completed
  successfully, including native tests, universal app compilation, architecture
  checks, signing, DMG/ZIP packaging and artifact upload.
- Artifact 12050064649: TokenTracker-CPA-macOS, 146429649 bytes, expires
  2026-11-15T13:56:38Z, archive digest
  sha256:d0dc47c694e3b625b3403b7e4ded7cdbc444ad40eeb94730c2e7f287b7241d16.
- Draft PR created and attached: https://github.com/wen1701/TokenTracker/pull/1.
- Direct authenticated browser download timed out; no local artifact byte/hash
  verification or installation is claimed. The cloud build and artifact metadata
  were verified. Fork main, CPA server and installed application remain unchanged.

## User-authorized local installation
- User downloaded the artifact and explicitly requested replacing the local app.
- Verified Downloads/TokenTracker-CPA-macOS.zip against the GitHub archive digest,
  extracted and checked the inner app ZIP digest, 1.4.4 bundle identity, deep
  strict code signature and both arm64/x86_64 architectures.
- Quit the old app through its normal native menu; backed up and moved the
  original 1.3.14 bundle into work/cpa-install/backup before replacing it.
- Installed /Applications/TokenTracker.app and launched it through the native app API.
- Verified process running, installed version 1.4.4, original config byte-identical,
  authenticated CPA config endpoint HTTP 200, and visible native CPA settings.
- CPA remains disabled with no saved management key. Saved installation screenshot
  and record under outputs. No credentials exposed, no CPA server settings changed.

## CPAMP compatibility repair
- User enabled CPA using https://cpamp.purrtides.com and reported endpoint missing.
- Verified local client: /v8/management/credentials = 404;
  /v0/management/auth-files = 401 invalid admin key using the saved CPA key.
- Read CPAMP routing/auth source: only v0 management paths are forwarded and
  CPAMP admin authentication substitutes its saved upstream CPA management key.
- On the 172 server, confirmed CPAMP account list and both Codex/Claude upstream
  quota requests succeed with CPAMP admin authentication. No server changes needed.
- Added discovery-only 404 negotiation to v0, pinned account queries to the selected
  API version, and v0 normalized plugin/probe support. 11 backend/API tests pass,
  including authentication fail-closed behavior and no account-error downgrades.
- Updating credential hints and packaging 1.4.5. User input requested on whether
  to securely copy the existing CPAMP admin key to the local app or let them enter it.
- User explicitly chose secure server-to-local credential setup. Saved the existing
  CPAMP admin key through the authenticated local config API without logging it.
- Production repaired module verified through https://cpamp.purrtides.com:
  v0 negotiation succeeds, Claude x1 and Codex x2 have valid windows/credits;
  Antigravity remains explicitly unsupported without a quota plugin.
- 46 backend/security/workflow checks and 32 UI tests passed; production dashboard
  build plus copy/locale/architecture/version validators passed. Pushed 6cb6a6e
  to the existing fork PR; awaiting its 1.4.5 cloud artifact for local replacement.
- Cloud run 38915930533 succeeded; artifact 12052742715 is 146410813 bytes,
  sha256:1fe155b36de6f59659ad6923929d510033bea0e0b62b8822f56bbac0b2e9e182.
- Normal browser download was blocked by the client. Requested manual download
  from the user; do not bypass browser policy. Current installed app remains 1.4.4.
  Ready to verify the downloaded archive and perform backed-up replacement.
- User downloaded the fix; verified both archive digests, 1.4.5 bundle identity,
  deep/strict signature and universal architecture. Quit and backed up 1.4.4,
  installed 1.4.5 and relaunched while preserving the CPAMP configuration byte-for-byte.
- Verified the installed application's authenticated CPA quota endpoint negotiates
  v0 with no global error, Codex x2 and Claude x1 work through CPAMP; Antigravity is
  explicitly unsupported. Native Limits UI shows live account windows/credits.
- Saved a user-facing completion record and native app screenshot under outputs.
  No server configuration changes and no credential exposure.

## Per-account tracking switches
- User requested independent switches for every CPA/CPAMP account.
- Add persistent selections keyed by the existing hashed account ID; preserve
  the global master switch and default existing accounts to enabled.
- Disabled rows remain available to re-enable, but issue no quota/plugin/API-call
  requests and carry no stale windows, credits or reset celebrations.
- Shared authenticated config patch merges individual selections atomically;
  old in-flight results cannot restore disabled account data.
- Latest screenshot fixes placement: add a CPA account group below Devin in the
  native Limits settings gear popover; no additional menu/card switch surfaces.
- Keep the combined provider/account list scrollable so every switch is reachable.
- Keep reset baselines separate: disabling/re-enabling one account must not
  manufacture a rollover or reset other accounts' baselines.
- Verify persistence, partial merges, disabled network exclusion, race behavior,
  native reset isolation, UI controls and builds; package through the fork workflow
  and update the installed application while preserving its connection/credentials.
- Implemented accountEnabled patches with strict hashed-ID/boolean validation and
  serialized merge semantics. Disabled accounts retain metadata and skip every
  plugin/upstream quota call. Selection saves abort and invalidate prior queries.
- Added the account group to the requested gear popover below the provider list,
  including a constrained scroll area, provider icons, full-label help, and
  accessible individual switches. No extra menus or card switches were added.
- Native display and dashboard exclude disabled rows. Native selection changes
  clear only the affected reset baselines and suppress stale in-flight responses;
  superseded native refreshes schedule a fresh read.
- Verified 50 backend/API/security/workflow/reset tests and 34 dashboard tests,
  dashboard typecheck/build, copy/locale/UI/architecture/version validators, and
  production native model/API/store/views Swift typecheck. SwiftUI's new list was
  split into small view properties after the initial compiler complexity error.
- Version files synchronized to 1.4.6. Next: push the existing fork branch, verify
  the exact-commit cloud build and install its complete signed artifact.
- Pushed 7514b4fa562dba1132eba9435d965bc5a6aaeb6c via SSH. Cloud run
  38920686153 completed successfully, including native tests, universal build,
  signing, DMG/ZIP packaging and upload. Artifact 12054831182 is 146315691 bytes,
  sha256:161acdfdb2b4a0ff7eec8a66348462ec6ab30aa200266c40835d79d83aecdd80.
- Real CPAMP verification used a temporary config: 4 accounts; disabling one
  Codex reduced quota requests from 3 to 2, re-enabling restored 3. Existing
  local config stayed byte-identical and server state was not changed.
- PR description updated to explain the final independent switches and checks.
  Normal browser artifact click yielded no new file; requested manual download.
  Installation remains pending; installed application is still 1.4.5.

## Simplified master switch (latest user direction)
- 1.4.6 artifact was verified and installed with an intact config and a 1.4.5 backup.
- User now requests a single master switch. This supersedes per-account switches.
- Remove per-account selections and UI; reuse the existing global enabled setting
  in the requested native gear popover below Devin. Keep the provider list scrollable.
- Verify global disable/abort, re-enable baseline behavior and native view typecheck;
  build 1.4.7 through the existing fork artifact workflow and replace 1.4.6.
- Simplification verified: 47 focused backend/API/security/native reset/workflow
  tests and 32 dashboard tests passed; production Swift model/API/store/views
  typecheck and UI/architecture/version validators passed. Dashboard/backend
  behavior now matches the previously tested CPAMP implementation exactly.
- Pushed ac2ed94b6f50b9f2ddf41f6b59f612fac89e7f8b over SSH. Cloud run
  38923080577 completed successfully with all native, frontend, signing and
  packaging steps. Artifact 12055913285 is 146416947 bytes, archive SHA256
  c22aed1080718df7383075b0ba2b3565a32dd8b18dbfec603939dd2663d26067.
- Final PR description now documents a single shared master switch. Requested
  the new 1.4.7 download because automated artifact downloads are unavailable.
  Pending installation; current installed version remains 1.4.6.
- User downloaded 1.4.7. Verified the GitHub archive digest, inner app archive
  checksum, deep/strict code signature, bundle identity and universal architecture.
  Normal-quit 1.4.6, backed it up, installed and launched 1.4.7. Config remained
  byte-identical through installation. Installed version confirmed from Info.plist.
- Verified the installed local API master off/on behavior: disabled account list
  empty; restored original enabled state returned 4 accounts via CPAMP v0 with no
  global error. CPA configuration including credentials remained identical after
  the probe. Current master switch is enabled. Native gear view compiled in CI;
  its visual interaction was not directly exercised by the automation.

## CPA as a regular provider (latest screenshot)
- User points out CPA must be an item in the existing provider list, rather
  than a separate row below a divider. Preserve the single backend master switch.
- Share the normal row, drag/drop and persisted provider order with other providers.
- Asked whether the main quota block should also join the existing Limits area;
  inspect the shared layout while awaiting that scope clarification.
- Verify ordering persistence/bridge compatibility, shared master switch behavior,
  native types/build, and the installed native appearance before completing.
- User clarified with a second screenshot: CPA is a peer type in the upper
  provider list. Only the gear list is changing; main quota layout is unchanged.
- CPA now goes through the exact same providerRow, drag handle, onDrag/onDrop
  and persisted order as Claude/Codex/Devin. Its checked state still comes from
  authenticated CPA config, preserving one master switch across all entry points.
- Dashboard registry preserves the CPA order slot through the native bridge;
  web connection settings remain the CPA control, avoiding a second visibility flag.
- Verified 49 backend/API/security/reset/workflow/native ordering tests and
  65 frontend/preferences tests, production native model/API/store/view typecheck,
  dashboard typecheck/build, copy/locale/UI/architecture/version validators.
- Version 1.4.8 is ready for the fork macOS workflow.
