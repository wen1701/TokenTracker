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
- Next: commit and push via SSH, follow the Actions run, fix build errors until
  an installable test artifact exists. No public release or npm publication.
