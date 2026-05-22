import * as vscode from "vscode";

const CHANNEL_NAME = "Workboard AI";

let channel: vscode.OutputChannel | undefined;

export function getChannel(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel(CHANNEL_NAME);
  }
  return channel;
}

export function log(ticketId: string, message: string): void {
  const ch = getChannel();
  const timestamp = new Date().toLocaleTimeString();
  ch.appendLine(`[${timestamp}] [${ticketId.slice(0, 8)}] ${message}`);
}

export function logError(ticketId: string, message: string): void {
  const ch = getChannel();
  const timestamp = new Date().toLocaleTimeString();
  ch.appendLine(`[${timestamp}] [${ticketId.slice(0, 8)}] ERROR: ${message}`);
}

export function show(): void {
  getChannel().show(true);
}

export function disposeChannel(): void {
  channel?.dispose();
  channel = undefined;
}
