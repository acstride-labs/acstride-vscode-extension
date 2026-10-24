# Changelog

## 0.12.0

- Always download released problems automatically; remove the per-contest toggle, manual download controls and obsolete placeholder instructions.
- Persist up to four attempts per problem, show downloading/failure states, and start a fresh cycle when a failed problem is selected. Merge duplicate requests and refresh open statements/samples without replacing code or custom tests.
- Replace copy-and-open with experimental one-click submission, native password input, official language selection and a second confirmation. Bind the saved source and confirmed account before sending.
- Persist pending receipt tracking, reconcile exact source/submission identity, and notify official verdicts in VS Code; distinguish pretests from final acceptance and never retry a submission POST automatically.
- Include the theme-colored AC-Stride Activity Bar icon.

## 0.11.2

- Replace the generic code Activity Bar icon with the AC-Stride brand mark, using a transparent, theme-colored 24 px SVG.

## 0.11.1

- Update CF Tool to remove fixed response, statement, image and asset-count limits that rejected large public contest data.
- Remove matching CLI-output/statement/asset-count limits from the extension adapter while retaining identity validation, timeouts, cancellation and local-runner output limits.

## 0.11.0

- Make bundled CF Tool the sole Codeforces client for API reads, statement parsing, samples and official image downloads.
- Remove the direct TypeScript API fallback, old helper client, webpage parser and image downloader. Keep host-side protocol validation, display sanitization, workspace scheduling and C++/Python testing.
- Move anonymous downloader sources, Python dependency pins and notice collection into CF Tool; build both components from one exact source revision without committing binaries.
- Add cross-process request pacing in CF Tool, structured problem/asset results, strict local asset mapping and a Webview policy that blocks remote image requests.
- Preserve existing `.cfide` data, saved statements, code and custom tests.

## 0.10.0

- Bundle ACStride CF Tool at a fixed Git commit for anonymous contest metadata, public submission records and rankings, using versioned JSON, request IDs and strict method/argument validation.
- Keep login, cookies and automatic submission out of the extension; the CLI's opt-in account/submission experiment is not enabled through the editor bridge.
- Preserve the existing curl_cffi statement downloader, C++/Python execution, directory layout and user code/tests.
- Build Go binaries and dependency/runtime notices in developer/CI workflows only. Verify source pin, platform, hashes, protocol and standalone startup before packaging and again after extracting the final VSIX. No end-user Go installation or runtime downloads.
- Add bridge tests and localized connection/installation diagnostics in English, Chinese, Russian and Japanese.

## 0.9.1

- Rename the product to AC-Stride across the extension, four interface languages, native commands, settings, diagnostics and documentation.
- Update the repository link to AC-Stride Labs and label packaged VSIX files with the new brand.
- Preserve the extension identity, command/configuration IDs, workspace directories and build environment variables for compatibility.

## 0.9.0

- Rename the ambiguous copy action to explicitly describe copying code and opening submission; place it immediately after Run all in the tests toolbar and remove duplicate top/editor-title buttons.
- Keep an explicit current-language switch in the tests toolbar; bind run/copy requests to the displayed contest, problem and language, rejecting stale requests.
- Automatically save the selected source before running/copying; pass the captured language through execution so metadata changes cannot redirect a run to another source.
- Add per-language starter-code editors to Settings, with independent C++/Python drafts, default previews/reset, user/workspace persistence and legacy-file compatibility. Never overwrite existing solutions.
- Place C++/Python environment checks first in Settings, with a Check all action, per-language progress, green success checks and failure details. Clear stale checks when execution configuration changes.
- Localize all new controls in English, Chinese, Russian and Japanese and add source-selection, autosave, template and environment regression tests.

## 0.8.1

- Replace literal Chinese terminology with familiar developer wording, including `token`, Handle, code, programming language and test cases.
- Improve mismatch messages and Python/language labels across all four locales; document localization conventions and add terminology regression tests.

## 0.8.0

- Reorganize answering into a square problem rail, left-hand statement and native VS Code editor with tests beneath it; keep existing language extensions and user source files.
- Replace stacked case cards with keyboard-accessible tabs. New cases become active; drafts survive tab switching, single-case runs preserve unrelated results, and compilation/cancellation errors mark affected tabs red.
- Move language switching and copy/submission-page navigation to the top toolbar; never automatically submit code.
- Move per-contest preferences back into that contest's detail page. Keep language, handle and execution tools in global Settings.
- Remove saved-HTML import and redundant downloader/status/header/footer text. Simplify English, Chinese, Russian and Japanese wording.
- Preserve all existing code, tests and cached problem data; no workspace schema migration is needed.

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
