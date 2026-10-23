import * as vscode from 'vscode';
import { bootstrap } from './bootstrap';
export function activate(context: vscode.ExtensionContext) {
  bootstrap(context);
}
