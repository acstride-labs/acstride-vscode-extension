# CFIDE

An anonymous Codeforces workbench for desktop VS Code, with C++ and Python support. Version 0.5 removes account login, cookies, managed browsers and in-IDE submissions. Prepare contests, read public problems, test locally and track public verdicts/rankings without signing in.

## What is included

- Multiple contest folders, independent problems, countdowns, archive controls and incremental downloads when problems are released.
- Public statements with sanitized HTML, local math rendering, supported image caching and official samples.
- Separate C++ and Python solutions for each problem, sharing read-only official samples and editable custom tests.
- Compilation/execution, cancellation, stdout/stderr, local AC/WA/RE/TLE/OLE/CE and first-token output differences.
- Public submissions by a configurable handle, official verdicts including pretests vs final acceptance, cached rankings, top 100, nearby-handle and search views.
- Copy solution code for manual submission on the official website. The extension does not send solutions anywhere.
- Saved problem HTML import as a fallback when public downloads are blocked.

There are **no login, Cookie import, browser connection, automatic submission, registration or clarification controls**. Register and submit on the official website yourself. Adding a contest locally does not register your account. Public tracking does not authenticate ownership of a handle.

## Start here

1. Install the generated VSIX using **Extensions: Install from VSIX…**, or build this repository and press F5.
2. Open a trusted, single local workspace folder. Install a C++ compiler and/or Python 3 for local solutions.
3. Open **CFIDE: Open Contest Center**. For better download compatibility, click **Set up public downloads**. This requires Python 3.10+ and installs pinned `curl_cffi==0.16.3` from PyPI into an isolated environment under VS Code extension global storage. It does not modify system Python packages or install/start a browser.
4. Add a regular Codeforces contest URL or numeric ID and choose the default language. Keep VS Code running through the start for scheduled imports. Overdue imports resume on reopening; individual failures retry with backoff.
5. Open a problem: solution on the left, cached statement on the right, **CFIDE Tests** below. Switch languages without discarding either solution. Official samples are read-only; add your own tests separately.
6. Use **Copy solution code**, then submit on the official website yourself. Set **Track public handle** to see public submission results and nearby rankings. Clear the handle to stop tracking.

Without the helper, the extension tries a basic anonymous GET downloader. Some networks/sites block it. Setting up `curl_cffi` improves compatibility but is **not a guarantee against site verification**. No CAPTCHA is solved or bypassed by the extension. Failed downloads do not block local coding/testing or erase saved work.

### If a problem cannot be downloaded

Use **Import saved HTML** on that problem's card and select an HTML file you saved from the correct public problem page. Confirm the contest/problem pairing. The parser sanitizes the statement and extracts official samples; it does not execute the imported scripts. Import/reimport updates only the statement and official samples, preserving solutions and custom tests. Standalone HTML without the original Codeforces statement structure, PDF files, and incomplete sample pairs are not supported. Some images may still require network access.

## Local practice

**CFIDE: Create Local Problem** works independently of Codeforces. Choose C++ or Python and enter an ID/title. The default template sums two integers with a `2 3 → 5` test. Run using the bottom panel or `Cmd+Alt+R` on macOS / `Ctrl+Alt+R` elsewhere. Change expected output to `6` to inspect a WA difference.

Local AC is **not official acceptance**. The default checker compares tokens, ignoring whitespace but preserving case and numeric spelling. Uncheck expected output for run-only mode; blank expected output is a real expectation. Memory use is not measured, and wall-clock timings are not Codeforces timings. Local programs execute on your computer: this is **not a security sandbox**. Output is capped at 1 MB per process, compilation at 30 seconds, and each test has a configurable wall-clock limit.

## Settings

- `cfide.codeforces.handle`: optional public read-only handle; no password is needed.
- `cfide.codeforces.setupPython`: Python 3.10+ executable for download setup, default `python3`; use `python` on Windows if necessary.
- `cfide.codeforces.downloadPython`: advanced override, an absolute existing interpreter path with `curl_cffi` installed. Leave blank to use the managed isolated environment. Clear this override before repairing the default setup.
- `cfide.cpp.compiler`: compiler executable/path, default `g++`; `clang++` is supported.
- `cfide.cpp.args`: argument array, default `-std=c++20 -O2 -Wall -Wextra`.
- `cfide.python.interpreter`: solution interpreter, default `python3`; independent of the download helper and Microsoft's Python extension.
- `cfide.python.args`: additional solution interpreter arguments.
- `cfide.run.timeoutMs`: per-test timeout, default 2000 ms.
- `cfide.cpp.templatePath` / `cfide.python.templatePath`: optional absolute templates with `${PROBLEM_ID}` substitution.

C++ completion comes from your installed language extension, not CFIDE. Python syntax/runtime errors show tracebacks. Every test uses a fresh process. C++ source snapshots compile once per run; Python executes a source snapshot with UTF-8/unbuffered mode. The macOS compiler helper detects the active Apple SDK where needed.

## Workspace and migration

```text
your-workspace/
  .cfide/contests.json
  contests/
    1234/
      .cfide/contest.json
      .cfide/statements/     # cached sanitized statements/assets
      .cfide/standings.json
      .cfide/status-HANDLE.json
      A/solutions/main.cpp
      A/solutions/main.py
      A/tests/samples/       # official, read-only in UI
      A/tests/custom/        # user-editable
    5678/                    # independent sources/tests, including its own A
  .cfide/workspace.json     # legacy local-practice index
  A/main.cpp               # local practice remains compatible
  B/main.py
```

Solutions, saved tests and cached public data persist across restarts. Run results are session-only. Archive stops background contest work; reimport never overwrites solutions/custom tests. Existing local-practice and contest folders remain readable. Old account/submission snapshot files and dedicated browser profiles are **not automatically deleted**, but 0.5 no longer reads account cookies, uses those snapshots or launches/connects to a browser. No Chrome installation is removed. No backend service or telemetry is used.

## Development and verification

Node.js 24 LTS is required for development. A real C++ compiler and Python interpreter are used by integration tests; override `CXX` / `PYTHON` if needed.

```sh
npm ci
npm run check
npm run package
# Optional public live checks; use an existing isolated interpreter with curl_cffi:
CFIDE_LIVE=1 CFIDE_CURL_PYTHON=/absolute/path/to/venv/bin/python npm test -- test/live/codeforces.test.ts
```

The live check exercises the actual anonymous product transport, real contest import, official sample parsing and additional public problem pages. It never logs in, starts a browser, registers or submits code. On 2026-10-24 these checks passed, including Theatre Square's real `6 6 4 → 4` sample. This does not guarantee all future contests/network environments will work. See `test/MANUAL.md` for acceptance steps.

Architecture: `domain` contains models/checking; `application` handles contest scheduling/imports/public tracking; `infrastructure/codeforces` separates JSON API reads, anonymous problem downloads, sanitization and a serialized request queue; `infrastructure/storage` isolates contest files/caches; `vscode` adapts native views/commands; React `webview` renders the center, statements and tests. Public API calls and problem downloads are throttled with at least 2.1 seconds between queued request starts.

Only regular public contests and desktop single-folder file workspaces are supported. Gym/group/private contests, virtual participation, stress testing, custom checkers and web-only VS Code are out of scope. Public API data may be unavailable, frozen, delayed or limited to recent submissions. The publisher is a development placeholder, no Marketplace release is configured, and no open-source license has been selected.
