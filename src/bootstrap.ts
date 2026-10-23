import * as vscode from 'vscode';
import { WorkspaceController } from './vscode/workspace-controller';
import { ContestController } from './vscode/contest-controller';
export function bootstrap(context: vscode.ExtensionContext) {
  const controller = new WorkspaceController(context);
  context.subscriptions.push(controller);
  controller.register();
  const contests = new ContestController(context, controller);
  context.subscriptions.push(contests);
  contests.register();
}
