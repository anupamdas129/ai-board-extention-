# Design: SQLite Backend via sql.js

**Date:** 2026-05-12  
**Status:** Approved  

## Motivation

Replace the current flat JSON file storage (`.vscode/workboard.json`) with a proper SQLite database for scalability and data integrity. The extension should remain zero-server, fully embedded, and require no additional user installation.

## Approach

Use **sql.js** — SQLite compiled to WebAssembly. It is a pure npm dependency (~500KB gzipped) with no native compilation required. It runs entirely in-process and persists to a file on disk.

## Storage

| Before | After |
|---|---|
| `.vscode/workboard.json` | `.vscode/workboard.sqlite` |

- On activation: read the SQLite file bytes from disk via `vscode.workspace.fs`, load into WASM memory via `SQL.open()`
- On every write operation: execute the SQL DML, then export the in-memory database buffer via `db.export()`, write the `Uint8Array` back to disk
- Read operations are purely in-memory (WASM), no disk I/O per query

## Schema

```sql
CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'To Do',
  execution_status TEXT DEFAULT 'idle',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

All timestamps stored as ISO 8601 strings (same as current JSON approach). No foreign keys or secondary tables needed in this iteration.

## API Contract (unchanged)

All functions in `ticketStore.ts` keep their existing signatures:

- `loadTickets(): Promise<Ticket[]>` — `SELECT * FROM tickets`
- `createTicket(title, description, status): Promise<Ticket>` — `INSERT INTO tickets`
- `updateTicket(id, updates): Promise<Ticket | undefined>` — `UPDATE tickets SET ... WHERE id = ?`
- `deleteTicket(id): Promise<boolean>` — `DELETE FROM tickets WHERE id = ?`
- `getTicket(id): Promise<Ticket | undefined>` — `SELECT * FROM tickets WHERE id = ?`
- `clearColumn(status): Promise<number>` — `DELETE FROM tickets WHERE status = ?`

No consumers outside `ticketStore.ts` need to change.

## Migration

On startup (`loadTickets` or an explicit init function):

1. Check if `.vscode/workboard.sqlite` exists. If yes, load normally.
2. Check if `.vscode/workboard.json` exists (legacy store). If yes:
   - Read all tickets from JSON
   - Insert them into the SQLite database
   - Verify row count matches
   - Delete `.vscode/workboard.json`
   - Log a migration event

Migration is idempotent — if the SQLite file already exists, JSON is ignored.

## Lifecycle

- **Init:** Called once on extension activation or first ticket access. Opens/creates the database.
- **Flush:** After every mutable operation (create, update, delete, clearColumn), the full database is exported to disk. For the expected data volume (hundreds to low thousands of tickets), a full export per write is negligible.
- **Shutdown:** The database handle is released. No special cleanup needed.

## Dependencies

Add to `package.json`:

```json
{
  "dependencies": {
    "sql.js": "^1.11.0"
  }
}
```

No other dependency changes. `@types/sql.js` types are bundled with the package.

## Error Handling

- If the SQLite file is corrupt or unreadable: log error, treat as empty database, backup the corrupt file to `.vscode/workboard.sqlite.bak`
- If disk write fails: show VS Code error message, keep in-memory state intact, retry on next write
- The extension continues to function even if persistence fails (tickets remain in WASM memory for the session)

## Limitations

- Single-user only — no concurrent access across VS Code windows on the same workspace. This matches current behavior.
- Full database export on every write. Acceptable for kanban data volume. If needed later, incremental WAL/journal can be added.
- No foreign keys, no migrations framework. Schema version could be added as a `meta` table if schema evolves.
