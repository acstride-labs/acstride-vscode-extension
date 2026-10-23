# CFIDE

A Codeforces contest workbench inside desktop VS Code, with C++ and Python 3 support. Version 0.4 adds a dedicated Chrome/Edge connection: sign in manually, then let the IDE read pages and send submissions through that same browser. No browser extension is required.

## Dedicated browser setup (default in 0.4)

1. Use **local desktop VS Code** and install Chrome or Edge. Remote extension hosts and VS Code for the web are not supported by this connection mode.
2. Open **CFIDE: Open Contest Center** and click **1. Open dedicated Chrome** (also available through **CFIDE: Sign In to Codeforces**). Review the local-debugging notice before opening it.
3. CFIDE starts a normal browser using a separate profile under the extension's global storage directory, not your daily Chrome profile. It does not use Playwright's browser launcher, ask for your password, or automate verification. Complete Codeforces verification and sign-in in that browser yourself.
4. Return to Contest Center and click **2. Connect after sign-in**, or run **CFIDE: Connect Dedicated Codeforces Browser**. Check the detected account. An anonymous connection supports public downloads, but submissions require a detected signed-in account.
5. Keep the dedicated browser open. Downloads, registration adapters and submissions now use real browser navigation, not copied cookies in Node.js HTTP requests. API-based rankings/status remain independent.
6. After restarting VS Code or the browser, reconnect explicitly. The dedicated browser profile can preserve your website session; CFIDE does not infer sign-in from cached metadata. If the account changes or expires, reconnect before submitting.

**Disconnect browser** closes only CFIDE's operations tab/connection. It does not close Chrome, sign you out of Codeforces, or delete the browser profile. Sign out inside Chrome if desired; close the dedicated browser to stop its debugging interface. Use this profile only for Codeforces and do not upload/share it. Its session data lives outside the project repository.

The connection uses Chrome's local debugging interface on a random loopback port, discovered only from CFIDE's own profile. There is no arbitrary endpoint field, external debugging listener, browser-extension installation, or attempt to read your daily browser's cookies. Other software running as your user can potentially access a local debugging interface; treat the dedicated profile as sensitive. Browser sandboxing and web security are not disabled.

If the browser is not found, set `cfide.codeforces.browserExecutable` to an absolute application path (macOS: `/Applications/Google Chrome.app`; Windows: the full `chrome.exe`/`msedge.exe` path). Changing `cfide.codeforces.connectionMode` requires reloading VS Code. The previous experimental HTTP login remains available as `http`, but browser mode is the default.

## Contest workflow

1. Open a trusted local workspace. Run **CFIDE: Add Codeforces Contest** and paste a regular contest URL or numeric ID. Choose the default local language.
2. Use **CFIDE: Open Contest Center** to view the countdown, download settings, compiler/interpreter checks and registration information. Adding a contest locally does **not** register your account.
3. Keep the VS Code extension host running: when the contest starts, CFIDE attempts to download released problems and official samples. Imports are incremental; partial failures retry with backoff. Archived contests stop automatic downloading/polling. Closing VS Code stops the timer; overdue work resumes when reopened.
4. Open a problem from the contest tree or center: source on the left, cached statement with math on the right, and **CFIDE Tests** in the bottom panel. Official samples are read-only; add separate custom tests. Switch C++/Python without discarding either solution.
5. Connect your manually signed-in dedicated browser using the setup above. Submit from the tests toolbar or **CFIDE: Submit Solution to Codeforces**. Each submission asks for the exact language offered by the official form (last choice first), saves a source snapshot and tracks the official verdict.
6. Use **My submissions** for receipts, snapshots and uncertain-result resolution. **Rankings** supports top 100, nearby and handle search, with cache timestamps and frozen-board indication. A read-only handle can track public submissions/rankings without signing in.

### Online integration is experimental

Version 0.3.1 sends desktop Chrome-style navigation headers for website requests. A live read-only test still encountered website verification: these headers do not make Node.js a browser or guarantee downloads/login. Failed downloads no longer prevent opening a released problem's local solution and custom tests; missing statements and official samples remain explicitly marked as unavailable.

