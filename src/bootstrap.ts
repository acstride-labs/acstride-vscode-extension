import * as vscode from 'vscode';
import { WorkspaceController } from './vscode/workspace-controller';
export function bootstrap(context: vscode.ExtensionContext) {
  const controller = new WorkspaceController(context);
  context.subscriptions.push(controller);
  controller.register();
}
