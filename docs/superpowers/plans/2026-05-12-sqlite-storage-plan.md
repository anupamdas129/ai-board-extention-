# SQLite Storage Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat JSON file storage (`.vscode/workboard.json`) with SQLite via sql.js (WASM) for embedded, zero-install database persistence.

**Architecture:** New `src/database.ts` module manages the sql.js lifecycle (init, migration, flush). Existing `src/ticketStore.ts` functions keep unchanged signatures but replace JSON I/O with SQL queries through the database module. A one-time auto-migration reads the legacy JSON file and moves data into SQLite.

**Tech Stack:** sql.js (SQLite compiled to WebAssembly), VS Code filesystem API, existing TypeScript extension

---

### Task 1: Install sql.js dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add sql.js to package.json dependencies**

```json
"dependencies": {
    "@langchain/core": "^0.3.0",
    "@langchain/langgraph": "^0.2.0",
    "@langchain/openai": "^0.3.0",
    "langchain": "^0.3.0",
    "sql.js": "^1.11.0",
    "uuid": "^9.0.0",
    "zod": "^3.23.0"
}
```

- [ ] **Step 2: Install the package**

Run: `npm install`
Expected: sql.js and its WASM binary installed to node_modules. No native compilation errors.

- [ ] **Step 3: Verify types are available**

Run the TypeScript compiler briefly to confirm sql.js types resolve:

Run: `npx tsc --noEmit src/ticketStore.ts`
Expected: Should compile without errors related to sql.js (may have pre-existing errors from other files — that's fine for now).

---

### Task 2: Create database module — init, schema, and flush

**Files:**
- Create: `src/database.ts`

- [ ] **Step 1: Write the database module**

Create `src/database.ts` with database lifecycle management, schema creation, and disk persistence:

```typescript
import * as vscode from "vscode";
import initSqlJs, { Database as SqlJsDatabase } from "sql.js";

const STORE_FILENAME = ".vscode/workboard.sqlite";
const LEGACY_FILENAME = ".vscode/workboard.json";

let db: SqlJsDatabase | null = null;
let dbUri: vscode.Uri | null = null;

function getStoreUri(): vscode.Uri | undefined {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return undefined;
  }
  return vscode.Uri.joinPath(workspaceFolders[0].uri, STORE_FILENAME);
}

function getLegacyUri(): vscode.Uri | undefined {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return undefined;
  }
  return vscode.Uri.joinPath(workspaceFolders[0].uri, LEGACY_FILENAME);
}

function ensureSchema(): void {
  if (!db) {
    throw new Error("Database not initialized");
  }
  db.run(`CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'To Do',
    execution_status TEXT DEFAULT 'idle',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
}

async function flushDatabase(): Promise<void> {
  if (!db || !dbUri) {
    return;
  }
  const data = db.export();
  await vscode.workspace.fs.writeFile(dbUri, data);
}

export async function initDatabase(): Promise<SqlJsDatabase> {
  const SQL = await initSqlJs();

  dbUri = getStoreUri();
  if (!dbUri) {
    throw new Error("No workspace folder open. Cannot initialize database.");
  }

  try {
    const raw = await vscode.workspace.fs.readFile(dbUri);
    db = new SQL.Database(raw);
  } catch {
    db = new SQL.Database();
  }

  ensureSchema();
  await migrateIfNeeded(SQL);
  await flushDatabase();

  return db;
}

export function getDb(): SqlJsDatabase {
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return db;
}
```

At the bottom of the file, add a stub for `migrateIfNeeded` (to be filled in Task 3):

```typescript
async function migrateIfNeeded(_SQL: any): Promise<void> {
  const legacyUri = getLegacyUri();
  if (!legacyUri || !db || !dbUri) {
    return;
  }

  try {
    await vscode.workspace.fs.readFile(legacyUri);
  } catch {
    return;
  }

  // Migration logic will be added in Task 3
}
```

- [ ] **Step 2: Verify the module compiles**

Run: `npx tsc --noEmit src/database.ts`
Expected: No errors from `src/database.ts`.

---

### Task 3: Implement JSON-to-SQLite migration

**Files:**
- Modify: `src/database.ts`

- [ ] **Step 1: Replace the migration stub with full migration logic**

In `src/database.ts`, replace the `migrateIfNeeded` function with:

```typescript
interface LegacyTicket {
  id: string;
  title: string;
  description: string;
  status: string;
  executionStatus?: string;
  createdAt: string;
  updatedAt?: string;
}

interface LegacyTicketStore {
  tickets: LegacyTicket[];
}