The public Codeforces API does not provide solution submission or full problem statements. Statements, submission and simple registration use website adapters, which can break when Codeforces changes its forms or applies anti-bot verification. CAPTCHA, 2FA and browser challenges are **not** bypassed or solved by the extension. In browser mode a challenge activates CFIDE's operations tab so you can handle it manually. This is not a guaranteed browser-free contest client. Legacy HTTP mode retains its advanced SecretStorage-backed Cookie import, not used by browser mode.

On 2026-10-24, the old Node HTTP problem request was blocked by site verification. The 0.4 native Chrome + direct CDP transport passed real public statement/sample parsing and disconnect/reconnect checks. Authenticated login, registration and real submissions have **not** been verified against a real account. Their adapters are covered by synthetic form/session tests, not an end-to-end contest acceptance test.

CFIDE never automatically repeats a submission POST after a lost response. A receipt without a definite ID stays uncertain, blocking duplicate submissions for that problem/account. It can reconcile a unique recent candidate only after comparing the owner's official source against the saved snapshot, or ask you to resolve it explicitly. Similar timestamps alone are not considered proof.

The IDE does not collect or persist passwords in browser mode. The dedicated Chrome/Edge profile owns session persistence. Legacy HTTP mode saves cookies only in VS Code SecretStorage, not workspace files. No backend service or telemetry is used. Never share browser profiles or exported cookies.

Only regular `/contest/` competitions are supported. Gym, group contests, virtual participation, full clarification messaging and complex registration/consent flows are out of scope. Registration requests require a separate confirmation, and forms containing consent checkboxes are refused. Announcements are best-effort, not a complete replacement for official messages.

## Try it

1. Install Node.js 24 LTS to develop/build the extension. To solve problems, install a C++ compiler (`g++` or `clang++`) and/or Python 3.
2. Run `npm ci` and `npm run check` in this repository.
3. Open this repository in desktop VS Code and press **F5** (`Run CFIDE Extension`).
4. In the Extension Development Host, open an empty local folder and trust it.
5. Run **CFIDE: Create Local Problem** from the Command Palette (or the CFIDE sidebar).
6. Choose **C++** or **Python 3**, then enter an ID such as `A` and a title. Both default templates sum two integers, with a `2 3 → 5` example test.
7. Edit `A/main.cpp` or `A/main.py`; use **Run all tests** in the bottom CFIDE Tests panel, or **CFIDE: Run Tests** (`Cmd+Alt+R` on macOS, `Ctrl+Alt+R` elsewhere).
8. Add a test, enter input and optional expected output, and click **Save changes**. Set expected output to `6` for input `2 3` to see a WA and the first differing token.

To install outside the development host, run `npm run package` and use VS Code's **Extensions: Install from VSIX...** command with the generated `.vsix` file.

## Configuration

- `cfide.cpp.compiler`: compiler executable or absolute path; defaults to `g++`. Use `clang++` on macOS if preferred.
- `cfide.cpp.args`: default `-std=c++20 -O2 -Wall -Wextra` (an argument array, no shell).
- `cfide.run.timeoutMs`: per-test wall-clock limit; default 2000 ms.
- `cfide.cpp.templatePath`: optional absolute template path. `${PROBLEM_ID}` is replaced with the local ID.
- `cfide.python.interpreter`: Python 3 executable or absolute path; defaults to `python3`. On Windows set `python` if `python3` is unavailable. For virtual environments, use the full interpreter path. This setting is independent of the interpreter selected by Microsoft's Python extension.
- `cfide.python.args`: additional interpreter arguments, for example `["-O"]`. CFIDE adds unbuffered execution, UTF-8 mode and disabled bytecode-cache writes.
- `cfide.python.templatePath`: optional absolute Python template path, with the same `${PROBLEM_ID}` placeholder.
- `cfide.codeforces.handle`: optional public read-only tracking handle; signing in selects the authenticated account instead.
- `cfide.codeforces.connectionMode`: `browser` (default) or legacy `http`; reload required.
- `cfide.codeforces.browserExecutable`: optional absolute Chrome/Edge application path, machine-scoped.

