# Localization and settings architecture (0.13)

## Interaction and ownership

The global settings command is exposed in the contest view toolbar. Each of the three ordered groups has one inline add (`+`) action. `codeforcesWorkbench.openSettings` opens one retained settings tab, independently of Contest Center. It also works without a workspace for selecting the interface language. Local practice uses the same global Settings page.

One contest editor, titled with its contest name, combines an overview/rankings rail button and problem buttons. Its overview contains public submissions and rankings; there is no Problems or per-contest Settings tab. A compact header label shows ended/countdown state. Automatic downloads are always enabled, with bounded per-problem retries and selection-triggered recovery. There is no manual download toggle or button. Saved-HTML import has been removed.

Settings contains:

| Section                                                               | Persistence                                                     |
| --------------------------------------------------------------------- | --------------------------------------------------------------- |
| Display language: follow VS Code, English, 简体中文, Русский, 日本語  | Application-level `codeforcesWorkbench.ui.language`, user preference          |
| Public handle, C++/Python tools/arguments/templates, local time limit | Explicit user or current-workspace VS Code configuration target |
| Environment checks                                                    | Diagnostics, not another installer                              |

The selected scope loads the values for that scope: user values inherit defaults; workspace values inherit user/defaults. The effective execution configuration still follows VS Code's precedence. UI language cannot be overridden by a contest/workspace. Machine-specific compiler/interpreter/template keys use `machine-overridable` so explicit workspace overrides are supported. Environment checks test the **active** saved configuration, which may include workspace overrides.

## Configurable language resources

Settings starts with per-language environment checks. One allowlisted `checkAllEnvironments` request checks C++ and Python independently, recording progress/success/failure without stopping at the first error. Results stay in memory, not configuration, and are invalidated when effective tool settings change. Checks execute the active saved tool configuration in a temporary folder and require workspace trust; they do not auto-install tools or rewrite paths.

Starter-code editing uses separate `cpp.templateCode` and `python.templateCode` values at the selected user/workspace scope. Settings shows resolved previews while retaining independent drafts. Inline nonblank code wins over legacy `templatePath`, then the bundled template. Only trusted workspaces may preview configured files. Template files and inline values have size limits; templates are read as text, never evaluated. `${PROBLEM_ID}` substitution happens only when creating a solution. Existing source files are protected by exclusive creation in storage. The editor replaces the old path inputs, not the existing file-based configuration keys.

Run and submit messages include their displayed problem/language identity. Both save the exact source buffer first and reject stale targets. Submission uses native login/language/confirmation dialogs, binds the source hash and confirmed account, and calls only typed Codeforces Client operations. Pending receipt IDs survive restart; exact-source reconciliation precedes result watching. No credentials/source are stored in the Webview or VS Code tracking state, and no submission is automatically resent.

Write for developers in each locale, not as a literal translation of the resource ID. Chinese uses established terms such as `token`, `Handle`, `Hack`, JSON and API rather than unfamiliar coined equivalents (for example, do not render `token` as “词元”). Use “代码”, “编程语言” and “用例” for source, language selection and local test cases. Russian `токен` and Japanese `トークン` are conventional local technical terms and should not be forcibly replaced with English. Keep error messages short, actionable and accurate; preserve parameters and distinguish official verdicts from local results. Wording regression tests cover the first-mismatch messages in all four locales.

`src/shared/locales/{en,zh-CN,ru,ja}.json` are the only editable translation catalogs. Stable English source messages serve as resource IDs; translations are values, never branching conditions. Keep canonical source IDs stable when refining a translation. The shared `src/shared/i18n.ts` resolves the locale and renders `{name}` parameters. Unknown languages fall back to English; unknown technical diagnostics are retained rather than modified. Known canonical diagnostic templates can be translated at presentation time without rewriting persisted errors.

Locale resolution: an explicit supported preference wins; otherwise follow VS Code's display language. Supported Chinese tags resolve to simplified Chinese, Russian/Japanese regional tags resolve to their base locale, other languages fall back to English. There are four supported languages; `auto` is a selection mode, not a fifth translation.

Both extension-host views/dialogs and React use the same catalogs. Webview HTML starts with a safe resolved `lang` attribute. On configuration changes the host broadcasts a `locale` message; React updates labels without remounting editors/forms or requesting new test state. Unsent test inputs, settings drafts, current tab/search and local test results remain in memory. Host-owned tree titles, notifications, status text and statement placeholders also update. Problem titles/statements, source code, test input/output and raw compiler/interpreter diagnostics are not translated.

