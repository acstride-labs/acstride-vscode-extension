# CFIDE

A VS Code contest workbench. The first milestone provides a local C++ workflow: create a problem, edit code, add tests, compile, run, and inspect output differences.

## Try it

1. Install Node.js 24 LTS and a C++ compiler (`g++` or `clang++`).
2. Run `npm ci` and `npm run check` in this repository.
3. Open this repository in desktop VS Code and press **F5** (`Run CFIDE Extension`).
4. In the Extension Development Host, open an empty local folder and trust it.
5. Run **CFIDE: Create Local Problem** from the Command Palette (or the CFIDE sidebar).
6. Enter an ID such as `A` and a title. The default source sums two integers, with a `2 3 → 5` example test.
7. Edit `A/main.cpp`; use **Run all tests** in the adjacent test panel, or **CFIDE: Run Tests** (`Cmd+Alt+R` on macOS, `Ctrl+Alt+R` elsewhere).
8. Add a test, enter input and optional expected output, and click **Save changes**. Set expected output to `6` for input `2 3` to see a WA and the first differing token.

To install outside the development host, run `npm run package` and use VS Code's **Extensions: Install from VSIX...** command with the generated `.vsix` file.

## Configuration

- `cfide.cpp.compiler`: compiler executable or absolute path; defaults to `g++`. Use `clang++` on macOS if preferred.
- `cfide.cpp.args`: default `-std=c++20 -O2 -Wall -Wextra` (an argument array, no shell).
- `cfide.run.timeoutMs`: per-test wall-clock limit; default 2000 ms.
- `cfide.cpp.templatePath`: optional absolute template path. `${PROBLEM_ID}` is replaced with the local ID.

The compiler must already be installed. On macOS, CFIDE detects the active Apple SDK for Apple clang to resolve standard-library headers. C++ language completion is supplied by your existing language extension (for example clangd), not by CFIDE.

## Results

`AC` means local expected tokens match, **not** official acceptance. `WA` reports the first different, missing, or extra token. Whitespace is ignored; case and numeric spelling are preserved. `RAN` means no expected output was supplied. `RE`, `TLE`, `OLE`, compile diagnostics and cancellation are displayed separately. Blank expected output is a real expectation; uncheck it to run without checking.

Each run saves the source and compiles a snapshot once, then executes tests sequentially in a temporary working directory. Compilation is limited to 30 seconds; combined stdout/stderr is capped at 1 MB per process. Stop terminates the process tree. This is local process execution, **not a security sandbox**. Timings are wall-clock measurements and are not equivalent to Codeforces time limits. Memory usage is not measured.

## Workspace data

```text
your-workspace/
  .cfide/workspace.json   # versioned problem index
  A/main.cpp             # editable source
  A/tests/sample-1.in    # test input
  A/tests/sample-1.out   # expected output (optional)
```

Code and saved tests survive VS Code restarts; select the problem in the sidebar to reopen it. Runtime results are session-only. Existing problem directories are never overwritten. After external file edits, use **CFIDE: Refresh Problems** and reopen the problem.

## Development

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run package
```

Integration tests invoke a real C++ compiler; set `CXX` to choose it. CI covers Linux, Windows and macOS. VS Code UI smoke steps are in `test/MANUAL.md`.

Architecture: `domain` contains pure models/checking, `application` orchestrates use cases through ports, `infrastructure` implements storage and process execution, `vscode` adapts commands/views, and `webview` renders the test UI. `shared/protocol.ts` defines validated host messages. There is no backend service or telemetry.

## Milestone scope

This is a local-problem prototype. Codeforces imports, statements, submission tracking, contest timers, stress testing, multi-root workspaces and web-only VS Code are not implemented yet. Desktop local workspaces are the initial supported workflow; remote workspaces require additional validation.

The publisher ID is a development placeholder. No Marketplace publication is configured. No open-source license has been selected yet; all rights reserved.
