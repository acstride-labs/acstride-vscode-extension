# Changelog

## 0.16.0

- Add AI Hint with individually hidden progressive hints, AI Debug with issue-only analysis of the current unsaved source, and AI Coding with a read-only reference-code dialog and copy action. Always use the original English statement and the shared AI client/cache. No source replacement or automatic submission is provided.
- Add per-feature visibility, response language, editable English prompts with metadata placeholders, configurable hint count, and confirmation before restoring defaults. Show an ongoing-contest usage warning beside each visibility switch.
- Draw an original SVG icon family for translation, hints, debugging and reference coding with a shared AI badge.

## 0.15.5

- Remove the redundant Python downloader note and show Java/Kotlin-specific setup guidance for the selected language.

- Keep save validation and persistence errors inside the sticky settings action area so failures remain visible while scrolling.
- Consolidate language compiler/interpreter and runtime options into one card with a language selector. Preserve independent unsaved drafts and the existing explicit-save workflow.

## 0.15.4

- Add a localized link beside the contest ID to open the current contest on Codeforces in the external browser.

## 0.15.3

- Preserve each problem’s original/translated view when switching problems, including translations that finish in the background. Associate translation updates with their problem so results never overwrite another statement. Update the Chinese translation progress message.

## 0.15.2

- Show ranking and submission refresh progress and refresh notices beside their refresh controls instead of above the contest heading. Add busy indicators, including the problem rail refresh, with reduced-motion support.

## 0.15.1

- Color contest problem buttons green for accepted submissions and red for attempted problems without acceptance. Add a submission refresh action below the last problem, using the configured tracking handle.

## 0.15.0

- Add Java and Kotlin throughout default-language selection, templates, environment checks, local compilation/testing, and Codeforces submission language selection. Preserve independent source files when switching languages.
- Add compiler and JVM settings, with localized labels in all four interfaces. Reuse existing timeout, cancellation, output limits and difference reporting.

## 0.14.2

- Rename the local test panel to Workbench across all four interface languages.

## 0.14.1

- Revert the VSCode Elements migration and restore the previous React controls and styles. Preserve automatic translation settings saves and all features available before the migration. Remove the Elements dependencies and adapter components.

## 0.14.0

- Adopt VSCode Elements throughout settings, contest navigation, statement actions and local tests. Use its React adapters for controls, accessible labels, tabs, badges and tables; preserve automatic translation saves, interactive hover guidance and independent test drafts.
- Remove handwritten control skins, obsolete sidebar/contest list styles and duplicate tab keyboard handlers. Keep VS Code theme tokens and local Webview assets.

## 0.13.6

- Save translation switches and target language immediately; automatically save prompt edits after a short pause or on blur. Keep restore confirmation and serialize saves so rapid edits retain the latest settings.

## 0.13.5

- Move submission refresh to a small icon after tracking/update metadata, sharing the ranking refresh control and preserving its disabled state when no handle is configured.
- Queue settings-tab navigation until the webview is ready, so AI translation guidance opens AI assistance correctly on first use and in existing settings panels.
- Remove the language selector from the statement toolbar; keep language switching in the test panel and editor command.

## 0.13.4

- Simplify the contest overview by removing its duplicate heading, add button, contest picker and redundant phase/type text. Keep one compact status label beside the contest name and move ranking refresh to a small icon beside update metadata. Remove unused picker messages and clock styles.

## 0.13.3

- Disable the statement translation icon when translation is off. Show a localized settings link only on hover or keyboard focus; clicking the disabled icon never navigates. Update open statements immediately when the preference changes.

## 0.13.2

- Add a localized link at the top of the native VS Code extension settings to open the AC-Stride settings panel.

## 0.13.1

- Replace nested sidebar groups with three toggleable native peer views; reuse the legacy local-practice view ID and remove duplicate group/welcome UI. Keep settings in the contest toolbar because stable APIs cannot add a multi-view container title button.
- Move AI provider configuration into AI assistance, align translation checkboxes horizontally and update the instructions.
- Localize all AI assistance controls in four UI languages. Use an English default translation prompt with `{{language}}`, nine target languages and documented substitution; preserve custom prompts and require confirmation before restoring the draft.
- Move caching to a shared AI input/output layer. Configure enablement and LRU entry/storage limits, separate cache entries by request and credential digest, and always bypass caching for connection tests.

## 0.13.0

- Unify the sidebar into contests, standalone Codeforces problems and local practice, with one plus per group and a global settings gear. Preserve original import timestamps and sort newest first.
- Share contest and standalone download/storage workflows, use the configured default language on import, and keep source/test state isolated between collections.
- Merge contest information and statements into one contest-named editor with a shared overview/problem rail; remove the Problems tab and replace the large clock with a compact header status label.
- Organize Settings into Environment, Basic, Coding and AI assistance tabs. Keep login failures inside the account card and synchronize/lock the authenticated handle.
- Add endpoint-bound secure AI credentials, connection testing with actual replies/errors, configurable statement translation, optional automatic import translation, in-flight deduplication and a persistent 100-entry LRU cache. Sanitize generated HTML and preserve formulas and local images.

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
