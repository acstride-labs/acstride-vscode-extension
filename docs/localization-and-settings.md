# Localization and settings architecture (0.8)

## Interaction and ownership

The contest sidebar has three ordered actions: add (`+`), contest center (trophy), settings (gear). `cfide.openSettings` opens one retained settings tab, independently of Contest Center. It also works without a workspace for selecting the interface language. Local practice has a settings shortcut too.

Contest info contains problem downloads/retries, submissions, rankings and a per-contest settings tab. Default language, automatic downloads and archive apply only to that contest; they no longer appear in global Settings. Saved-HTML import has been removed.

Settings contains:

| Section                                                               | Persistence                                                     |
| --------------------------------------------------------------------- | --------------------------------------------------------------- |
| Display language: follow VS Code, English, 简体中文, Русский, 日本語  | Application-level `cfide.ui.language`, user preference          |
| Public handle, C++/Python tools/arguments/templates, local time limit | Explicit user or current-workspace VS Code configuration target |
| Environment checks                                                    | Diagnostics, not another installer                              |

The selected scope loads the values for that scope: user values inherit defaults; workspace values inherit user/defaults. The effective execution configuration still follows VS Code's precedence. UI language cannot be overridden by a contest/workspace. Machine-specific compiler/interpreter/template keys use `machine-overridable` so explicit workspace overrides are supported. Environment checks test the **active** saved configuration, which may include workspace overrides.

## Configurable language resources

Write for developers in each locale, not as a literal translation of the resource ID. Chinese uses established terms such as `token`, `Handle`, `Hack`, JSON and API rather than unfamiliar coined equivalents (for example, do not render `token` as “词元”). Use “代码”, “编程语言” and “用例” for source, language selection and local test cases. Russian `токен` and Japanese `トークン` are conventional local technical terms and should not be forcibly replaced with English. Keep error messages short, actionable and accurate; preserve parameters and distinguish official verdicts from local results. Wording regression tests cover the first-mismatch messages in all four locales.

`src/shared/locales/{en,zh-CN,ru,ja}.json` are the only editable translation catalogs. Stable English source messages serve as resource IDs; translations are values, never branching conditions. Keep canonical source IDs stable when refining a translation. The shared `src/shared/i18n.ts` resolves the locale and renders `{name}` parameters. Unknown languages fall back to English; unknown technical diagnostics are retained rather than modified. Known canonical diagnostic templates can be translated at presentation time without rewriting persisted errors.

Locale resolution: an explicit supported preference wins; otherwise follow VS Code's display language. Supported Chinese tags resolve to simplified Chinese, Russian/Japanese regional tags resolve to their base locale, other languages fall back to English. There are four supported languages; `auto` is a selection mode, not a fifth translation.

Both extension-host views/dialogs and React use the same catalogs. Webview HTML starts with a safe resolved `lang` attribute. On configuration changes the host broadcasts a `locale` message; React updates labels without remounting editors/forms or requesting new test state. Unsent test inputs, settings drafts, current tab/search and local test results remain in memory. Host-owned tree titles, notifications, status text and statement placeholders also update. Problem titles/statements, source code, test input/output and raw compiler/interpreter diagnostics are not translated.

VS Code's **static native** command palette/menu labels, welcome content and built-in configuration descriptions use standard `package.nls*.json` localization. They follow the VS Code display language (and its normal reload rules), not CFIDE's independent runtime preference. `scripts/build-localization.mjs` generates these files from the shared catalogs plus `resources/localization/manifest.json`. Do not hand-edit the generated NLS files. This distinction does not require reloading CFIDE's pages when changing its own language.

## Data flow and safeguards

`SettingsApp → validated settings-protocol → SettingsController → VS Code config → configuration event → host views + locale message`.

Settings requests have separate strict schemas and allowlists; The contest protocol accepts a strict, contest-ID-scoped saveContestSettings request; global Settings rejects it. No arbitrary paths or preference keys are accepted. Validate the complete payload before writing. Language can change without a trusted workspace; execution and contest writes require trust. Writes are serialized within the settings controller, and partial configuration failures restore already-written values; failed restoration has an explicit error. Changing global scope or the selected contest is disabled while its respective form has unsaved edits. Contest-option drafts remain mounted when switching detail tabs. Busy and save acknowledgements are distinct from editable drafts. No credentials or downloader Python paths are introduced.

Changing a default solution language or archiving never deletes existing solutions/custom tests. Archived contests stop future automatic background work; ongoing downloads are not forcibly cancelled. Language changes are presentation-only and do not touch contest directories or execute tools.

## Verification and maintenance

Automated checks enforce four-catalog key/placeholder parity, literal translation-call coverage, safe fallback/interpolation, complete native NLS references, setting range/type/allowlist validation, scope separation, untrusted-workspace boundaries, and rollback on partial writes. Existing local C++/Python and anonymous download tests remain intact. Final-VSIX verification includes all four native NLS files as well as the private downloader.

For a wording change, edit the corresponding JSON values and run `npm run build` to regenerate native NLS, then `npm run check`. For a new message, add the same key and parameters to all four catalogs. For a future language, add a catalog, register the locale/selection, extend native generation and tests, then verify actual UI layout. No backend translation service, machine translation of statements or extra user-side package is involved.
