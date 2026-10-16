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
