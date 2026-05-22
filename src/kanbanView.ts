import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { Ticket, ColumnStatus, COLUMNS } from "./types";
import { loadTickets, createTicket, updateTicket, deleteTicket } from "./ticketStore";
import { getCliProviders } from "./aiRegistry";
import { launchCliTerminalForTicket } from "./terminalLauncher";
import { log } from "./outputChannel";

let panel: vscode.WebviewPanel | undefined;

function getHtmlPath(): string {
  return path.join(__dirname, "kanbanView.html");
}

function readHtml(): string {
  return fs.readFileSync(getHtmlPath(), "utf-8");
}

async function pushBoard() {
  if (!panel) {
    return;
  }
  const tickets = await loadTickets();
  const cliProviders = getCliProviders();
  panel.webview.postMessage({ type: "update", tickets, cliProviders });
}

export async function showKanban(context: vscode.ExtensionContext) {
  if (panel) {
    panel.reveal(vscode.ViewColumn.One);
  } else {
    panel = vscode.window.createWebviewPanel(
      "workboardKanban",
      "Workboard - AI Kanban",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(context.extensionPath, "src")),
        ],
      }
    );

    panel.iconPath = vscode.Uri.file(
      path.join(context.extensionPath, "media", "icon.svg")
    );

    panel.webview.html = readHtml();

    panel.webview.onDidReceiveMessage(handleMessage);

    panel.onDidDispose(() => {
      panel = undefined;
    });
  }

  await pushBoard();
}

async function handleMessage(msg: Record<string, unknown>) {
  switch (msg.type) {
    case "ready":
      await pushBoard();
      break;

    case "refresh":
      await pushBoard();
      break;

    case "createTicket": {
      const created = await createTicket(
        (msg.title as string).trim(),
        ((msg.description as string) || "").trim(),
        (msg.status as ColumnStatus) || "To Do"
      );
      log(created.id, `Ticket created: ${created.title}`);
      await pushBoard();
      break;
    }

    case "updateTicket": {
      const updates: Record<string, unknown> = {};
      if (msg.title !== undefined) updates.title = (msg.title as string).trim();
      if (msg.description !== undefined) updates.description = (msg.description as string).trim();
      if (msg.status !== undefined) updates.status = msg.status as ColumnStatus;

      const tickets = await loadTickets();
      const existing = tickets.find((t) => t.id === msg.id);

      if (updates.status && existing && existing.status !== updates.status) {
        if (existing.status === "In Progress") {
          updates.executionStatus = "idle";
        }
        if (updates.status === "In Progress") {
          updates.executionStatus = "idle";
        }
      }

      const updated = await updateTicket(msg.id as string, updates);
      if (updated) {
        log(updated.id, `Ticket updated: ${updated.title}`);

        if (updates.status === "In Progress") {
          await pushBoard();
          await launchCliTerminalForTicket(updated);
        }
      }
      await pushBoard();
      break;
    }

    case "deleteTicket": {
      await deleteTicket(msg.id as string);
      await pushBoard();
      break;
    }

    case "moveToReview": {
      await updateTicket(msg.id as string, {
        status: "In Review",
        executionStatus: "completed",
      });
      log(msg.id as string, "Ticket moved to In Review");
      await pushBoard();
      break;
    }
  }
}