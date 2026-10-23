# Extension UI smoke test

1. Build, press F5, and open a fresh trusted folder in the Extension Development Host.
2. Create A from the CFIDE activity bar and choose C++. Confirm `main.cpp` opens beside the test panel.
3. Run the default `2 3 → 5` example. Expect AC and actual output `5`.
4. Change expected output to `6`, save, run. Expect WA, token 1, expected `6`, actual `5`.
5. Add and save a custom test. Verify its `.in` and `.out` files, run individually, then delete.
6. Uncheck expected output, save, run. Expect RAN. Check expected output with blank text; expect WA for nonempty stdout.
7. Introduce a syntax error. Expect compiler diagnostics. Return a nonzero exit code. Expect RE.
8. Use an infinite loop; expect TLE. Run and immediately click Stop; expect cancellation.
9. Reopen VS Code, select A, and verify source and tests persist. Create A again; verify no source is overwritten.
10. In an untrusted folder, verify compile/run is blocked. Set an invalid compiler path; verify an actionable error and a re-enabled Run button.
11. Edit an input without saving; verify Run buttons are disabled until saving.
12. Switch between A and B; verify no results or unsaved drafts from A appear under B.

These are manual acceptance checks, not claims of automated GUI verification.

## Python acceptance checks

1. Create B and choose Python 3. Verify `B/main.py`, Python 3 labels in the sidebar/panel, and the default sample returning AC.
2. Edit expected output to `6`, save and run; expect WA and first-token difference. Add custom tests and test run-only mode.
3. Use the Run Tests keyboard shortcut with `main.py` active; verify it runs B rather than a previously selected C++ problem.
4. Raise an exception or add invalid syntax; verify RE and a traceback under stderr. Test an infinite loop, Stop, and an invalid interpreter path.
5. Reopen an existing 0.1.0 C++ workspace and create a Python problem alongside it. Confirm both sources and saved tests are preserved.
6. Set `cfide.python.templatePath` and an absolute virtual-environment interpreter path; verify both are used.

## Validation performed on 2026-10-24

Version 0.2.0: in the same VS Code development workspace, selected Python 3, created B alongside the legacy C++ problem A, opened `B/main.py`, ran the default sample to AC, and changed/saved the expectation to obtain WA with token 1 expected `6`, actual `5`. Automated Python integration tests cover persistence, mixed languages, legacy metadata, individual tests, runtime/syntax errors, time/output limits, cancellation, interpreter arguments, sibling imports, UTF-8 and missing interpreters.

On macOS in a real VS Code Extension Development Host, verified: restricted-workspace execution blocking, creating A, opening the C++ source beside the React test panel, the default sample returning AC, editing expected output to produce WA with the first-token difference, adding/saving a custom `10 20 → 30` test, and running both tests together. Unsaved test edits disabled Run buttons. Other items above remain the repeatable acceptance checklist.

Automated tests additionally cover persistence, duplicate protection, path validation, run-only mode, test deletion, compilation errors, runtime errors, time limits, output limits, cancellation, missing compilers, and token comparison edge cases. Windows and Linux are configured in CI but have not been executed locally.
