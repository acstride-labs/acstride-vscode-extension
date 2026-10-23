# Changelog

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