async function migrateIfNeeded(_SQL: any): Promise<void> {
  const legacyUri = getLegacyUri();
  if (!legacyUri || !db) {
    return;
  }

  let raw: Uint8Array;
  try {
    raw = await vscode.workspace.fs.readFile(legacyUri);
  } catch {
    return;
  }

  const data: LegacyTicketStore = JSON.parse(raw.toString());

  if (!data.tickets || data.tickets.length === 0) {
    await vscode.workspace.fs.delete(legacyUri);
    await flushDatabase();
    return;
  }

  const legacyStatusMap: Record<string, string> = {
    "backlog": "To Do",
    "todo": "To Do",
    "to-do": "To Do",
    "in-progress": "In Progress",
    "inprogress": "In Progress",
    "in-review": "In Review",
    "inreview": "In Review",
    "done": "Done",
  };

  const insertStmt = db.prepare(
    `INSERT OR IGNORE INTO tickets (id, title, description, status, execution_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  let count = 0;
  for (const ticket of data.tickets) {
    const normalizedStatus = legacyStatusMap[ticket.status.toLowerCase()] || ticket.status || "To Do";
    insertStmt.bind([
      ticket.id,
      ticket.title,
      ticket.description || "",
      normalizedStatus,
      ticket.executionStatus || "idle",
      ticket.createdAt,
      ticket.updatedAt || ticket.createdAt,
    ]);
    insertStmt.step();
    insertStmt.reset();
    count++;
  }

  insertStmt.free();

  await vscode.workspace.fs.delete(legacyUri);
  await flushDatabase();

  console.log(`[Workboard] Migrated ${count} tickets from JSON to SQLite.`);
}
```

- [ ] **Step 2: Verify migration compiles**

Run: `npx tsc --noEmit src/database.ts`
Expected: No errors.

---

### Task 4: Rewrite ticketStore.ts to use the database module

**Files:**
- Modify: `src/ticketStore.ts`

- [ ] **Step 1: Replace all JSON I/O with SQL queries**

Replace the entire content of `src/ticketStore.ts` with:

```typescript
import { v4 as uuidv4 } from "uuid";
import { Ticket, ColumnStatus, COLUMNS, TicketStore } from "./types";
import { getDb, initDatabase } from "./database";

let initialized = false;

async function ensureInit(): Promise<void> {
  if (!initialized) {
    await initDatabase();
    initialized = true;
  }
}

export async function loadTickets(): Promise<Ticket[]> {
  await ensureInit();
  const db = getDb();

  const stmt = db.prepare("SELECT * FROM tickets ORDER BY created_at ASC");
  const tickets: Ticket[] = [];

  while (stmt.step()) {
    const row = stmt.getAsObject() as Record<string, unknown>;
    tickets.push({
      id: row.id as string,
      title: row.title as string,
      description: row.description as string || "",
      status: row.status as ColumnStatus,
      executionStatus: (row.execution_status as Ticket["executionStatus"]) || "idle",
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    });
  }

  stmt.free();
  return tickets;
}

export async function createTicket(title: string, description: string, status: ColumnStatus): Promise<Ticket> {
  await ensureInit();
  const db = getDb();

  const now = new Date().toISOString();
  const ticket: Ticket = {
    id: uuidv4(),
    title,
    description,
    status,
    executionStatus: "idle",
    createdAt: now,
    updatedAt: now,
  };

  db.run(
    `INSERT INTO tickets (id, title, description, status, execution_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [ticket.id, ticket.title, ticket.description, ticket.status, ticket.executionStatus, ticket.createdAt, ticket.updatedAt]
  );

  const { flushDatabase } = await import("./database");
  await flushDatabase();

  return ticket;
}

export async function updateTicket(id: string, updates: Partial<Pick<Ticket, "title" | "description" | "status" | "executionStatus">>): Promise<Ticket | undefined> {
  await ensureInit();
  const db = getDb();

  const existing = await getTicket(id);
  if (!existing) {
    return undefined;
  }

  const updatedAt = new Date().toISOString();
  const setClauses: string[] = [];
  const values: unknown[] = [];

  if (updates.title !== undefined) {
    setClauses.push("title = ?");
    values.push(updates.title);
  }
  if (updates.description !== undefined) {
    setClauses.push("description = ?");
    values.push(updates.description);
  }
  if (updates.status !== undefined) {
    setClauses.push("status = ?");
    values.push(updates.status);
  }
  if (updates.executionStatus !== undefined) {
    setClauses.push("execution_status = ?");
    values.push(updates.executionStatus);
  }

  setClauses.push("updated_at = ?");
  values.push(updatedAt);
  values.push(id);

  db.run(`UPDATE tickets SET ${setClauses.join(", ")} WHERE id = ?`, values);

  const { flushDatabase } = await import("./database");
  await flushDatabase();

  const updated = await getTicket(id);
  return updated;
}

export async function deleteTicket(id: string): Promise<boolean> {
  await ensureInit();
  const db = getDb();

  const existing = await getTicket(id);
  if (!existing) {
    return false;
  }

  db.run("DELETE FROM tickets WHERE id = ?", [id]);

  const { flushDatabase } = await import("./database");
  await flushDatabase();

  return true;
}

export async function getTicket(id: string): Promise<Ticket | undefined> {
  await ensureInit();
  const db = getDb();

  const stmt = db.prepare("SELECT * FROM tickets WHERE id = ?");
  stmt.bind([id]);

  let ticket: Ticket | undefined;
  if (stmt.step()) {
    const row = stmt.getAsObject() as Record<string, unknown>;
    ticket = {
      id: row.id as string,
      title: row.title as string,
      description: row.description as string || "",
      status: row.status as ColumnStatus,
      executionStatus: (row.execution_status as Ticket["executionStatus"]) || "idle",
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  stmt.free();
  return ticket;
}

export async function clearColumn(status: ColumnStatus): Promise<number> {
  await ensureInit();
  const db = getDb();

  const result = db.run("DELETE FROM tickets WHERE status = ?", [status]);

  const { flushDatabase } = await import("./database");
  await flushDatabase();

  return db.getRowsModified();
}

export function getColumnIndex(status: ColumnStatus): number {
  const index = COLUMNS.indexOf(status);
  if (index === -1) {
    throw new Error(`Invalid column status: ${status}`);
  }
  return index;
}

export function getNextColumn(status: ColumnStatus): ColumnStatus | undefined {
  const index = getColumnIndex(status);
  return index < COLUMNS.length - 1 ? COLUMNS[index + 1] : undefined;
}
```

- [ ] **Step 2: Verify the full extension compiles**

Run: `npm run compile`
Expected: No TypeScript errors. Output in `dist/` including the compiled `database.js` and `kanbanView.html`.

---

### Task 5: Wire up database initialization on extension activation

**Files:**
- Modify: `src/extension.ts`

- [ ] **Step 1: Add database init call in activate()**

```typescript
import * as vscode from "vscode";
import { loadFromConfig } from "./aiRegistry";
import { showKanban } from "./kanbanView";
import { initDatabase } from "./database";

export function activate(context: vscode.ExtensionContext) {
  loadFromConfig();

  initDatabase().catch((err) => {
    console.error("[Workboard] Failed to initialize database:", err);
  });

  context.subscriptions.push(
    vscode.commands.registerCommand("workboard.openKanban", () => showKanban(context)),
    vscode.commands.registerCommand("workboard.refreshBoard", () =>
      vscode.commands.executeCommand("workboard.openKanban")
    )
  );

  showKanban(context);
}

export function deactivate() {}
```

- [ ] **Step 2: Full compile check**

Run: `npm run compile`
Expected: Clean compilation, no errors.

---

### Task 6: Build and verify migration

**Files:**
- Modify: `src/database.ts` (export `flushDatabase` for ticketStore use)

- [ ] **Step 1: Export flushDatabase from database.ts**

In `src/database.ts`, change `async function flushDatabase()` to:

```typescript
export async function flushDatabase(): Promise<void> {
```

(It already is exported from the code in Task 2 — verify it is.)

- [ ] **Step 2: Full build**

Run: `npm run compile`
Expected: Clean compilation.

- [ ] **Step 3: Manual verification checklist**

1. **Fresh install (no prior data):**
   - Open a workspace with no `.vscode/workboard.json` and no `.vscode/workboard.sqlite`
   - Launch the extension
   - Verify `.vscode/workboard.sqlite` is created
   - Verify the board shows empty columns
   - Create a ticket, verify it persists after closing/reopening VS Code

2. **Migration from JSON:**
   - In a workspace with an existing `.vscode/workboard.json` containing tickets
   - Launch the extension
   - Verify the old JSON file is deleted
   - Verify `.vscode/workboard.sqlite` exists
   - Verify all tickets appear correctly in the board
   - Verify legacy status values (e.g., "backlog") are normalized to current column names

3. **CRUD operations:**
   - Create a ticket → verify it appears
   - Edit a ticket title/description → verify update persists
   - Move a ticket between columns → verify status change persists
   - Delete a ticket → verify it's removed
   - Clear a column → verify all tickets in that column are deleted

4. **Error resilience:**
   - Delete `.vscode/workboard.sqlite` mid-session → extension should recreate on next write
   - Verify the extension does not crash if the file is inaccessible

---

### Task 7: Commit

- [ ] **Step 1: Review changes**

Run: `git status`

Expected: Modified files shown — `package.json`, `package-lock.json`, `src/ticketStore.ts`, `src/extension.ts`, plus new file `src/database.ts`.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json src/database.ts src/ticketStore.ts src/extension.ts
git commit -m "feat: replace JSON file storage with SQLite via sql.js

- Add sql.js dependency for embedded SQLite (WASM, no native install)
- Create src/database.ts for database lifecycle, schema, and disk flush
- Rewrite ticketStore.ts to use SQL queries instead of JSON I/O
- Auto-migrate existing .vscode/workboard.json data into SQLite on first run
- Init database on extension activation"
```
