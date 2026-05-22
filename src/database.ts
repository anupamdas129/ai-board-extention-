import * as vscode from "vscode";
import initSqlJs, { Database as SqlJsDatabase } from "sql.js";

const STORE_FILENAME = ".vscode/workboard.sqlite";
const LEGACY_FILENAME = ".vscode/workboard.json";

let db: SqlJsDatabase | null = null;
let dbUri: vscode.Uri | undefined = undefined;

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

export async function flushDatabase(): Promise<void> {
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
