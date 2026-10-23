import * as vscode from 'vscode';
import { WorkspaceController } from './vscode/workspace-controller';
import { ContestController } from './vscode/contest-controller';
import { SettingsController } from './vscode/settings-controller';
export function bootstrap(context: vscode.ExtensionContext) {
  const controller = new WorkspaceController(context);
  context.subscriptions.push(controller);
  controller.register();
  const contests = new ContestController(context, controller);
  context.subscriptions.push(contests);
  contests.register();
  const settings = new SettingsController(context, controller, contests);
  context.subscriptions.push(settings);
  settings.register();
}
