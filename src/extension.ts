import * as vscode from "vscode";
import { loadFromConfig } from "./aiRegistry";
import { showKanban } from "./kanbanView";
import { initDatabase } from "./database";

export function activate(context: vscode.ExtensionContext) {
  loadFromConfig();

  initDatabase().catch((err) => {
    console.error("[Workboard] Failed to initialize database:", err);
  });

  context.subscriptions.push(
    vscode.commands.registerCommand("workboard.openKanban", () => showKanban(context)),
    vscode.commands.registerCommand("workboard.refreshBoard", () =>
      vscode.commands.executeCommand("workboard.openKanban")
    )
  );

  showKanban(context);
}

export function deactivate() {}