Python needs no C++ compiler. Syntax errors and exceptions produce RE with the Python traceback under stderr. Each test starts a fresh interpreter. Sibling Python modules can be imported from the original problem directory; relative data-file access uses the temporary execution directory.

The compiler must already be installed. On macOS, CFIDE detects the active Apple SDK for Apple clang to resolve standard-library headers. C++ language completion is supplied by your existing language extension (for example clangd), not by CFIDE.

## Results

`AC` means local expected tokens match, **not** official acceptance. `WA` reports the first different, missing, or extra token. Whitespace is ignored; case and numeric spelling are preserved. `RAN` means no expected output was supplied. `RE`, `TLE`, `OLE`, compile diagnostics and cancellation are displayed separately. Blank expected output is a real expectation; uncheck it to run without checking.

Each run saves a snapshot of the source, compiles it once for C++ or invokes Python directly, then executes tests sequentially in a temporary working directory. C++ compilation is limited to 30 seconds; combined stdout/stderr is capped at 1 MB per process. Stop terminates the process tree. This is local process execution, **not a security sandbox**. Timings are wall-clock measurements and are not equivalent to Codeforces time limits. Memory usage is not measured.

## Workspace data

```text
your-workspace/
  .cfide/contests.json    # registered local contests
  contests/
    1234/
      .cfide/contest.json
      .cfide/statements/ # sanitized cached statements and supported images
      .cfide/submissions/ # attempt metadata and exact submitted source snapshots
      A/solutions/main.cpp
      A/solutions/main.py # created when switching language
      A/tests/samples/   # imported, read-only in the UI
      A/tests/custom/    # your editable tests
    5678/               # independent problem A, solutions and tests
  .cfide/workspace.json   # versioned problem index
  A/main.cpp             # editable source
  A/tests/sample-1.in    # test input
  A/tests/sample-1.out   # expected output (optional)
  B/main.py              # a Python problem
```

Code and saved tests survive VS Code restarts; select the problem in the sidebar to reopen it. Runtime results are session-only. Existing problem directories are never overwritten. After external file edits, use **CFIDE: Refresh Problems** and reopen the problem.

Reimporting a statement updates official samples, not solutions or custom tests. Downloaded statements remain readable offline; only supported Codeforces-hosted raster images are cached, with warnings for unavailable assets. Existing 0.1/0.2 local practice folders continue to work. The first workspace folder is used; multi-root selection is not implemented.

## Development

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run package
# Optional live read-only checks (may fail when Codeforces requires site verification):
CFIDE_LIVE=1 npm test -- test/live/codeforces.test.ts
# Opt-in native-browser transport check; opens/closes a disposable dedicated browser, no login or submissions:
CFIDE_DEDICATED_LIVE=1 npm test -- test/live/dedicated-browser.test.ts
```

Integration tests invoke a real C++ compiler and Python 3; set `CXX` and `PYTHON` to choose them. CI is configured for Linux, Windows and macOS. VS Code UI smoke steps are in `test/MANUAL.md`.

Architecture: `domain` contains models/checking; `application/contest-service.ts` coordinates contest imports, retries and durable submission receipts; `infrastructure/codeforces` separates the public API, authenticated website session, parser and rate-limited request queue; `infrastructure/storage` isolates contests and persists caches/snapshots; `vscode` adapts commands, native trees, panels and SecretStorage; React `webview` renders the center, statements and tests. `shared` defines validated message protocols. All Codeforces requests share a serialized queue with at least 2.1 seconds between request starts; submissions/status take priority over ranking refreshes.

## Milestone scope

This is an experimental contest-workbench prototype, not a production-ready guarantee for live contests. Stress testing, custom checkers, multi-root workspaces and web-only VS Code are not implemented. Desktop local workspaces are the supported starting point; remote workspaces require additional validation. Automated integration tests exercise real local compilers/interpreters and synthetic Codeforces responses. Keep an official-site fallback for a real contest until authenticated end-to-end testing has been completed.

The publisher ID is a development placeholder. No Marketplace publication is configured. No open-source license has been selected yet; all rights reserved.
