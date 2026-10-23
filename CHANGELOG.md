# Changelog

## 0.7.0

- Add configurable English, simplified Chinese, Russian and Japanese JSON catalogs shared by the extension host and webviews, with English fallback and parameter/key parity checks.
- Add live interface-language switching without resetting test/settings drafts, code, results or cached statements.
- Add the sidebar gear action and an independent Settings page with explicit user/workspace scopes, tool/tracking configuration, environment checks and per-contest preferences.
- Move handle/default-language/automatic-download/archive/environment controls out of Contest Center.
- Generate native VS Code command/view/welcome/configuration localization resources from the same catalogs.
- Validate settings through a separate allowlisted protocol; require workspace trust for execution/contest writes and restore prior values on partial configuration failure.

## 0.6.0

- Bundle the anonymous downloader, private Python runtime, curl_cffi/native libraries and CA data inside each platform-specific VSIX.
- Remove public-download setup/repair commands, runtime pip installation, system Python discovery and download-Python settings.
- Launch only the absolute bundled executable, isolate its environment, and keep solution Python/compiler configuration separate.
- Add pinned developer-only builds, file-hash/health gates, collected package notices, four native CI targets and final-VSIX extraction/startup verification.
- macOS arm64: real frozen startup with empty PATH/invalid Python settings and three anonymous Codeforces live checks passed.
- Preserve existing solutions/tests and unused legacy download venvs; no user/system environment migration or automatic deletion.

## 0.5.0

- Remove login/logout, Cookie import, dedicated browser/CDP integration and their dependencies.
- Remove in-IDE solution submission/receipts, registration and messages controls; retain public verdict tracking by handle.
- Add anonymous curl_cffi problem downloads with isolated one-time setup and a basic public GET fallback.
- Add saved public problem HTML import; preserve source code/custom tests during imports and failures.
- Replace the submit toolbar action with Copy solution code for manual official-site submission.
- Keep multi-contest scheduling/directories, statements/math, C++/Python local testing, cached public rankings and offline data.
- Public live checks passed without any account login or browser process. No previous user source/test/profile files are automatically deleted.

## 0.4.0

- Default to a dedicated Chrome/Edge profile: manually sign in first, then explicitly connect from Contest Center.
- Native browser launch and direct local CDP transport; no browser extension or Playwright runtime dependency.
- Route website downloads and submission forms through the browser without copying session cookies into Node.js.
- Isolated profile/global storage, random loopback debugging port, exact profile/endpoint validation, and a separate IDE operations tab.
- Account preflight before writes, no automatic submission retry, manual challenge handling, and explicit disconnect/reconnect behavior.
- Keep legacy HTTP mode configurable. Add browser/session boundary tests and opt-in native-browser live diagnostics.
- Authenticated live login/submission remains unverified; implementation does not imply successful challenge solving.

## 0.3.1

- Add a pinned desktop Chrome-style navigation header profile for website requests.
- Drop POST-only headers after redirects change the request to GET.
- Allow released problems to open local solutions even when statement downloads fail; show the actual download error and missing-sample state.
- Preserve solutions and custom tests across blocked download retries.
- Live check: added headers did not resolve the Codeforces website verification block. Login and statement download are not claimed fixed.

## 0.3.0

- Multi-contest workspace, scheduled incremental imports, countdown and restart recovery.
- Cached sanitized statements, local math rendering and supported image caching.
- Per-problem C++/Python solutions, shared official/custom tests and bottom testing panel.
- Experimental SecretStorage-backed Codeforces session, exact language selection and submission adapter.
- Durable source snapshots, uncertain-receipt protection and source-verified reconciliation.
- Official submission tracking, cached rankings, simple registration checks and best-effort announcements.
- Fixture-based contest/session tests and opt-in read-only live checks. Live website verification remains a known limitation.

## 0.2.0

- Choose C++ or Python 3 when creating a local problem.
- Python templates, interpreter path/arguments, and template configuration.
- Python tests with output comparison, tracebacks, time/output limits and cancellation.
- Share test execution and checking between languages.
- Existing C++ workspaces without language metadata continue to work.

## 0.1.0

- Initial local C++ problem, test management, compilation and output comparison workflow.
