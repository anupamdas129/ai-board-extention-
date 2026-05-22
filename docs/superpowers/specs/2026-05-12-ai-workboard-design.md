# VS Code AI Workboard Extension — Design Spec

**Date**: 2026-05-12
**Status**: Draft

## Overview

A local Kanban board VS Code extension that allows users to create and manage tickets across fixed columns. Tickets can be assigned to a CLI-based AI agent (opencode, codex, etc.), which opens a terminal with an enhanced prompt pre-loaded from the ticket context.

## Core Principles

- **Fully native VS Code UI** — TreeView, command palette, context menus. No webviews, no browsers.
- **Local only** — data stored as JSON in `.vscode/workboard.json`
- **Minimal tickets** — title + description only
- **Fixed workflow** — Backlog → To Do → In Progress → Done
- **Manual AI execution** — user selects AI CLI, terminal opens with prompt, user runs manually

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│              VS Code Extension                  │
├─────────────────────────────────────────────────┤
│  Activity Bar Icon ("Workboard")                │
│         │                                       │
│  ┌──────▼─────────────────────────────────┐    │
│  │       TreeView (Primary Sidebar)       │    │
│  │  ┌─────────────────────────────────┐   │    │
│  │  │ 📋 Backlog          [+ Add]     │   │    │
│  │  │   └─ Fix login bug              │   │    │
│  │  │   └─ Add dark mode              │   │    │
│  │  │ 🟦 To Do             [+ Add]    │   │    │
│  │  │   └─ Update README              │   │    │
│  │  │ 🟨 In Progress       [+ Add]    │   │    │
│  │  │   └─ Refactor auth              │   │    │
│  │  │ 🟩 Done              [+ Add]    │   │    │
│  │  │   └─ Setup CI                   │   │    │
│  │  └─────────────────────────────────┘   │    │
│  └─────────────────────────────────────────┘    │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │        Command Palette + Menus            │   │
│  │  • Workboard: Create Ticket               │   │
│  │  • Workboard: Run with AI                 │   │
│  │  • Workboard: Move Ticket                 │   │
│  │  • Workboard: Delete Ticket               │   │
│  │  • Workboard: Edit Ticket                 │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │           Prompt Enhancer                 │   │
│  │  Ticket context → Enhanced prompt         │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │         Terminal Launcher                 │   │
│  │  Opens CLI with prompt pre-loaded         │   │
│  └──────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
```

## Component Design

### 1. Activity Bar Entry Point

- Registers a `workboard` view container in the Activity Bar
- Icon: a simple Kanban/board icon (codicon or custom SVG)
- Clicking activates the extension and reveals the TreeView

**Implementation**: `package.json` → `contributes.viewsContainers` + `contributes.views`

### 2. Kanban TreeView

A single `TreeDataProvider` renders the board:

```
Column (Backlog)
  ├── Ticket A
  ├── Ticket B
Column (To Do)
  ├── Ticket C
Column (In Progress)
  ├── Ticket D
Column (Done)
  ├── Ticket E
```

- Each column is a `TreeItem` with `collapsibleState: Expanded`
- Each ticket is a child `TreeItem` with an icon and label (title)
- `[+ Add]` button as inline action on each column to create a ticket in that column
- Tooltip on hover shows ticket description

**Implementation**: Single `BoardDataProvider implements TreeDataProvider<TreeItem>`

### 3. Ticket Context Menu

Right-click actions on a ticket:
- **Edit Ticket** — opens input boxes for title and description
- **Move to...** — submenu: Backlog, To Do, In Progress, Done
- **Run with AI** — triggers AI CLI selection flow
- **Delete Ticket** — confirmation dialog then delete

### 4. Command Palette Commands

| Command ID | Title | Action |
|---|---|---|
| `workboard.createTicket` | Workboard: Create Ticket | Quick pick column → input title → input description |
| `workboard.editTicket` | Workboard: Edit Ticket | Edit title and/or description |
| `workboard.moveTicket` | Workboard: Move Ticket | Quick pick destination column |
| `workboard.deleteTicket` | Workboard: Delete Ticket | Confirm then delete |
| `workboard.runWithAI` | Workboard: Run with AI | Select AI CLI → launch terminal |
| `workboard.refreshBoard` | Workboard: Refresh Board | Reload from JSON file |

### 5. Data Persistence

**File**: `.vscode/workboard.json` (workspace-scoped)

```json
{
  "tickets": [
    {
      "id": "a1b2c3d4-...",
      "title": "Fix login bug",
      "description": "Users cannot log in via SSO on Firefox.",
      "status": "in-progress",
      "createdAt": "2026-05-12T10:30:00Z"
    }
  ]
}
```

- Read on activation, write on every mutation
- Simple file I/O via `vscode.workspace.fs` or `fs` module
- If file doesn't exist, create with empty tickets array

### 6. AI CLI Registry

**Configuration** (in `package.json` contributes):

```json
"workboard.aiCli": [
  {
    "id": "opencode",
    "label": "OpenCode",
    "command": "opencode",
    "args": []
  },
  {
    "id": "codex",
    "label": "OpenAI Codex CLI",
    "command": "codex",
    "args": []
  },
  {
    "id": "claude",
    "label": "Claude Code",
    "command": "claude",
    "args": []
  }
]
```

- Default list ships with the extension
- User can add/remove/edit via VS Code Settings UI
- Each entry: `id`, `label`, `command`, `args` (optional)

### 7. Prompt Enhancer

Wraps ticket context into a structured, effective prompt.

**Template**:

```markdown
## Task
{title}

