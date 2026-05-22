import { Ticket } from "./types";

function buildSystemPrompt(): string {
  return [
    "You are an expert software engineer executing tasks in a VS Code workspace.",
    "Follow these instructions for every task:",
    "",
    "1. SEARCH FIRST: Use file search tools to understand the existing codebase before making changes.",
    "2. READ CONTEXT: Read surrounding files and tests to understand patterns and conventions.",
    "3. FOLLOW CONVENTIONS: Match the existing code style, naming, and patterns exactly.",
    "4. WRITE TESTS: Add appropriate tests for all new or changed behavior.",
    "5. BE MINIMAL: Make the smallest change that solves the problem. No refactoring unless needed.",
    "6. HANDLE EDGE CASES: Consider error states, empty inputs, and boundary conditions.",
    "7. NO NEW DEPS: Do not add new dependencies without explicit justification.",
  ].join("\n");
}

export function buildEnhancedPrompt(ticket: Ticket): string {
  return [
    `## Task: ${ticket.title}`,
    "",
    `## Description`,
    ticket.description,
    "",
    `## System Instructions`,
    buildSystemPrompt(),
    "",
    `## Context`,
    `- Ticket ID: ${ticket.id}`,
    `- Created: ${ticket.createdAt}`,
    `- Status: ${ticket.status}`,
    "",
    `Proceed with the task above. Output your work step by step.`,
  ].join("\n");
}

export function buildSimplifiedPrompt(ticket: Ticket): string {
  return [
    `Task: ${ticket.title}`,
    ``,
    ticket.description,
    ``,
    `Instructions: Search the codebase first, follow existing conventions, write tests, and be concise.`,
  ].join("\n");
}
