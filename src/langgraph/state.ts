import { z } from "zod";
import { BaseMessage } from "@langchain/core/messages";
import { Annotation } from "@langchain/langgraph";

export const AgentStateSchema = Annotation.Root({
  ticketId: Annotation<string>(),
  ticketTitle: Annotation<string>(),
  ticketDescription: Annotation<string>(),
  taskPrompt: Annotation<string>(),
  messages: Annotation<BaseMessage[]>({
    reducer: (current, newMessages) => current.concat(newMessages),
    default: () => [],
  }),
  researchFindings: Annotation<string>({
    reducer: (_, newValue) => newValue ?? "",
    default: () => "",
  }),
  implementationPlan: Annotation<string>({
    reducer: (_, newValue) => newValue ?? "",
    default: () => "",
  }),
  codeChanges: Annotation<string>({
    reducer: (_, newValue) => newValue ?? "",
    default: () => "",
  }),
  testResults: Annotation<string>({
    reducer: (_, newValue) => newValue ?? "",
    default: () => "",
  }),
  finalReport: Annotation<string>({
    reducer: (_, newValue) => newValue ?? "",
    default: () => "",
  }),
  stage: Annotation<"research" | "plan" | "implement" | "test" | "report" | "done">({
    reducer: (_, newValue) => newValue,
    default: () => "research",
  }),
  error: Annotation<string>({
    reducer: (_, newValue) => newValue ?? "",
    default: () => "",
  }),
});

export type AgentState = typeof AgentStateSchema.State;

export const AgentInputSchema = z.object({
  ticketId: z.string(),
  ticketTitle: z.string(),
  ticketDescription: z.string(),
});
