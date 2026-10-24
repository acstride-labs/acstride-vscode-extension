import path from 'node:path';
import { AiClient } from './infrastructure/ai/client';
import { AiRequestCache } from './infrastructure/ai/request-cache';
import { AiSettings } from './vscode/ai-settings';
import * as vscode from 'vscode';
import { WorkspaceController } from './vscode/workspace-controller';
import { ContestController } from './vscode/contest-controller';
import { SidebarController } from './vscode/sidebar-controller';
import { SettingsController } from './vscode/settings-controller';
export function bootstrap(context: vscode.ExtensionContext) {
  const aiCache = new AiRequestCache(
    path.join(context.globalStorageUri.fsPath, 'ai-requests-lru.json'),
    new AiSettings(context).cacheOptions(),
  );
  context.subscriptions.push(aiCache);
  const aiClient = new AiClient(undefined, 30000, aiCache);
  const controller = new WorkspaceController(context);
  context.subscriptions.push(controller);
  controller.register();
  const contests = new ContestController(context, controller, aiClient);
  context.subscriptions.push(contests);
  contests.register();
  const sidebar = new SidebarController(controller, contests);
  context.subscriptions.push(sidebar);
  sidebar.register();
  const settings = new SettingsController(context, controller, aiClient);
  context.subscriptions.push(settings);
  settings.register();
}
