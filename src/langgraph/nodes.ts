import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { RunnableConfig } from "@langchain/core/runnables";
import { AgentState } from "./state";
import { getModelConfig } from "../aiRegistry";
import { log, logError } from "../outputChannel";

type NodeFunction = (state: AgentState, config?: RunnableConfig) => Promise<Partial<AgentState>>;

let model: ChatOpenAI | null = null;

function getModel(): ChatOpenAI {
  if (!model) {
    const config = getModelConfig();
    if (!config?.apiKey) {
      throw new Error(
        "No API key configured. Set workboard.model.openai.apiKey in VS Code settings or OPENAI_API_KEY environment variable."
      );
    }
    model = new ChatOpenAI({
      modelName: config.modelName || "gpt-4o",
      temperature: 0.2,
      openAIApiKey: config.apiKey,
    });
  }
  return model;
}

function buildNodeSystemPrompt(role: string): string {
  return `You are executing a software engineering node "${role}" in a LangGraph workflow.
Your output will be passed to the next node. Be thorough and precise.
The user's workspace is the codebase context.`;
}

export const researchNode: NodeFunction = async (state) => {
  log(state.ticketId, `[research] Starting codebase research phase...`);
  try {
    const llm = getModel();
    const response = await llm.invoke([
      new SystemMessage(buildNodeSystemPrompt("Research")),
      new HumanMessage(
        `Search the codebase and analyze relevant files for this task:\n\nTitle: ${state.ticketTitle}\nDescription: ${state.ticketDescription}\n\nProvide findings about:\n- Which files are relevant\n- What patterns and conventions exist\n- What the current architecture looks like\n- Any potential issues or constraints`
      ),
    ]);

    const findings = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
    log(state.ticketId, `[research] Complete`);
    return {
      researchFindings: findings,
      stage: "plan",
      messages: [new AIMessage(`[Research]: ${findings.slice(0, 200)}...`)],
    };
  } catch (err) {
    logError(state.ticketId, `[research] Failed: ${err}`);
    return { error: String(err), stage: "done" as const };
  }
};

export const planNode: NodeFunction = async (state) => {
  log(state.ticketId, `[plan] Creating implementation plan...`);
  try {
    const llm = getModel();
    const response = await llm.invoke([
      new SystemMessage(buildNodeSystemPrompt("Planning")),
      new HumanMessage(
        `Create an implementation plan based on:\n\nTask: ${state.ticketTitle}\nDescription: ${state.ticketDescription}\n\nResearch Findings:\n${state.researchFindings}\n\nProvide a step-by-step plan with specific files, changes, and testing strategy.`
      ),
    ]);

    const plan = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
    log(state.ticketId, `[plan] Complete`);
    return {
      implementationPlan: plan,
      stage: "implement",
      messages: [new AIMessage(`[Plan]: ${plan.slice(0, 200)}...`)],
    };
  } catch (err) {
    logError(state.ticketId, `[plan] Failed: ${err}`);
    return { error: String(err), stage: "done" as const };
  }
};

export const implementNode: NodeFunction = async (state) => {
  log(state.ticketId, `[implement] Executing implementation...`);
  try {
    const llm = getModel();
    const response = await llm.invoke([
      new SystemMessage(buildNodeSystemPrompt("Implementation")),
      new HumanMessage(
        `Implement the changes according to this plan:\n\nPlan:\n${state.implementationPlan}\n\nTask: ${state.ticketTitle}\nDescription: ${state.ticketDescription}\n\nResearch:\n${state.researchFindings}\n\nOutput the code changes with file paths and explanations.`
      ),
    ]);

    const codeChanges = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
    log(state.ticketId, `[implement] Complete`);
    return {
      codeChanges,
      stage: "test",
      messages: [new AIMessage(`[Implementation]: ${codeChanges.slice(0, 200)}...`)],
    };
  } catch (err) {
    logError(state.ticketId, `[implement] Failed: ${err}`);
    return { error: String(err), stage: "done" as const };
  }
};

export const testNode: NodeFunction = async (state) => {
  log(state.ticketId, `[test] Running test validation...`);
  try {
    const llm = getModel();
    const response = await llm.invoke([
      new SystemMessage(buildNodeSystemPrompt("Testing")),
      new HumanMessage(
        `Review these code changes and propose tests:\n\nCode Changes:\n${state.codeChanges}\n\nTask: ${state.ticketTitle}\n\nProvide:\n- Review of the changes\n- Test cases to write\n- How to run the tests\n- Any edge cases missed`
      ),
    ]);

    const testResults = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
    log(state.ticketId, `[test] Complete`);
    return {
      testResults,
      stage: "report",
      messages: [new AIMessage(`[Testing]: ${testResults.slice(0, 200)}...`)],
    };
  } catch (err) {
    logError(state.ticketId, `[test] Failed: ${err}`);
    return { error: String(err), stage: "done" as const };
  }
};

export const reportNode: NodeFunction = async (state) => {
  log(state.ticketId, `[report] Generating final report...`);
  try {
    const llm = getModel();
    const response = await llm.invoke([
      new SystemMessage(buildNodeSystemPrompt("Reporting")),
      new HumanMessage(
        `Generate a summary report:\n\nTask: ${state.ticketTitle}\nResearch: ${state.researchFindings.slice(0, 500)}\nPlan: ${state.implementationPlan.slice(0, 500)}\nChanges: ${state.codeChanges.slice(0, 500)}\nTests: ${state.testResults.slice(0, 500)}\n\nProvide a concise summary of what was done and what tests to run.`
      ),
    ]);

    const report = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
    log(state.ticketId, `[report] Complete`);
    return {
      finalReport: report,
      stage: "done",
      messages: [new AIMessage(`[Report]: ${report}`)],
    };
  } catch (err) {
    logError(state.ticketId, `[report] Failed: ${err}`);
    return { error: String(err), stage: "done" as const };
  }
};
