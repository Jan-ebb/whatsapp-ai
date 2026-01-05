import type Database from 'better-sqlite3';
import type { ScheduledMessage } from './types.js';
import crypto from 'node:crypto';

export class ScheduledMessageStore {
  constructor(private db: Database.Database) {}

  /**
   * Create a scheduled message.
   */
  create(message: Omit<ScheduledMessage, 'id' | 'status' | 'createdAt'>): ScheduledMessage {
    const id = crypto.randomUUID();

    const stmt = this.db.prepare(`
      INSERT INTO scheduled_messages (id, chat_jid, content, media_path, scheduled_time, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'pending', datetime('now'))
    `);

    stmt.run(id, message.chatJid, message.content, message.mediaPath ?? null, message.scheduledTime);

    return this.getById(id)!;
  }

  /**
   * Get a scheduled message by ID.
   */
  getById(id: string): ScheduledMessage | null {
    const stmt = this.db.prepare('SELECT * FROM scheduled_messages WHERE id = ?');
    const row = stmt.get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToScheduledMessage(row) : null;
  }

  /**
   * Get pending messages that are due.
   */
  getDue(): ScheduledMessage[] {
    const stmt = this.db.prepare(`
      SELECT * FROM scheduled_messages
      WHERE status = 'pending' AND scheduled_time <= datetime('now')
      ORDER BY scheduled_time ASC
    `);

    const rows = stmt.all() as Record<string, unknown>[];
    return rows.map((row) => this.rowToScheduledMessage(row));
  }

  /**
   * Get all pending messages.
   */
  getPending(options: { limit?: number; offset?: number } = {}): ScheduledMessage[] {
    const { limit = 50, offset = 0 } = options;

    const stmt = this.db.prepare(`
      SELECT * FROM scheduled_messages
      WHERE status = 'pending'
      ORDER BY scheduled_time ASC
      LIMIT ? OFFSET ?
    `);

    const rows = stmt.all(limit, offset) as Record<string, unknown>[];
    return rows.map((row) => this.rowToScheduledMessage(row));
  }

  /**
   * Update message status.
   */
  updateStatus(id: string, status: ScheduledMessage['status']): void {
    const stmt = this.db.prepare('UPDATE scheduled_messages SET status = ? WHERE id = ?');
    stmt.run(status, id);
  }

  /**
   * Cancel a scheduled message.
   */
  cancel(id: string): boolean {
    const stmt = this.db.prepare(`
      UPDATE scheduled_messages SET status = 'cancelled' WHERE id = ? AND status = 'pending'
    `);
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Delete old completed/cancelled messages.
   */
  cleanup(olderThanDays: number = 30): number {
    const stmt = this.db.prepare(`
      DELETE FROM scheduled_messages
      WHERE status IN ('sent', 'failed', 'cancelled')
      AND created_at < datetime('now', '-' || ? || ' days')
    `);
    const result = stmt.run(olderThanDays);
    return result.changes;
  }

  private rowToScheduledMessage(row: Record<string, unknown>): ScheduledMessage {
    return {
      id: row.id as string,
      chatJid: row.chat_jid as string,
      content: row.content as string,
      mediaPath: row.media_path as string | null,
      scheduledTime: row.scheduled_time as string,
      status: row.status as ScheduledMessage['status'],
      createdAt: row.created_at as string,
    };
  }
}
