# CFIDE

An anonymous Codeforces workbench for desktop VS Code, with C++ and Python support. Version 0.6 bundles its public problem downloader, private Python runtime, curl_cffi and CA certificates directly in the platform-specific VSIX. Install CFIDE and use public downloads immediately: no Python/pip setup, extra component downloads or browser connection.

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

1. Install the VSIX matching your operating system and CPU using **Extensions: Install from VSIX…**. Build targets are Windows x64, macOS Apple Silicon/Intel and Linux x64 (glibc, Ubuntu 22.04+ baseline); other architectures and Alpine/musl are not supported yet. Marketplace publishing is not configured.
2. Open a trusted, single local workspace folder. A C++ compiler and/or Python 3 is only required to **run your own solutions**, not to download/read problems.
3. Open **CFIDE: Open Contest Center**. The built-in public downloader is ready automatically; there is no setup or installation button.
4. Add a regular Codeforces contest URL or numeric ID and choose the default language. Keep VS Code running through the start for scheduled imports. Overdue imports resume on reopening; individual failures retry with backoff.
5. Open a problem: solution on the left, cached statement on the right, **CFIDE Tests** below. Switch languages without discarding either solution. Official samples are read-only; add your own tests separately.
6. Use **Copy solution code**, then submit on the official website yourself. Set **Track public handle** to see public submission results and nearby rankings. Clear the handle to stop tracking.

The built-in anonymous downloader is **not a guarantee against site verification**. No CAPTCHA is solved or bypassed by the extension. Failed downloads do not block local coding/testing or erase saved work. An absent/incompatible bundled executable reports a reinstall-the-correct-VSIX error; CFIDE never silently downloads components or falls back to installing pip packages.

### No system Python changes

The private runtime lives only inside CFIDE's extension directory and is launched by absolute path as a short-lived child process. It does not install a system interpreter, modify PATH/environment variables, register file associations, install packages in user environments, start a browser or listen on a port. Python/native-library injection variables are removed only from the child's environment. HTTPS uses the bundled certifi CA store; standard proxy environment settings remain available. New CA/native-library versions ship with extension updates, not runtime component installers. Existing OS security controls are not bypassed.

This runtime is exclusively for public downloads, not for executing solutions. The solution Python interpreter/compiler remains user-configurable and separate.

### If a problem cannot be downloaded

Use **Import saved HTML** on that problem's card and select an HTML file you saved from the correct public problem page. Confirm the contest/problem pairing. The parser sanitizes the statement and extracts official samples; it does not execute the imported scripts. Import/reimport updates only the statement and official samples, preserving solutions and custom tests. Standalone HTML without the original Codeforces statement structure, PDF files, and incomplete sample pairs are not supported. Some images may still require network access.

## Local practice

**CFIDE: Create Local Problem** works independently of Codeforces. Choose C++ or Python and enter an ID/title. The default template sums two integers with a `2 3 → 5` test. Run using the bottom panel or `Cmd+Alt+R` on macOS / `Ctrl+Alt+R` elsewhere. Change expected output to `6` to inspect a WA difference.

Local AC is **not official acceptance**. The default checker compares tokens, ignoring whitespace but preserving case and numeric spelling. Uncheck expected output for run-only mode; blank expected output is a real expectation. Memory use is not measured, and wall-clock timings are not Codeforces timings. Local programs execute on your computer: this is **not a security sandbox**. Output is capped at 1 MB per process, compilation at 30 seconds, and each test has a configurable wall-clock limit.

## Settings

- `cfide.codeforces.handle`: optional public read-only handle; no password is needed.
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

Solutions, saved tests and cached public data persist across restarts. Run results are session-only. Archive stops background contest work; reimport never overwrites solutions/custom tests. Existing local-practice and contest folders remain readable. Old account/submission snapshot files, browser profiles and 0.5's download venv are **not automatically deleted**, but are no longer read, launched or used. The removed `codeforces.setupPython` / `downloadPython` settings are ignored. No Chrome installation is removed. No backend service or telemetry is used.

## Development and verification

Node.js 24 LTS is required for development. **Developers/CI only** need Python 3.10+ to build the downloader. Its pinned build dependencies install into the git-ignored `.build/downloader/venv`; frozen output is generated under `resources/downloader/`, also git-ignored. No prebuilt native binaries are committed. A real C++ compiler and solution Python interpreter are used by integration tests; override `CXX` / `PYTHON` if needed.

```sh
npm ci
npm run build:downloader
npm run check
npm run package
npm run verify:vsix
# Optional public live checks using the bundled binary, never a system Python:
CFIDE_LIVE=1 npm test -- test/live/codeforces.test.ts
```

Set `CFIDE_BUILD_PYTHON` to an absolute build interpreter path if needed. `npm run package` refuses to produce a VSIX without the matching, hash-verified working downloader. It always sets the VSIX platform target. CI builds all four targets independently, verifies frozen startup with empty PATH and invalid PYTHONHOME/PYTHONPATH, and extracts the final VSIX to check file hashes/executable permissions/startup. Package notices accompany the binary. See `packaging/README.md` for distribution details.

On 2026-10-24 the macOS arm64 frozen downloader passed offline isolation checks and all three public live checks, including Theatre Square's real `6 6 4 → 4` sample and two additional statements. The other platform builds must pass their CI jobs before distribution; configuring CI does not establish that those jobs passed. No check logs in, starts a browser, registers or submits code. This does not guarantee all future contests/network environments will work. See `test/MANUAL.md` for acceptance steps.

Architecture: `domain` contains models/checking; `application` handles contest scheduling/imports/public tracking; `infrastructure/codeforces` separates JSON API reads, anonymous problem downloads, sanitization and a serialized request queue; `infrastructure/storage` isolates contest files/caches; `vscode` adapts native views/commands; React `webview` renders the center, statements and tests. Public API calls and problem downloads are throttled with at least 2.1 seconds between queued request starts.

Only regular public contests and desktop single-folder file workspaces are supported. Gym/group/private contests, virtual participation, stress testing, custom checkers and web-only VS Code are out of scope. Public API data may be unavailable, frozen, delayed or limited to recent submissions. The publisher is a development placeholder, no Marketplace release is configured, and no open-source license has been selected.
