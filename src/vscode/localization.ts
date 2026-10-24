import * as vscode from 'vscode';
import { resolveLocale, translate } from '../shared/i18n';
export function currentLocale() {
  return resolveLocale(
    vscode.workspace.getConfiguration('codeforcesWorkbench').get('ui.language', 'auto'),
    vscode.env.language,
  );
}
export function t(key: string, values?: Record<string, string | number>) {
  return translate(currentLocale(), key, values);
}
export function postLocale(webview?: vscode.Webview) {
  void webview?.postMessage({ type: 'locale', locale: currentLocale() });
}
