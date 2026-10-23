# CFIDE 0.5 anonymous-workflow acceptance checks

## Product scope

The extension has no login, Cookie import, browser connection, in-IDE submission, registration or clarification actions. Old workspace files are preserved; no browser profile or user's Chrome installation is deleted. Public API tracking by handle remains independent of authentication.

## Local workflow

1. Build and open a fresh trusted folder in the Extension Development Host. Create local C++ A and Python B; run the default sum sample and expect AC.
2. Change a custom expectation from 5 to 6, save and run; expect WA and token 1 expected 6, actual 5. Verify input/output files survive reopening.
3. Exercise compilation errors, Python syntax/runtime errors, cancellation, time/output limits, missing compiler/interpreter, run-only mode and blank expectations. Unsaved test edits must disable Run.
4. Verify untrusted-workspace execution blocking, duplicate problem protection and switching between unrelated problems without leaking results/drafts.

## Anonymous contest workflow

1. Open Contest Center and verify only preparation, public submissions and rankings tabs. There must be no account credentials, browser-connect buttons, submit button or registration/messages tab.
2. Use Set up public downloads with Python 3.10+. Confirm the dependency installation notice. Only an isolated CFIDE venv is created, with pinned curl_cffi; system Python is not changed.
3. Add two public regular contests, including one upcoming contest. Verify independent directories, countdown/default language/archive settings and incremental release downloads while VS Code remains open. Closing VS Code stops timers; overdue work resumes after reopening.
4. Import a real released problem and compare the statement, formula rendering and official samples with the website. Open its C++/Python solutions, verify both sources remain separate and samples/custom tests are shared.
5. Force a download failure; verify the actual anonymous-download error, preserved code/tests, local solution access and manual retry. Use Import saved HTML on the correct problem, confirm pairing, then verify that only statement/official samples change. Wrong-index/incomplete HTML must fail.
6. Copy solution code and verify the clipboard contents. Submit manually on the official website; the extension itself must make no submission request.
7. Set a public handle; verify official submission verdicts (including pretests vs final tests), cache timestamps, top/nearby/search rankings. Clear the handle and verify private-account ownership is never implied.
8. Disconnect the network and verify cached statements/results/rankings remain readable with clear stale/failure indications. Archive a contest and verify automatic work pauses.

## Automated and live verification

Default unit/integration tests cover local C++/Python execution, contest isolation, reimport preservation, read-only samples, release scheduling/retry/offline cache, saved-HTML import, public API tracking, downloader setup boundaries, GET-only anonymous transport, and rejection/removal of obsolete account commands/messages.

Opt-in live command:

```sh
CFIDE_LIVE=1 CFIDE_CURL_PYTHON=/absolute/path/to/isolated/python npm test -- test/live/codeforces.test.ts
```

On 2026-10-24 all three public live checks passed: contest metadata/standings, real Theatre Square parsing, and import into a temporary contest workspace with exact sample `6 6 4 → 4`, plus Spreadsheets and Primary Task statement/sample extraction. No login, browser or solution submission was used. Fixture tests do not guarantee availability of every contest or network.

The same day, the actual macOS Extension Development Host passed the anonymous setup flow, imported all three problems in contest 1, displayed Theatre Square and its read-only official sample, and ran separate C++/Python solutions to local AC (`4`). Copy solution code showed the manual-website-submission confirmation. The center had only preparation/public submissions/rankings controls, without login or browser connection actions.

Earlier versions' C++/Python AC/WA GUI checks remain relevant for the local runner, but their browser/login/submission acceptance steps no longer apply. Windows/Linux CI is configured; local live verification was performed on macOS.
