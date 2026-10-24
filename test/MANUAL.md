# Manual acceptance

## 0.12 automatic downloads and confirmed submission

1. Add a released contest. Problems start downloading without any download button or settings toggle. Add an upcoming contest and confirm downloading waits for release. Archived contests pause background activity.
2. Open a missing problem from either the VS Code tree or the A/B/C rail. Its pane shows downloading; source editing and custom cases remain usable. Successful downloads refresh the statement and official samples without discarding unsaved custom drafts.
3. Simulate read failures: each problem receives up to four attempts, then shows a clear failure message. Selecting it starts a new bounded cycle. Repeated selection during a request must not duplicate the download. Reloading preserves exhausted failures and recovers interrupted attempts. Old `autoDownload: false` settings cannot disable downloading.
4. Verify the test toolbar contains language, Run all, and One-click submit. No copy/browser navigation action remains. Only Codeforces problems expose submission.
5. Use mock/injected CF Tool responses for automated submission checks. Cancelling login, language selection or the native confirmation must never send source. A successful confirmation binds account, official language, contest/problem and exact saved source hash; changing source/language/account must abort.
6. With fixture receipts, restart tracking and verify exact-ID verdict notifications. Unknown receipts are never resent. Duplicate clicks during preparation send at most once. Pretests passed is distinct from final Accepted; unrelated receipt/ID/problem results must not produce a notification.
7. A real-account submission acceptance test requires the account owner's deliberate confirmation and must be performed separately. Automated checks and public smoke checks do not establish that current login, site verification or actual submission works. Never use a real password/source in tests or fixtures.
8. Install the matching VSIX and verify its AC-Stride monochrome Activity Bar icon in dark/light themes, four-language UI, environment checks, independent templates, local C++/Python AC/WA/diff and cancellation.

## Verification recorded for 0.12

The actual built Webview was previewed with simulated host messages: the manual download card/toggle are absent, pending/exhausted states are localized, and the toolbar exposes One-click submit. Host/CLI fixture tests cover confirmation cancellation, source/account binding, pending receipt persistence, exact-ID notifications and pretests/final distinction. No real account credentials or submission were used.

## Historical verification

Earlier validation notes below describe prior versions; their copy/navigation or download setup controls no longer exist.

# AC-Stride 0.9 layout/multilingual/settings acceptance checks

## New settings and language-bound actions

0.9 macOS GUI verification on 2026-10-24: Check all ran real C++ compilation/execution and Python execution and showed green checks for `g++` and `python3`. Independent C++/Python template drafts survived switching both ways; the test-only drafts were discarded without saving configuration. The toolbar visibly showed Python 3, Run all, then the renamed copy/navigation button. A run of the existing sum template against contest 2261/A's sample produced the expected WA and the localized message “第 1 个 token 不一致”; this checks the UI, not a correct solution to that problem. Automated tests separately verify unsaved C++/Python buffers are saved, routed to the matching runner/copied source, and protected against stale requests and failed saves.

1. Verify environment checks precede the other Settings sections. Run Check all: C++ and Python should each show checking followed by a green tick or a failure with details. A missing compiler must not prevent checking Python. Changing executable/arguments clears the prior tick; reloading starts unchecked. No tool installation or path rewriting occurs.
2. In Code templates, choose C++, paste a distinctive initial program, switch to Python and paste a different one. Switch back: neither draft should be lost. Save, reopen Settings and verify both; test separate user/workspace values and default reset. Create new local/contest solutions and verify the corresponding template and `${PROBLEM_ID}` substitution. Existing sources must remain unchanged after template edits or language switching.
3. Keep the current language visible beside Run all. Leave unsaved C++ edits and run, then switch to Python, leave unsaved edits and run. Verify each buffer is saved and the correct runner/source is used. Repeat with Copy code & open submission page. Saving failure must prevent copying/navigation. A delayed old-language UI request must fail instead of using the new language's file.
4. Copy/navigation belongs immediately to the right of Run all, not above the statement or in the native editor title. Its Chinese label is 复制代码并去提交 and the tooltip explicitly says no automatic submission. Verify all four locales at a narrow pane width.

## Answering layout and tabs

1. Open a downloaded contest problem. Verify the narrow A/B/C… rail, statement on the left, native editor on the right and tests only under the code. Resize dividers, switch problems and verify source/statement/tests agree. Problem indices such as G1/G2 must fit the square buttons. Existing unrelated tabs must not be closed.
2. Add two custom cases. Each addition selects its tab without stacking cards. Enter an unsaved draft, switch tabs and return; the draft must remain. Global Run stays disabled until all drafts are saved. Delete the selected custom case and verify a surviving tab is selected; official samples cannot be edited/deleted.
3. Run a correct case (green ✓), wrong answer (red ✕), then only one case; unrelated results must remain. Edit/save a tested case; its stale result must clear. Check CE, RE, TLE, OLE and cancellation colors, and a neutral run-only result without expected output. Keyboard Left/Right/Home/End should navigate tabs.
4. Switch C++/Python from the top toolbar. Both solution files remain, test cases are shared and old-language results clear. Verify copy uses the selected language, opens the correct contest/problem submit URL, and does not send code to Codeforces.
5. At a typical window size, the run action, case tabs and input/expectation must be visible without scrolling past decorative titles. Check light/dark themes and all four languages; statement/runner diagnostics remain original.

