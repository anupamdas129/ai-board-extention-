import * as vscode from "vscode";
import { CliProvider } from "./types";

let providers: CliProvider[] = [];
let modelConfig: {
  provider: string;
  apiKey: string;
  modelName: string;
} | undefined;

export function loadFromConfig(): void {
  const config = vscode.workspace.getConfiguration("workboard");

  providers = config.get<CliProvider[]>("cliProviders", []);

  const modelProvider = config.get<string>("model.provider", "openai");
  let apiKey = "";

  switch (modelProvider) {
    case "openai":
      apiKey = config.get<string>("model.openai.apiKey", "") || process.env.OPENAI_API_KEY || "";
      break;
    case "anthropic":
      apiKey = config.get<string>("model.anthropic.apiKey", "") || process.env.ANTHROPIC_API_KEY || "";
      break;
    default:
      apiKey = "";
  }

  modelConfig = {
    provider: modelProvider,
    apiKey,
    modelName: config.get<string>("model.openai.modelName", "gpt-4o"),
  };
}

export function getCliProviders(): CliProvider[] {
  return providers;
}

export function getCliProvider(id: string): CliProvider | undefined {
  return providers.find((p) => p.id === id);
}

export function getModelConfig() {
  return modelConfig;
}

export function getMaxParallel(): number {
  return vscode.workspace.getConfiguration("workboard").get<number>("maxParallelExecutions", 3);
}
