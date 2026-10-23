# CFIDE 0.7 multilingual/settings acceptance checks

## Localization and settings

1. Verify the contest sidebar exposes add / contest center / settings (gear). Open Settings through the gear; it is a separate retained tab. Contest Center must not contain handle, default-language, auto-download, archive or environment-check controls.
2. Select English, 简体中文, Русский and 日本語; all CFIDE webviews, tree labels, dynamic notifications and status text should update without reload. Follow VS Code should resolve its display language, with English fallback for unsupported languages. Native static command/menu labels follow VS Code's own display language, not the independent runtime setting.
3. Edit a compiler field without saving, change UI language, and verify the draft and unsaved-state guard remain. Discard restores saved values. Repeat with an unsaved custom-test input; language changes must not clear drafts, source, results, search or selected center tab. Problem statements remain original text.
4. Save a nondefault timeout under This workspace; verify only that workspace's settings file changes. Switch to User settings and verify user/default values remain separate. Save/discard is required before scope changes. Runtime environment checks use effective saved VS Code configuration. Test invalid JSON arguments, malformed handles and out-of-range timeouts; no partial writes should remain.
5. Change only one contest's auto-download/default language/archive settings. Other contests, existing source files and custom tests must remain intact. Unsaved per-contest edits block changing the contest selection. Archive pauses background work, not file access.
6. Reload the window and verify interface language persists. Without a workspace/untrusted mode, interface language remains editable while execution/contest mutations are protected. Inspect the final VSIX for all four native NLS files and its still-working bundled downloader.

On 2026-10-24 macOS GUI checks passed for English/Chinese/Russian/Japanese pages, immediate tree/tests/statement-label updates, preserved compiler drafts across Chinese → Russian, and workspace timeout save (2300 ms) with a Japanese success notice. The test profile's user settings held only the language preference; the execution change was in the disposable workspace. Contest Center showed no preference controls. Automated tests additionally cover catalog/placeholder parity, translation-call/NLS coverage, strict setting schemas, trust/scope isolation and rollback after partial write failure.

## Product scope

The extension has no login, Cookie import, browser connection, in-IDE submission, registration or clarification actions. Old workspace files are preserved; no browser profile or user's Chrome installation is deleted. Public API tracking by handle remains independent of authentication.

## Local workflow

1. Build and open a fresh trusted folder in the Extension Development Host. Create local C++ A and Python B; run the default sum sample and expect AC.
2. Change a custom expectation from 5 to 6, save and run; expect WA and token 1 expected 6, actual 5. Verify input/output files survive reopening.
3. Exercise compilation errors, Python syntax/runtime errors, cancellation, time/output limits, missing compiler/interpreter, run-only mode and blank expectations. Unsaved test edits must disable Run.
4. Verify untrusted-workspace execution blocking, duplicate problem protection and switching between unrelated problems without leaking results/drafts.

## Anonymous contest workflow

1. Open Contest Center and verify only preparation, public submissions and rankings tabs. There must be no account credentials, browser-connect buttons, submit button or registration/messages tab.
2. Install the platform-specific VSIX on a machine with no Python/pip on PATH. Open Contest Center: built-in downloads should be ready without a setup button, dependency prompt or component download. Invalid inherited PYTHONHOME/PYTHONPATH must not interfere. Compare the user's PATH, default Python and package environments before/after; none should change. Existing solution interpreter configuration must remain independent.
3. Add two public regular contests, including one upcoming contest. Verify independent directories, countdown/default language/archive settings and incremental release downloads while VS Code remains open. Closing VS Code stops timers; overdue work resumes after reopening.
4. Import a real released problem and compare the statement, formula rendering and official samples with the website. Open its C++/Python solutions, verify both sources remain separate and samples/custom tests are shared.
5. Force a download failure; verify the actual anonymous-download error, preserved code/tests, local solution access and manual retry. Use Import saved HTML on the correct problem, confirm pairing, then verify that only statement/official samples change. Wrong-index/incomplete HTML must fail.
6. Copy solution code and verify the clipboard contents. Submit manually on the official website; the extension itself must make no submission request.
7. Set a public handle; verify official submission verdicts (including pretests vs final tests), cache timestamps, top/nearby/search rankings. Clear the handle and verify private-account ownership is never implied.
8. Disconnect the network and verify cached statements/results/rankings remain readable with clear stale/failure indications. Archive a contest and verify automatic work pauses.

## Automated and live verification

Default unit/integration tests cover local C++/Python execution, contest isolation, reimport preservation, read-only samples, release scheduling/retry/offline cache, saved-HTML import, public API tracking, GET-only anonymous transport, isolated child environment and rejection/removal of obsolete setup/account commands/messages. When a generated bundle exists, tests run the actual binary offline with empty PATH/invalid Python settings and check that its temporary HOME remains empty. Source-only checks skip these two frozen-binary tests; CI builds the bundle first so they are required there. `npm run package` checks bundle hashes/health/target before packaging; `npm run verify:vsix` checks the final extracted archive with no system Python on PATH.

Opt-in live command:

```sh
CFIDE_LIVE=1 npm test -- test/live/codeforces.test.ts
```

On 2026-10-24 all three public live checks passed using the **frozen macOS arm64 binary**, not a developer Python: contest metadata/standings, real Theatre Square parsing, and import into a temporary contest workspace with exact sample `6 6 4 → 4`, plus Spreadsheets and Primary Task statement/sample extraction. Its offline self-test also passed with an empty PATH and invalid Python settings. No login, browser or solution submission was used. Fixture tests do not guarantee availability of every contest or network.

The 0.5 macOS Extension Development Host previously imported all three problems in contest 1, displayed Theatre Square and its read-only official sample, and ran separate C++/Python solutions to local AC (`4`). Copy solution code showed the manual-website-submission confirmation. Its old setup step no longer applies to 0.6; the embedded flow must show no setup/install controls.

The 0.6 macOS arm64 Extension Development Host showed “Built-in public downloads ready” immediately after reload, with no setup/repair button. Refreshing contest 1/A completed and updated its statement cache timestamp. The final platform VSIX also passed extraction/file-hash/target/executable-permission/private-runtime startup verification with empty PATH.

Earlier versions' C++/Python AC/WA GUI checks remain relevant for the local runner, but their browser/login/submission acceptance steps no longer apply. Four-platform CI is configured; only macOS arm64 live verification has been performed locally. Other targets require their CI build/startup/archive checks before distribution. Signing/notarization/Marketplace publication are not claimed.
