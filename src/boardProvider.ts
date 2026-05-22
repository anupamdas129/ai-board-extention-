import * as vscode from "vscode";
import { Ticket, ColumnStatus, COLUMNS, COLUMN_ICONS, COLUMN_CONTEXT_VALUES } from "./types";
import { loadTickets, createTicket, getNextColumn } from "./ticketStore";

export class BoardDataProvider implements vscode.TreeDataProvider<BoardItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<BoardItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private tickets: Ticket[] = [];

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  async load(): Promise<void> {
    this.tickets = await loadTickets();
    this.refresh();
  }

  async addTicket(title: string, description: string, status: ColumnStatus): Promise<void> {
    await createTicket(title, description, status);
    await this.load();
  }

  getTicket(id: string): Ticket | undefined {
    return this.tickets.find((t) => t.id === id);
  }

  async moveTicket(ticket: Ticket): Promise<void> {
    const nextColumn = getNextColumn(ticket.status);
    if (!nextColumn) {
      return;
    }
    const { updateTicket } = await import("./ticketStore");
    await updateTicket(ticket.id, { status: nextColumn });
    await this.load();
  }

  async moveTicketTo(ticket: Ticket, status: ColumnStatus): Promise<void> {
    const { updateTicket } = await import("./ticketStore");
    await updateTicket(ticket.id, { status });
    await this.load();
  }

  async deleteTicket(ticket: Ticket): Promise<void> {
    const { deleteTicket } = await import("./ticketStore");
    await deleteTicket(ticket.id);
    await this.load();
  }

  getChildren(element?: BoardItem): BoardItem[] {
    if (!element) {
      return COLUMNS.map((status) => {
        const count = this.tickets.filter((t) => t.status === status).length;
        return new BoardItem(status, `$(${COLUMN_ICONS[status]}) ${status}`, count, {
          contextValue: "column",
          columnStatus: status,
        });
      });
    }

    if (element.columnStatus) {
      return this.tickets
        .filter((ticket) => ticket.status === element.columnStatus)
        .map((ticket) => {
          const icon = ticket.executionStatus === "running" ? "loading~spin" : "circle";
          return new BoardItem(
            ticket.id,
            `$(${icon}) ${ticket.title}`,
            undefined,
            {
              contextValue: COLUMN_CONTEXT_VALUES[ticket.status] || "ticket",
              ticket,
            }
          );
        });
    }

    return [];
  }

  getTreeItem(element: BoardItem): vscode.TreeItem {
    return element;
  }
}

export class BoardItem extends vscode.TreeItem {
  ticket?: Ticket;
  columnStatus?: ColumnStatus;
  count?: number;

  constructor(
    public readonly id: string,
    label: string,
    count: number | undefined,
    extras?: {
      contextValue?: string;
      ticket?: Ticket;
      columnStatus?: ColumnStatus;
    }
  ) {
    super(
      label,
      extras?.columnStatus
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None
    );

    if (extras?.contextValue) {
      this.contextValue = extras.contextValue;
    }

    if (extras?.ticket) {
      this.ticket = extras.ticket;
      this.tooltip = new vscode.MarkdownString(
        `**${extras.ticket.title}**\n\n${extras.ticket.description || "_No description_"}\n\n---\n\`${extras.ticket.id}\` | ${extras.ticket.status}`
      );
      this.description = extras.ticket.executionStatus === "running" ? "(running...)" : "";
    }

    if (extras?.columnStatus) {
      this.columnStatus = extras.columnStatus;
      this.description = `${count} ticket${count === 1 ? "" : "s"}`;
      this.contextValue = "column";
    }
  }
}
