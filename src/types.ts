import * as vscode from "vscode";

export const COLUMNS = ["To Do", "In Progress", "In Review", "Done"] as const;
export type ColumnStatus = (typeof COLUMNS)[number];

export const COLUMN_ICONS: Record<ColumnStatus, string> = {
  "To Do": "circle-slash",
  "In Progress": "loading~spin",
  "In Review": "eye",
  Done: "pass-filled",
};

export const COLUMN_CONTEXT_VALUES: Record<ColumnStatus, string> = {
  "To Do": "ticket",
  "In Progress": "ticket",
  "In Review": "ticket",
  Done: "ticket",
};

export interface Ticket {
  id: string;
  title: string;
  description: string;
  status: ColumnStatus;
  executionStatus?: ExecutionStatus;
  createdAt: string;
  updatedAt: string;
}

export type ExecutionStatus = "idle" | "running" | "completed" | "failed";

export interface CliProvider {
  id: string;
  label: string;
  command: string;
  args?: string[];
}

export interface AiModelConfig {
  provider: "openai" | "anthropic" | "google" | "groq";
  openai?: { apiKey: string; modelName: string };
  anthropic?: { apiKey: string };
}

export interface TicketStore {
  tickets: Ticket[];
}

export interface WorkboardConfig {
  maxParallelExecutions: number;
  cliProviders: CliProvider[];
}
