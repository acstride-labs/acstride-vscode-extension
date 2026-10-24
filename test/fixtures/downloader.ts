import path from 'node:path';
export function downloaderExecutable(root: string) {
  return path.join(
    root,
    'resources',
    'downloader',
    'codeforces-workbench-downloader',
    process.platform === 'win32' ? 'codeforces-workbench-downloader.exe' : 'codeforces-workbench-downloader',
  );
}
export function downloaderEnvironment() {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !/^(PYTHON|PYINSTALLER_|_PYI_|IMPERSONATE_|CONDA|VIRTUAL_ENV|LD_|DYLD_|SSL_CERT_FILE|SSL_CERT_DIR|REQUESTS_CA_BUNDLE|CURL_CA_BUNDLE)/i.test(
          key,
        ),
    ),
  );
}