## Localization and settings

0.8 macOS Extension Development Host checks on 2026-10-24: native three-group layout and A/B switching synchronized statement/source/samples; Python and C++ both produced AC for the official Theatre Square sample and WA with token differences for a custom expectation. Adding a case selected its tab; switching away/back preserved its unsaved input, and single-case execution kept the unrelated AC result. Four-language Settings/test labels updated live; global Settings had no contest/downloader panels. Per-contest drafts survived detail-tab switching and disabled contest selection until discarded. Copy opened VS Code's external-site confirmation with the exact `https://codeforces.com/contest/1/submit/A` URL. No solution was submitted. Automated tests cover abnormal-tab coloring including CE/cancellation; cross-platform native layout still needs platform-specific GUI checks.

1. Verify the contest sidebar exposes add / contest center / settings (gear). Open Settings through the gear; it is a separate retained tab. Global Settings must not contain per-contest controls, downloader status or center-navigation actions. Contest info has a per-contest settings tab; global handle and environment controls remain in Settings.
2. Select English, 简体中文, Русский and 日本語; all AC-Stride webviews, tree labels, dynamic notifications and status text should update without reload. Follow VS Code should resolve its display language, with English fallback for unsupported languages. Native static command/menu labels follow VS Code's own display language, not the independent runtime setting.
3. Edit a compiler field without saving, change UI language, and verify the draft and unsaved-state guard remain. Discard restores saved values. Repeat with an unsaved custom-test input; language changes must not clear drafts, source, results, search or selected center tab. Problem statements remain original text.
4. Save a nondefault timeout under This workspace; verify only that workspace's settings file changes. Switch to User settings and verify user/default values remain separate. Save/discard is required before scope changes. Runtime environment checks use effective saved VS Code configuration. Test invalid JSON arguments, malformed handles and out-of-range timeouts; no partial writes should remain.
5. Change only one contest's auto-download/default language/archive settings. Other contests, existing source files and custom tests must remain intact. Unsaved per-contest edits block changing the contest selection. Archive pauses background work, not file access.
6. Reload the window and verify interface language persists. Without a workspace/untrusted mode, interface language remains editable while execution/contest mutations are protected. Inspect the final VSIX for all four native NLS files and its still-working bundled downloader.

On 2026-10-24 macOS GUI checks passed for English/Chinese/Russian/Japanese pages, immediate tree/tests/statement-label updates, preserved compiler drafts across Chinese → Russian, and workspace timeout save (2300 ms) with a Japanese success notice. The test profile's user settings held only the language preference; the execution change was in the disposable workspace. These 0.7 checks predate the per-contest settings relocation in 0.8. Automated tests additionally cover catalog/placeholder parity, translation-call/NLS coverage, strict setting schemas, trust/scope isolation and rollback after partial write failure.

## Product scope

The extension has no login, Cookie import, browser connection, in-IDE submission, registration or clarification actions. Old workspace files are preserved; no browser profile or user's Chrome installation is deleted. Public API tracking by handle remains independent of authentication.

## Local workflow

1. Build and open a fresh trusted folder in the Extension Development Host. Create local C++ A and Python B; run the default sum sample and expect AC.
2. Change a custom expectation from 5 to 6, save and run; expect WA and token 1 expected 6, actual 5. Verify input/output files survive reopening.
3. Exercise compilation errors, Python syntax/runtime errors, cancellation, time/output limits, missing compiler/interpreter, run-only mode and blank expectations. Unsaved test edits must disable Run.
4. Verify untrusted-workspace execution blocking, duplicate problem protection and switching between unrelated problems without leaking results/drafts.

## Anonymous contest workflow

1. Open Contest Center and verify only Problems, My submissions and Rankings tabs. The sidebar must list non-expandable contests; clicking one opens its Problems tab. Problem rows must be 32 px tall with an attempt-state icon and a single truncated title. Clicking a row opens its statement and selects the matching problem-rail button. There must be no account credentials, browser-connect buttons, automatic-submit or registration/messages tab.
2. Install the platform-specific VSIX on a machine with no Python/pip on PATH. Open Contest Center: downloads should work without a downloader-status panel, setup button, dependency prompt or component download. Invalid inherited PYTHONHOME/PYTHONPATH must not interfere. Compare the user's PATH, default Python and package environments before/after; none should change. Existing solution interpreter configuration must remain independent.
3. Add two public regular contests, including one upcoming contest. Verify independent directories, countdown/default language selection and incremental release downloads while VS Code remains open. Closing VS Code stops timers; overdue work resumes after reopening.
4. Import a real released problem and compare the statement, formula rendering and official samples with the website. Open its C++/Python solutions, verify both sources remain separate and samples/custom tests are shared.
5. Force a download failure; verify the actual anonymous-download error, preserved code/tests, local solution access and manual retry. Verify saved-HTML import is absent; use the normal retry action.
6. Use Copy code & open submission page (中文：复制代码并去提交), verify the clipboard contains current solution code and the default browser opens that problem’s submission page. Submit manually on the official website; the extension itself must make no submission request.
7. Set a public handle; verify official submission verdicts (including pretests vs final tests), cache timestamps, top/nearby/search rankings. Clear the handle and verify private-account ownership is never implied.
8. Disconnect the network and verify cached statements/results/rankings remain readable with clear stale/failure indications. Archive a contest and verify automatic work pauses.

