import type Database from 'better-sqlite3';
import type { Message, MessageSearchResult } from './types.js';

export class MessageStore {
  constructor(private db: Database.Database) {}

  /**
   * Insert or update a message.
   */
  upsert(message: Partial<Message> & { id: string; chatJid: string; timestamp: string }): void {
    const stmt = this.db.prepare(`
      INSERT INTO messages (
        id, chat_jid, sender_jid, content, timestamp, is_from_me,
        is_forwarded, is_starred, is_deleted, reply_to_id,
        media_type, media_url, media_mime_type, media_filename,
        media_size, media_downloaded, media_local_path, reactions, updated_at
      ) VALUES (
        @id, @chatJid, @senderJid, @content, @timestamp, @isFromMe,
        @isForwarded, @isStarred, @isDeleted, @replyToId,
        @mediaType, @mediaUrl, @mediaMimeType, @mediaFilename,
        @mediaSize, @mediaDownloaded, @mediaLocalPath, @reactions, datetime('now')
      )
      ON CONFLICT(id) DO UPDATE SET
        content = COALESCE(@content, content),
        is_starred = COALESCE(@isStarred, is_starred),
        is_deleted = COALESCE(@isDeleted, is_deleted),
        media_downloaded = COALESCE(@mediaDownloaded, media_downloaded),
        media_local_path = COALESCE(@mediaLocalPath, media_local_path),
        reactions = COALESCE(@reactions, reactions),
        updated_at = datetime('now')
    `);

    stmt.run({
      id: message.id,
      chatJid: message.chatJid,
      senderJid: message.senderJid ?? null,
      content: message.content ?? null,
      timestamp: message.timestamp,
      isFromMe: message.isFromMe ? 1 : 0,
      isForwarded: message.isForwarded ? 1 : 0,
      isStarred: message.isStarred ? 1 : 0,
      isDeleted: message.isDeleted ? 1 : 0,
      replyToId: message.replyToId ?? null,
      mediaType: message.mediaType ?? null,
      mediaUrl: message.mediaUrl ?? null,
      mediaMimeType: message.mediaMimeType ?? null,
      mediaFilename: message.mediaFilename ?? null,
      mediaSize: message.mediaSize ?? null,
      mediaDownloaded: message.mediaDownloaded ? 1 : 0,
      mediaLocalPath: message.mediaLocalPath ?? null,
      reactions: message.reactions ?? null,
    });
  }

  /**
   * Get a message by ID.
   */
  getById(id: string): Message | null {
    const stmt = this.db.prepare('SELECT * FROM messages WHERE id = ?');
    const row = stmt.get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToMessage(row) : null;
  }

  /**
   * Get messages for a chat with pagination.
   */
  getByChatJid(
    chatJid: string,
    options: { limit?: number; offset?: number; before?: string; after?: string } = {}
  ): Message[] {
    const { limit = 50, offset = 0, before, after } = options;

    let query = 'SELECT * FROM messages WHERE chat_jid = ?';
    const params: (string | number)[] = [chatJid];

    if (before) {
      query += ' AND timestamp < ?';
      params.push(before);
    }

    if (after) {
      query += ' AND timestamp > ?';
      params.push(after);
    }

    query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as Record<string, unknown>[];
    return rows.map((row) => this.rowToMessage(row));
  }

  /**
   * Full-text search messages.
   */
  search(
    query: string,
    options: { chatJid?: string; limit?: number; offset?: number } = {}
  ): MessageSearchResult[] {
    const { chatJid, limit = 50, offset = 0 } = options;

    let sql = `
      SELECT messages.*, messages_fts.rank
      FROM messages_fts
      JOIN messages ON messages.rowid = messages_fts.rowid
      WHERE messages_fts MATCH ?
    `;
    const params: (string | number)[] = [query];

    if (chatJid) {
      sql += ' AND messages.chat_jid = ?';
      params.push(chatJid);
    }

    sql += ' ORDER BY rank LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as (Record<string, unknown> & { rank: number })[];

    return rows.map((row) => ({
      message: this.rowToMessage(row),
      rank: row.rank,
      snippet: this.generateSnippet(row.content as string | null, query),
    }));
  }

  /**
   * Get starred messages.
   */
  getStarred(options: { limit?: number; offset?: number } = {}): Message[] {
    const { limit = 50, offset = 0 } = options;

    const stmt = this.db.prepare(`
      SELECT * FROM messages
      WHERE is_starred = 1
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `);

    const rows = stmt.all(limit, offset) as Record<string, unknown>[];
    return rows.map((row) => this.rowToMessage(row));
  }

  /**
   * Update message starred status.
   */
  setStar(id: string, starred: boolean): void {
    const stmt = this.db.prepare(`
      UPDATE messages SET is_starred = ?, updated_at = datetime('now') WHERE id = ?
    `);
    stmt.run(starred ? 1 : 0, id);
  }

  /**
   * Mark message as deleted.
   */
  markDeleted(id: string): void {
    const stmt = this.db.prepare(`
      UPDATE messages SET is_deleted = 1, content = NULL, updated_at = datetime('now') WHERE id = ?
    `);
    stmt.run(id);
  }

  /**
   * Update message reactions.
   */
  updateReactions(id: string, reactions: Record<string, string[]>): void {
    const stmt = this.db.prepare(`
      UPDATE messages SET reactions = ?, updated_at = datetime('now') WHERE id = ?
    `);
    stmt.run(JSON.stringify(reactions), id);
  }

  /**
   * Delete messages older than a date.
   */
  deleteOlderThan(date: string): number {
    const stmt = this.db.prepare('DELETE FROM messages WHERE timestamp < ?');
    const result = stmt.run(date);
    return result.changes;
  }

  private rowToMessage(row: Record<string, unknown>): Message {
    return {
      id: row.id as string,
      chatJid: row.chat_jid as string,
      senderJid: row.sender_jid as string | null,
      content: row.content as string | null,
      timestamp: row.timestamp as string,
      isFromMe: Boolean(row.is_from_me),
      isForwarded: Boolean(row.is_forwarded),
      isStarred: Boolean(row.is_starred),
      isDeleted: Boolean(row.is_deleted),
      replyToId: row.reply_to_id as string | null,
      mediaType: row.media_type as string | null,
      mediaUrl: row.media_url as string | null,
      mediaMimeType: row.media_mime_type as string | null,
      mediaFilename: row.media_filename as string | null,
      mediaSize: row.media_size as number | null,
      mediaDownloaded: Boolean(row.media_downloaded),
      mediaLocalPath: row.media_local_path as string | null,
      reactions: row.reactions as string | null,
      updatedAt: row.updated_at as string,
    };
  }

  private generateSnippet(content: string | null, query: string): string {
    if (!content) return '';

    const lowerContent = content.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerContent.indexOf(lowerQuery);

    if (index === -1) return content.slice(0, 100);

    const start = Math.max(0, index - 30);
    const end = Math.min(content.length, index + query.length + 30);

    let snippet = content.slice(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < content.length) snippet = snippet + '...';

    return snippet;
  }
}
