# AC-Stride

Previously named CFIDE. Part of [AC-Stride](https://github.com/acstride-labs):
[VS Code extension](https://github.com/acstride-labs/acstride-vscode-extension),
[Codeforces CLI](https://github.com/acstride-labs/acstride-cf-tool), and
[product website](https://github.com/acstride-labs/acstride-web).

The extension ID, `cfide.*` namespace and `.cfide` workspace data remain compatible
with existing installations. Build environment variables
retain their `CFIDE_` prefix.

A Codeforces extension for desktop VS Code, with C++, Python, Java and Kotlin support and English, 简体中文, Русский and 日本語 interfaces. The extension uses a pinned, embedded ACStride CF Tool as the sole Codeforces client for metadata, statements, samples, images, submission records and rankings. The anonymous statement downloader, private Python runtime, curl_cffi, CA certificates and CF Tool are bundled in the platform-specific VSIX: no user-side Go/Python/pip setup or extra downloads.

## What is included

- Multiple contest folders, independent problems, countdowns and incremental downloads when problems are released. The sidebar groups Codeforces contests, independent Codeforces problems and local practice; each contest opens a compact problem list with official attempt-state icons.
- Public statements with sanitized HTML, local math rendering, supported image caching and official samples.
- Separate C++, Python, Java and Kotlin solutions for each problem, sharing read-only official samples and editable custom tests.
- Compilation/execution, cancellation, stdout/stderr, local AC/WA/RE/TLE/OLE/CE and first-token output differences.
- Public submissions by a configurable handle, official verdicts including pretests vs final acceptance, cached rankings, top 100, nearby-handle and search views.
- One-click submission with an official-language picker and a native confirmation dialog showing the account, problem, language and file. Receipt reconciliation binds notifications to an exact submission ID; pretests and final acceptance remain distinct.
- Compact case tabs: verified passes are green, all abnormal verdicts are red; run-only results stay neutral. Single-case runs preserve other results and switching tabs preserves unsaved test drafts.
- Configurable four-language interface, live switching and a separate settings page for preferences/tools.

Public downloads and rankings remain anonymous. One-click submission uses CF Tool's **experimental** session/submission commands only after explicit user action and confirmation. Sign in from the **Codeforces account** section at the top of **Settings**, using native VS Code username/password inputs; only CF Tool receives credentials via stdin, and it stores the resulting session in the OS keyring. The extension never stores passwords or imports browser cookies. Use **AC-Stride: Sign in to Codeforces** to reconnect and **Sign out of Codeforces** to remove the local session.

Login and automatic submission have not been verified against a real account. Site verification/2FA may prevent them. Unknown submissions are never automatically resent. Receipts survive restart and are checked against exact source identity before an official submission ID is monitored. An unknown receipt may require checking the official website; do not repeatedly submit. No CAPTCHA is solved or bypassed.

The CLI owns all Codeforces HTTP, statement/sample parsing and image downloads. The extension validates structured results and sanitizes HTML for display. Tools are bundled in the VSIX with no runtime downloads.

## Start here

1. Install the VSIX matching your operating system and CPU using **Extensions: Install from VSIX…**. Build targets are Windows x64, macOS Apple Silicon/Intel and Linux x64 (glibc, Ubuntu 22.04+ baseline); other architectures and Alpine/musl are not supported yet. Marketplace publishing is not configured.
2. Open a trusted, single local workspace folder. A C++ compiler and/or Python 3 is only required to **run your own solutions**, not to download/read problems.
3. Open **AC-Stride: Open Contest Center**. Public problem downloads are automatic and always enabled; there is no setup or manual download switch.
4. Set the default programming language beside code templates in global Settings. Use the plus beside Codeforces Contests to import a contest URL or numeric ID; imports never prompt for language. Released problems download automatically. Keep VS Code running through the start for upcoming contests. Missing statements show download progress; each problem gets up to four automatic attempts with backoff, then a failure message. Selecting an undownloaded/failed problem starts or resumes a download cycle, with duplicate requests merged. Old auto-download-off settings are ignored. Archived contests pause background work.
5. Open a problem: the square A/B/C… buttons switch problems, with statement on the left, native VS Code editor on the right and tests beneath the code. Resize the dividers as needed. Use the top language control to switch between C++ and Python without discarding either source. Official samples are read-only; **+** adds and selects a custom-case tab.
6. Beside **Run all**, **Copy code and open submission** saves and copies the selected source and opens the official submission page. **One-click submit** stays disabled until you sign in from Settings; the adjacent **Go to sign in** link opens that page. Once signed in, **One-click submit** saves the selected language's source, checks your session, lets you choose a matching official language, and opens a second confirmation dialog. Cancelling sends nothing. Source/account changes abort sending. After exact receipt verification, official results appear in VS Code notifications. Unknown receipts remain pending across restarts; source is never automatically resubmitted. After login, **My Codeforces handle** is synchronized to the authenticated handle and locked. When signed out, you may edit it for public ranking/submission views.

The built-in anonymous downloader is **not a guarantee against site verification**. No CAPTCHA is solved or bypassed by the extension. Failed downloads do not block local coding/testing or erase saved work. An absent/incompatible bundled executable reports a reinstall-the-correct-VSIX error; AC-Stride never silently downloads components or falls back to installing pip packages.

### No system Python changes

The private runtime lives only inside AC-Stride's extension directory and is launched by CF Tool using an install-relative absolute path as a short-lived child process. It does not install a system interpreter, modify PATH/environment variables, register file associations, install packages in user environments, start a browser or listen on a port. Python/native-library injection variables are removed only from the child's environment. HTTPS uses the bundled certifi CA store; standard proxy environment settings remain available. New CA/native-library versions ship with extension updates, not runtime component installers. Existing OS security controls are not bypassed.

This runtime is exclusively for public downloads, not for executing solutions. The solution Python interpreter/compiler remains user-configurable and separate.

### If a problem cannot be downloaded

Downloads retry automatically up to four times per problem. Selecting a failed problem starts another bounded attempt cycle; the statement pane updates on success/failure. You can keep coding and editing custom cases while waiting. Imported samples refresh the open test view without discarding custom drafts. Existing code, tests and cached statements are preserved.

## Independent Codeforces problems

Use the plus beside **Codeforces Problems**, then paste a regular contest/problem URL, a problemset URL, or an ID such as `2261A`. Only that problem is imported. The statement has no multi-problem rail, while code editing, official samples, custom tests, copying/submitting and verdict notifications reuse the contest workflow. Files are isolated in `codeforces-problems/<contestId>/`, and importing a single problem does not add its contest to the contest list. Reimporting opens the saved solution without replacing code or changing its import order.

All three sidebar lists use the original import timestamp, newest first. Refreshing, reopening and switching languages preserve it. Older data uses the original folder creation time as a fallback. New imports use the global default language; existing solutions keep their selected language. A contest statement's rail has a rankings-style icon that returns to that contest's details.

## Local practice

**AC-Stride: Create Local Problem** works independently of Codeforces. Enter an ID/title; the language comes from the default programming language setting. The default template sums two integers with a `2 3 → 5` test. Run using the tests pane below the editor or `Cmd+Alt+R` on macOS / `Ctrl+Alt+R` elsewhere. **AC-Stride: Switch Solution Language** also works for local practice. Change expected output to `6` to inspect a WA difference.

Local AC is **not official acceptance**. The default checker compares tokens, ignoring whitespace but preserving case and numeric spelling. Uncheck expected output for run-only mode; blank expected output is a real expectation. Memory use is not measured, and wall-clock timings are not Codeforces timings. Local programs execute on your computer: this is **not a security sandbox**. Output is capped at 1 MB per process, compilation at 30 seconds, and each test has a configurable wall-clock limit.

## Settings

The AC-Stride sidebar has three native peer views, independently toggleable from the container’s “…” menu. Each has one plus action: import a contest, import a Codeforces problem, or create a local problem. The native VS Code extension settings page starts with an **Open AC-Stride settings panel** command link above the interface-language selector. The settings gear is in the contest view toolbar; stable VS Code APIs do not support adding a custom gear to a multi-view container title. Click a contest to open its information page. Global Settings contains Codeforces login, interface language, your handle, C++/Python tools/arguments/templates, local time limit and environment checks. Contest information and statements share one editor tab named after the contest. The left rail combines the overview/rankings icon and problem buttons; there is no Problems tab. The header shows an ended label or countdown. There is no per-contest settings tab. No downloader-status panel or center-navigation button crowds Settings. Language applies immediately without discarding open forms or test drafts; statements, code and raw tool diagnostics stay in their original language.

Choose **User settings** or **This workspace** before editing tool/tracking settings. Workspace settings override user settings; environment checks use the active saved configuration. Save/discard draft changes before switching scope or contest. Language is always an application-level user preference. Archive preserves all local code/tests.

Environment checks are at the top of Settings. **Check all** (自动检测) checks configured C++ compilation/execution and Python execution, continues if one fails, and marks each result separately. It does not install tools, scan arbitrary executables or change your configuration. Passed checks show a green tick; failures have expandable diagnostics. Changing tool configuration clears previous ticks, and checks must be rerun after reloading VS Code.

Under **Code templates**, choose C++ or Python on the left and paste starter code in the editor on the right. Drafts are independent, so switching the language does not lose edits. Save Settings to persist them at the selected user/workspace scope; Restore default fills the built-in template. `${PROBLEM_ID}` inserts the problem index. Templates are used only when creating a new solution file (including the first switch to a language); existing solutions are never replaced. Inline code takes priority over the legacy template-file setting. Empty inline code falls back to that file or the bundled default.

- `cfide.solution.defaultLanguage`: `cpp`, `python`, `java` or `kotlin` for newly imported contests/problems and local practice.
- `cfide.ui.language`: `auto` (follow VS Code), `en`, `zh-CN`, `ru`, `ja`.
- `cfide.codeforces.handle`: optional public read-only handle; no password is needed.
- `cfide.cpp.compiler`: compiler executable/path, default `g++`; `clang++` is supported.
- `cfide.cpp.args`: argument array, default `-std=c++20 -O2 -Wall -Wextra`.
- `cfide.python.interpreter`: solution interpreter, default `python3`; independent of the download helper and Microsoft's Python extension.
- `cfide.python.args`: additional solution interpreter arguments.
- `cfide.run.timeoutMs`: per-test timeout, default 2000 ms.
- `cfide.{cpp,python,java,kotlin}.templateCode`: editable starter code with `${PROBLEM_ID}` substitution.
- `cfide.{cpp,python,java,kotlin}.templatePath`: legacy optional template files, used only when inline code is empty.

C++ completion comes from your installed language extension, not AC-Stride. Python syntax/runtime errors show tracebacks. Every test uses a fresh process. C++ source snapshots compile once per run; Python executes a source snapshot with UTF-8/unbuffered mode. The macOS compiler helper detects the active Apple SDK where needed.

UI text is maintained in four JSON catalogs shared by React and the extension host, with key/parameter checks and English fallback. Native static VS Code command/menu/configuration labels use generated `package.nls*.json` resources and follow VS Code's own display language; AC-Stride's live preference controls its pages, tree labels and dynamic notifications. See [the localization/settings design](docs/localization-and-settings.md) for architecture and adding translations.

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

Solutions, saved tests and cached public data persist across restarts. Run results are session-only. Archive stops background contest work; reimport never overwrites solutions/custom tests. Existing local-practice and contest folders remain readable. Legacy browser profiles and 0.5's download venv are **not automatically deleted** and are not used. Modern CF Tool sessions live in the OS keyring; modern submission receipts/source snapshots live in its private state directory. Extension tracking metadata lives in VS Code global state and contains no passwords/cookies/source. The removed `codeforces.setupPython` / `downloadPython` settings are ignored. No Chrome installation is removed. No backend service or telemetry is used.

## Development and verification

Node.js 24 LTS is required for development. **Developers/CI only** need Python 3.10+ to build the downloader. Its pinned build dependencies install into the git-ignored `.build/downloader/venv`; frozen output is generated under `resources/downloader/`, also git-ignored. No prebuilt native binaries are committed. A real C++ compiler and solution Python interpreter are used by integration tests; override `CXX` / `PYTHON` if needed.

```sh
npm ci
npm run build:cf-tool
npm run build:downloader
npm run check
npm run package
npm run verify:vsix
# Optional public live checks using the bundled binary, never a system Python:
CFIDE_LIVE=1 npm test -- test/live/codeforces.test.ts
```

Set `CFIDE_BUILD_PYTHON` to an absolute build interpreter path if needed. `npm run package` refuses to produce a VSIX without the matching, hash-verified working downloader. It always sets the VSIX platform target. CI builds all four targets independently, verifies frozen startup with empty PATH and invalid PYTHONHOME/PYTHONPATH, and extracts the final VSIX to check file hashes/executable permissions/startup. Package notices accompany the binary. See `packaging/README.md` for distribution details.

Live public checks are opt-in (`CFIDE_LIVE=1`) and exercise the actual bundled CLI for metadata, public submissions, standings, structured statements and workspace sample import. Fixture and offline checks do not establish live website availability or success on other platforms. See `test/MANUAL.md` for acceptance steps.

Architecture: `domain` contains local models/checking; `application` handles scheduling and workspace imports; `infrastructure/codeforces` contains the CLI adapter, typed data mapping, display sanitization and a priority queue. All network requests, Codeforces DOM parsing, samples and image caching belong to CF Tool. The extension owns solutions/custom tests, native views, countdowns and React UI. CF Tool coordinates request starts across its processes with a shared 2.1-second minimum interval. The extension has no direct network transport, including in source development mode; build the embedded tools before testing Codeforces features.

Only regular public contests and desktop single-folder file workspaces are supported. Gym/group/private contests, virtual participation, stress testing, custom checkers and web-only VS Code are out of scope. Public API data may be unavailable, frozen, delayed or limited to recent submissions. The publisher is a development placeholder, no Marketplace release is configured, and no open-source license has been selected.

Background rankings refresh only while the Rankings tab is visible. Submission refresh normally runs at 30-second intervals, with faster polling for known pending submissions. A background network failure keeps cached data and shows a section-specific notice rather than a persistent global error. Diagnostics identify the contest and operation in the **AC-Stride · Codeforces** output channel. Manual operation failures still report errors. Public API operations have a 25-second total deadline (including tool-side pacing); downloads use a longer deadline.

### AI connection and statement translation

Settings has four tabs: Environment checks, Basic settings, Coding settings and AI assistance. Configure an OpenAI-compatible Base URL and model under AI assistance; API keys are stored in VS Code SecretStorage and bound to the endpoint. Test connection displays the returned message or error.

Under AI assistance, enable statement translation, optionally translate automatically after import, and edit the English default prompt. Choose a target language; every `{{language}}` placeholder is replaced with its English language name before sending, without changing the saved prompt. Simplified Chinese is the default, with traditional Chinese, English, Russian, Japanese, Korean, German, French and Spanish also supported. Restoring the default prompt requires confirmation and changes only the draft until saved. Translation is off by default. Clicking the translation icon next to a problem ID toggles original/translated statements; unfinished tasks show progress and failed tasks can be retried. Only problem HTML is sent to the configured model. Code and tests are not sent. Mathematics, samples and allowed local images are retained; generated HTML is sanitized before display.

AI requests use a shared input/output cache before transport. It coalesces identical in-flight requests, runs at most two model calls concurrently, and uses a persisted LRU under extension global storage. Configure its enable switch, entry limit (default 100) and storage limit (default 50 MB) in AI assistance. Either limit evicts least recently used entries; oversized results are returned without displacing existing entries. Disabling caching preserves saved entries but skips request reads/writes. Connection tests always bypass caching. Cache identity covers the actual endpoint, model and fully rendered messages, partitioned by a credential digest; raw API keys are never persisted. Failures are not cached. Translation rendering separately sanitizes cached/generated HTML.

## Java and Kotlin

Install a JDK (17 or newer recommended). Kotlin also requires the standalone Kotlin compiler on PATH. These solution toolchains are detected locally, rather than bundled into the extension. In Settings → Coding, choose Java or Kotlin as the default language and customize the starter code. Settings → Environment checks compiles and runs a small program for each language.

- Java uses `Main.java` with a `Main` class and `public static void main(String[] args)`.
- Kotlin uses `Main.kt` with a top-level `fun main()`; its JAR includes the Kotlin runtime.
- Configure `cfide.java.compiler` (`javac`) or `cfide.kotlin.compiler` (`kotlinc`), `.args` for compiler arguments, `.runtime` (`java`) and `.runtimeArgs` for JVM flags. Each command accepts an executable name or absolute path, without embedded arguments. On Windows, the official Kotlin distribution's `bin/kotlinc.bat` is supported through a shell-free Java launcher.
- Compilation has a separate 60-second limit; each test uses the configured local execution timeout. Temporary source snapshots and build outputs are removed after completion or cancellation.
- Switch languages from the workbench selector. Existing source files are preserved. Codeforces submission offers the matching Java or Kotlin compiler versions supplied by the contest; choose a version compatible with your code and local toolchain.

### AI Hint, Debug and Coding

Configure and test your provider under **Settings → AI assistance**. The original English statement is used even while a translated view is selected. Please do not use these features during an ongoing contest.

- **AI Hint**: open it beside the statement identity. By default three progressive hints are generated; each stays hidden until its eye button is clicked. Configure 1–10 hints.
- **AI Debug**: open it on the workbench. It sends the English statement and the current solution text, including unsaved editor changes, and asks for issues and explanations without corrected source code.
- **AI Coding**: open a read-only editor-style dialog with reference code in the current solution language. Copy it if needed; the extension never replaces source files or submits generated code. Generated references still need review and testing.

Each feature has a visibility switch, response-language selector, and editable prompt. Save AI assistance settings to apply them. Restoring a default prompt requires confirmation and updates only the draft until saved. `{{language}}`, `{{programmingLanguage}}`, and `{{hintCount}}` are substituted before requesting the model; the original prompt is preserved. Statement/source data is provided separately. Tasks share the configured input/output cache and duplicate in-flight requests are merged. Results for an old problem cannot appear in another problem’s dialog.

## Incremental downloads

Contest import fetches a lightweight problem list without loading the complete leaderboard. CF Tool downloads the first problem's statement and samples first, then starts two FIFO consumers for the remaining problems. Completion order can differ when requests take different amounts of time. Standalone imports download just the requested problem.

Statements and samples become usable before images finish. Images are cached in a separate background queue and update the open statement automatically. Public reads use one persistent CF Tool process and a two-process anonymous transport pool to reuse network connections. Closing the window cancels pending work and reaps those processes; cached statements, code and tests remain available. Existing request pacing and bounded retry behavior remain in place. Full rankings are fetched for the visible overview after a statement is available, or when explicitly refreshed.