## Automated and live verification

Default unit/integration tests cover local C++/Python execution, contest isolation, reimport preservation, read-only samples, release scheduling/retry/offline cache, download retry preservation, public API mapping, the no-network extension boundary, structured CLI identity/asset validation, isolated frozen transport startup and rejection/removal of obsolete setup/account commands/messages. Codeforces DOM/HTTP/image-policy coverage lives in CF Tool. When a generated bundle exists, tests run the actual binary offline with empty PATH/invalid Python settings and check that its temporary HOME remains empty. Source-only checks skip these two frozen-binary tests; CI builds the bundle first so they are required there. `npm run package` checks bundle hashes/health/target before packaging; `npm run verify:vsix` checks the final extracted archive with no system Python on PATH.

Opt-in live command:

```sh
CFIDE_LIVE=1 npm test -- test/live/codeforces.test.ts
```

On 2026-10-24 all three public live checks passed using the **frozen macOS arm64 binary**, not a developer Python: contest metadata/standings, real Theatre Square parsing, and import into a temporary contest workspace with exact sample `6 6 4 → 4`, plus Spreadsheets and Primary Task statement/sample extraction. Its offline self-test also passed with an empty PATH and invalid Python settings. No login, browser or solution submission was used. Fixture tests do not guarantee availability of every contest or network.

The 0.5 macOS Extension Development Host previously imported all three problems in contest 1, displayed Theatre Square and its read-only official sample, and ran separate C++/Python solutions to local AC (`4`). Copy solution code showed the manual-website-submission confirmation. Its old setup step no longer applies to 0.6; the embedded flow must show no setup/install controls.

The 0.6 macOS arm64 Extension Development Host showed “Built-in public downloads ready” immediately after reload, with no setup/repair button. Refreshing contest 1/A completed and updated its statement cache timestamp. The final platform VSIX also passed extraction/file-hash/target/executable-permission/private-runtime startup verification with empty PATH.

Earlier versions' C++/Python AC/WA GUI checks remain relevant for the local runner, but their browser/login/submission acceptance steps no longer apply. Four-platform CI is configured; only macOS arm64 live verification has been performed locally. Other targets require their CI build/startup/archive checks before distribution. Signing/notarization/Marketplace publication are not claimed.

## 0.11 client-layer migration verification (2026-10-24)

- CF Tool: full `go test -race ./...` and `go vet ./...` passed locally on macOS arm64, including structured editor responses, multiline/Unicode/empty samples, official image caching/policy, shared pacing/cancellation and existing account/submission fixture tests. No real account was used.
- Extension: `npm run check` passed with 69 tests and the opt-in live test skipped. After removing the redundant host throttling timer, typecheck and affected scheduling/boundary tests passed again; packaging rebuilt the final extension.
- `CFIDE_LIVE=1 npm test -- test/live/codeforces.test.ts` passed through the actual embedded CF Tool: contest metadata, tourist's public submissions, standings, isolated workspace import with the exact Theatre Square sample `6 6 4 → 4`, and two additional statements. No direct TypeScript or Python development transport was used.
- Both embedded components were built from the same pinned clean CF Tool commit. `npm run package` and `npm run verify:vsix` passed for `ac-stride-0.11.0-darwin-arm64.vsix`, including extracted executable startup, target/hashes/notices and no system Go/Python requirement.
- The extension contains no direct network calls, Codeforces sample parser, image downloader or source-development fallback. Webview CSP blocks remote image loads; successful CLI assets map to local Webview resources. Existing workspace layouts, code, custom tests and cached statements remain supported.
- Windows/Linux/macOS Intel CI must independently complete; these local checks establish macOS arm64 only. This is not a Marketplace publication or a real automatic-submission verification.

## Java / Kotlin

Install JDK and Kotlin compiler. Run each environment check; configure absolute tool paths and JVM arguments if needed. Choose Java/Kotlin as default, import a contest, standalone problem and local problem. Run the bundled two-integer sum template with matching and mismatching expectations; inspect the first-token difference, run one case, stop a run, and test a loop timeout. Switch languages and back, verifying source files and shared test drafts remain intact. Verify submission choices only offer the selected language and cancellation of the confirmation sends nothing. On Windows test an official kotlinc.bat installation under a path containing spaces.