VS Code's **static native** command palette/menu labels, welcome content and built-in configuration descriptions use standard `package.nls*.json` localization. They follow the VS Code display language (and its normal reload rules), not AC-Stride's independent runtime preference. `scripts/build-localization.mjs` generates these files from the shared catalogs plus `resources/localization/manifest.json`. Do not hand-edit the generated NLS files. This distinction does not require reloading AC-Stride's pages when changing its own language.

## Data flow and safeguards

`SettingsApp → validated settings-protocol → SettingsController → VS Code config → configuration event → host views + locale message`.

Settings requests have separate strict schemas and allowlists; The contest protocol accepts a strict, contest-ID-scoped saveContestSettings request; global Settings rejects it. No arbitrary paths or preference keys are accepted. Validate the complete payload before writing. Language can change without a trusted workspace; execution and contest writes require trust. Writes are serialized within the settings controller, and partial configuration failures restore already-written values; failed restoration has an explicit error. Changing global scope or the selected contest is disabled while its respective form has unsaved edits. Contest-option drafts remain mounted when switching detail tabs. Busy and save acknowledgements are distinct from editable drafts. No credentials or downloader Python paths are introduced.

Changing a default solution language or archiving never deletes existing solutions/custom tests. Archived contests stop future automatic background work; ongoing downloads are not forcibly cancelled. Language changes are presentation-only and do not touch contest directories or execute tools.

## Verification and maintenance

Automated checks enforce four-catalog key/placeholder parity, literal translation-call coverage, safe fallback/interpolation, complete native NLS references, setting range/type/allowlist validation, scope separation, untrusted-workspace boundaries, and rollback on partial writes. Existing local C++/Python and anonymous download tests remain intact. Final-VSIX verification includes all four native NLS files as well as the private downloader.

For a wording change, edit the corresponding JSON values and run `npm run build` to regenerate native NLS, then `npm run check`. For a new message, add the same key and parameters to all four catalogs. For a future language, add a catalog, register the locale/selection, extend native generation and tests, then verify actual UI layout. Localization itself uses bundled catalogs. Optional AI statement translation uses the explicitly configured provider; it requires no extra user-side package.

The AC-Stride container has three native peer views (contests, independent Codeforces problems, local practice), with no extra root group nodes. All allow visibility toggles through the native container menu. The existing local-practice view ID is reused to avoid duplicating the old view. Each view has one plus action; settings stays in the contest view toolbar because stable VS Code APIs do not expose multi-view container title actions. Import order is based on immutable `importedAt`, with folder creation-time fallback for legacy data.

`codeforcesWorkbench.solution.defaultLanguage` is edited alongside code templates. Contest and single-problem imports share `CodeforcesWorkspaces`, `ContestService` and `ContestRepository`; repository collection controls separate registries and file roots. `Problem.collection` is carried through source resolution, restore, test/submit targets and webview identity to prevent two copies of the same Codeforces problem from crossing state.

Login errors belong to `SettingsState.account.error`. The settings request handler consumes sign-in rejection because the shared account state already publishes it; it does not duplicate the failure in the general settings-error region.

Settings has four retained tab panels: environment (account, handle and tools), basic (locale and scope), coding (templates/default language and execution), and AI assistance (provider connection and translation preferences). Login synchronizes the authenticated handle into the existing effective handle configuration and locks the form field; public submissions/ranking consumers still read that setting. Save validation also enforces the authenticated handle.

`AiSettings` stores provider/model and translation preferences in global state, with endpoint-bound API keys in SecretStorage. `AiClient` is the sole AI transport. `AiRequestCache` sits before AI transport, stores input/output, shares in-flight work and limits concurrent calls to two. Users configure enablement, maximum entries and maximum space. Request identity uses canonical endpoint/model/messages and credential partitioning; keys themselves are never persisted. Translation rendering sanitizes cached or fresh output separately. Connection tests bypass caching. The download-completion hook starts automatic work only when enabled; manual activation joins the same task/cache. Failed tasks remain retryable. Request identity includes source, prompt and provider/model; stale task completion cannot overwrite a different active statement.

Translation toggles use the shared horizontal checkbox-label style. The default prompt is written in English and uses `{{language}}`. A selected target language is rendered as an English language name immediately before sending. Target selection does not change the stored prompt, and its resolved value is part of request/cache identity. Only the exact legacy bundled prompt is upgraded; custom prompts are preserved. Restore default uses a modal confirmation and updates the draft only, requiring an explicit save.

AI assistance controls and helper/confirmation messages are localized in all four supported UI languages. Translation targets are independently selected from nine languages. Missing `{{language}}` in a custom prompt produces an explicit warning rather than silently rewriting custom instructions.
