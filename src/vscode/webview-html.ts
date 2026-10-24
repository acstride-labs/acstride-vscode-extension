import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { currentLocale } from './localization';
export function webviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  mode: 'tests' | 'contest' | 'statement' | 'settings',
) {
  const nonce = randomBytes(16).toString('hex');
  const asset = (name: string) =>
    webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview', name));
  return `<!DOCTYPE html><html lang="${currentLocale()}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${asset('app.css')}"></head><body data-mode="${mode}"><div id="root"></div><script nonce="${nonce}" type="module" src="${asset('app.js')}"></script></body></html>`;
}
