import { v4 as uuidv4 } from "uuid";
import { Ticket, ColumnStatus, COLUMNS } from "./types";
import { getDb, initDatabase, flushDatabase } from "./database";

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
      description: (row.description as string) || "",
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
    [ticket.id, ticket.title, ticket.description, ticket.status, ticket.executionStatus ?? null, ticket.createdAt, ticket.updatedAt]
  );

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

  db.run(`UPDATE tickets SET ${setClauses.join(", ")} WHERE id = ?`, values as import("sql.js").SqlValue[]);

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
      description: (row.description as string) || "",
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

  db.run("DELETE FROM tickets WHERE status = ?", [status]);

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
