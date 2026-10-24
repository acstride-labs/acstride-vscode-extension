# Private public-downloader distribution

End users install only the matching VSIX. They never execute pip, download a Python runtime, or configure a helper path. Build-time Python is a developer/CI dependency, not a product prerequisite. Transport sources, locked Python requirements and notice collector live in the pinned CF Tool repository under `packaging/`; the extension contains no duplicate downloader source. Source scripts and build tools are excluded from VSIX. Only its frozen onedir output, manifest and collected notices ship.

## Build and validate

Use Node 24, Go 1.26+ and Python 3.10+ on the target OS/architecture (developer/CI only):

```sh
npm ci
npm run build:cf-tool
npm run build:downloader
npm run check
npm run package
npm run verify:vsix
```

`CFIDE_BUILD_PYTHON` optionally selects a build interpreter by absolute path. The build creates `.build/downloader/venv`, installs exact versions from `downloader-requirements.txt`, then runs PyInstaller with a private cache/work directory. Only this generated build environment is modified. Python's interpreter, curl_cffi's native library/fingerprint data and certifi CA data are collected. PyInstaller's onedir output is copied with symlinks dereferenced so VSIX ZIP extraction does not depend on symlink support. Setuptools is excluded from the frozen app; no runtime installer is shipped intentionally.

The build records SHA-256 hashes and a target/protocol manifest under `resources/downloader`. Packaging fails on absent binaries, mismatched targets, altered/missing files, native/CA self-test failures, or a non-embedded interpreter. `verify:vsix` extracts the final archive into a temporary path, verifies its target/hashes and runs that extracted executable with empty PATH. Build products are ignored by Git and rebuilt on CI rather than committed.

Supported targets: `darwin-arm64`, `darwin-x64`, `win32-x64`, `linux-x64`. Linux builds use Ubuntu 22.04/glibc as a baseline, not Alpine/musl. Builds are native, not cross-compiled. Additional CPU targets require real build/test runners and compatible dependency wheels before being added. macOS builds receive PyInstaller ad-hoc signatures; this is **not Apple Developer ID signing/notarization**. Windows binaries are not Authenticode-signed. No security warnings are bypassed by the extension; signing credentials/Marketplace publishing remain separate release work.

## Runtime boundaries

- The extension host launches only CF Tool by absolute path with `shell: false`; CF Tool resolves and invokes the immutable install-relative downloader internally. There is no system-Python lookup, pip fallback, PATH update, file association, registry entry, daemon or local listening port.
- The child gets a copied environment stripped of Python/venv/Conda/native-library injection, impersonate.pro account/config overrides and external CA overrides. curl_cffi is pointed at a private, unused config location in the bundle instead of the user's curl_cffi configuration/cache. Parent environment and solution execution are unchanged. Standard proxy settings remain honored. TLS verification uses the bundled certifi store.
- `--self-test` is offline: load native libcurl, confirm CA data, report protocol/embedded status. Normal mode accepts one bounded stdin JSON public problem path; only anonymous GETs to the same HTTPS Codeforces problem page are allowed. No login/Cookie input, arbitrary URL or POST interface exists.
- stdin/stdout JSON, fixed time/output/page limits, cancellation and static diagnostics are retained. No persistent account state or helper runtime files are written. CF Tool parses statements/samples and downloads official images. TypeScript validates the structured result and sanitizes HTML only for display.
- Wrong/incomplete/incompatible installs show an explicit reinstall-the-correct-package error and leave local code/tests intact. Retry later or continue with cached/local work. Site verification/network failures are distinct from installation failures.

## Embedded CF Tool

`packaging/cf-tool.json` pins the Go repository to an exact commit. `build:cf-tool`
fetches that commit at build time, verifies module checksums and builds the native
standalone executable into ignored `resources/cf-tool/`. `ACSTRIDE_BUILD_GO` may
select an absolute developer compiler; `ACSTRIDE_CF_TOOL_SOURCE` may select a
clean local checkout, but it must match the same pin. These variables do not
configure extension runtime behavior or user PATH.

The bundle includes the original MIT license, locked dependency and Go runtime
notices, file hashes and target/source metadata. `verify:cf-tool` runs offline
capabilities with empty PATH and checks request/protocol identity. `package` and
`verify:vsix` require it, including validation of the extracted final binary.

Both `build:cf-tool` and `build:downloader` use `scripts/cf-tool-source.mjs` to resolve the same exact clean commit. Downloader manifests record this source revision too. No binaries or frozen runtimes are committed to Git; CI packages generated platform-specific outputs in the VSIX.

Production and development hosts always use the extension-owned CF Tool. Missing/incompatible bundles report an installation failure; no TypeScript network fallback exists. The typed client exposes anonymous reads plus explicit experimental account, language, submit, receipt and watch operations. Credentials travel only on stdin after a native password prompt; submission requires native confirmation, exact source hash and expected account binding. Anonymous operations never load sessions. No self-update or browser-cookie import exists. CF Tool owns webpage parsing, samples, image transport/cache and cross-process request pacing. Only local rendering sanitization and workspace orchestration remain in the extension. Uncached remote images are blocked by the Webview CSP.

## Dependencies and release hygiene

`notices/` collects Python's bundled license plus installed curl_cffi, cffi, certifi, pycparser and PyInstaller distribution notices and exact versions. Native/stdlib transitive dependency versions depend on the wheels and build Python distribution; audit their notices and security updates when changing build inputs or preparing a Marketplace release. The version pins do not replace provenance/license/security review. CI artifacts are development distributions, not a Marketplace release or a claim of signing/notarization.

Update runtime/CA/native-library pins through a reviewed extension release. Never repair an end user's installation by downloading binaries or running pip. Legacy 0.5 global-storage venvs are not used or automatically deleted; existing user code, custom tests, browser profiles and system Python installations are untouched.
