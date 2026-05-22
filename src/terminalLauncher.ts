import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { CliProvider, Ticket } from "./types";
import { buildSimplifiedPrompt } from "./promptEnhancer";
import { getCliProviders } from "./aiRegistry";

async function selectProvider(ticket: Ticket): Promise<CliProvider | undefined> {
  const providers = getCliProviders();
  if (providers.length === 0) {
    vscode.window.showErrorMessage("No CLI providers configured. Add them in VS Code settings under workboard.cliProviders.");
    return undefined;
  }
  if (providers.length === 1) {
    return providers[0];
  }
  const selected = await vscode.window.showQuickPick(
    providers.map((p) => ({ label: p.label, description: p.command, id: p.id })),
    { placeHolder: `Select AI CLI for "${ticket.title}"` }
  );
  if (!selected) return undefined;
  return providers.find(p => p.id === selected.id);
}

export async function launchCliTerminal(
  provider: CliProvider,
  ticket: Ticket
): Promise<void> {
  const prompt = buildSimplifiedPrompt(ticket);

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceFolder) {
    vscode.window.showErrorMessage("No workspace open.");
    return;
  }

  const promptDir = path.join(workspaceFolder, ".vscode");
  fs.mkdirSync(promptDir, { recursive: true });
  const promptFile = path.join(promptDir, "workboard_prompt.md");
  fs.writeFileSync(promptFile, prompt, "utf-8");

  const terminal = vscode.window.createTerminal({
    name: `Workboard: ${ticket.title.slice(0, 30)}`,
    hideFromUser: false,
  });

  terminal.show(true);

  const { command, args } = provider;
  const fullCmd = [command, ...(args || [])].join(" ");

  const escapedPrompt = prompt.replace(/"/g, '\\"');
  terminal.sendText(`${fullCmd} --prompt "${escapedPrompt}"`, true);
}

export async function launchCliTerminalForTicket(ticket: Ticket): Promise<void> {
  const provider = await selectProvider(ticket);
  if (!provider) return;
  await launchCliTerminal(provider, ticket);
  vscode.window.showInformationMessage(`Terminal opened for: ${ticket.title}`);
}