## Description
{description}

## Instructions
- Search the codebase first to understand the existing implementation
- Follow existing code conventions and patterns
- Write clear, concise, well-structured code
- Add appropriate tests for your changes
- Handle edge cases and error states
- Do not introduce new dependencies without justification
```

- The enhanced prompt is placed on the clipboard
- Terminal opens with the CLI command, user pastes the prompt

### 8. Terminal Launcher

**Flow**:
1. User selects "Run with AI" on a ticket
2. Quick pick shows registered AI CLIs
3. User selects one
4. Enhanced prompt is generated and copied to clipboard
5. Terminal opens: `opencode` (or selected CLI)
6. User pastes prompt (Ctrl+V)

**Rationale**: Clipboard approach is the most universal — no assumptions about CLI input format.

---

## File Structure

```
workboard/
├── .vscodeignore
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── extension.ts          # Entry point, activation
│   ├── boardProvider.ts       # TreeDataProvider implementation
│   ├── ticketStore.ts         # Read/write .vscode/workboard.json
│   ├── aiRegistry.ts          # AI CLI configuration management
│   ├── promptEnhancer.ts      # Build enhanced prompt from ticket
│   ├── terminalLauncher.ts    # Open terminal with prompt
│   └── types.ts               # Shared interfaces/types
├── media/
│   └── icon.svg               # Activity Bar icon
└── .vscode/
    └── launch.json            # Debug configuration
```

## Key Dependencies

- **vscode** — VS Code Extension API (TreeView, window, commands, Terminal)
- **uuid** — Generate unique ticket IDs

## Data Flow

```
Create Ticket:
  Command → QuickPick(column) → InputBox(title) → InputBox(desc)
  → ticketStore.create() → write JSON → boardProvider.refresh()

Move Ticket:
  Context Menu → QuickPick(destination) → ticketStore.update()
  → write JSON → boardProvider.refresh()

Run with AI:
  Context Menu → QuickPick(AI CLI) → promptEnhancer.build(ticket)
  → terminalLauncher.open(cli, prompt)

Edit Ticket:
  Context Menu → InputBox(new title) → InputBox(new desc)
  → ticketStore.update() → write JSON → boardProvider.refresh()

Delete Ticket:
  Context Menu → confirm → ticketStore.delete()
  → write JSON → boardProvider.refresh()
```

## Error Handling

- **Missing workboard.json**: Create new file with empty state
- **Corrupt JSON**: Show warning, offer to reset or backup + reset
- **CLI not installed**: Show error notification with install instructions
- **Ticket not found**: Log warning, refresh board
- **File write failure**: Show error notification, suggest checking permissions

## Testing Strategy

- **Unit tests**: ticketStore, promptEnhancer, aiRegistry (pure logic)
- **Integration tests**: extension activation, TreeView rendering (vscode-test)
- **Manual testing checklist**: create/move/edit/delete tickets, AI terminal launch, corrupted data recovery

---

## Out of Scope (V1)

- Drag-and-drop
- Customizable columns
- Due dates, tags, assignees, priority
- Multiple boards
- Sync with GitHub/Jira/Linear
- Persistent AI execution history
- Ticket comments/threads
- Markdown rendering in descriptions
