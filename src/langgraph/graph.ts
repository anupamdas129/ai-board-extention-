import { StateGraph, END } from "@langchain/langgraph";
import { AgentStateSchema } from "./state";
import { researchNode, planNode, implementNode, testNode, reportNode } from "./nodes";

function routeAfterNode(state: typeof AgentStateSchema.State): string {
  if (state.error) {
    return END;
  }

  const routes: Record<string, string> = {
    research: "planNode",
    plan: "implementNode",
    implement: "testNode",
    test: "reportNode",
    report: END,
  };

  return routes[state.stage] || END;
}

export function buildGraph() {
  const graph = new StateGraph(AgentStateSchema)
    .addNode("researchNode", researchNode)
    .addNode("planNode", planNode)
    .addNode("implementNode", implementNode)
    .addNode("testNode", testNode)
    .addNode("reportNode", reportNode)

    .addEdge("__start__", "researchNode")

    .addConditionalEdges("researchNode", routeAfterNode)
    .addConditionalEdges("planNode", routeAfterNode)
    .addConditionalEdges("implementNode", routeAfterNode)
    .addConditionalEdges("testNode", routeAfterNode)
    .addConditionalEdges("reportNode", routeAfterNode);

  return graph.compile();
}

export function createGraph() {
  return buildGraph();
}
