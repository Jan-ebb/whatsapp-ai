import type Database from 'better-sqlite3';
import type { Chat, GroupParticipant } from './types.js';

export class ChatStore {
  constructor(private db: Database.Database) {}

  /**
   * Insert or update a chat.
   */
  upsert(chat: Partial<Chat> & { jid: string }): void {
    const stmt = this.db.prepare(`
      INSERT INTO chats (
        jid, name, is_group, is_archived, is_pinned, is_muted,
        mute_until, unread_count, last_message_time, updated_at
      ) VALUES (
        @jid, @name, @isGroup, @isArchived, @isPinned, @isMuted,
        @muteUntil, @unreadCount, @lastMessageTime, datetime('now')
      )
      ON CONFLICT(jid) DO UPDATE SET
        name = COALESCE(@name, name),
        is_archived = COALESCE(@isArchived, is_archived),
        is_pinned = COALESCE(@isPinned, is_pinned),
        is_muted = COALESCE(@isMuted, is_muted),
        mute_until = COALESCE(@muteUntil, mute_until),
        unread_count = COALESCE(@unreadCount, unread_count),
        last_message_time = COALESCE(@lastMessageTime, last_message_time),
        updated_at = datetime('now')
    `);

    stmt.run({
      jid: chat.jid,
      name: chat.name ?? null,
      isGroup: chat.isGroup ? 1 : 0,
      isArchived: chat.isArchived ? 1 : 0,
      isPinned: chat.isPinned ? 1 : 0,
      isMuted: chat.isMuted ? 1 : 0,
      muteUntil: chat.muteUntil ?? null,
      unreadCount: chat.unreadCount ?? 0,
      lastMessageTime: chat.lastMessageTime ?? null,
    });
  }

  /**
   * Get a chat by JID.
   */
  getByJid(jid: string): Chat | null {
    const stmt = this.db.prepare('SELECT * FROM chats WHERE jid = ?');
    const row = stmt.get(jid) as Record<string, unknown> | undefined;
    return row ? this.rowToChat(row) : null;
  }

  /**
   * List all chats with optional filters.
   */
  list(options: {
    limit?: number;
    offset?: number;
    archived?: boolean;
    pinned?: boolean;
    groups?: boolean;
    query?: string;
  } = {}): Chat[] {
    const { limit = 100, offset = 0, archived, pinned, groups, query } = options;

    let sql = 'SELECT * FROM chats WHERE 1=1';
    const params: (string | number)[] = [];

    if (archived !== undefined) {
      sql += ' AND is_archived = ?';
      params.push(archived ? 1 : 0);
    }

    if (pinned !== undefined) {
      sql += ' AND is_pinned = ?';
      params.push(pinned ? 1 : 0);
    }

    if (groups !== undefined) {
      sql += ' AND is_group = ?';
      params.push(groups ? 1 : 0);
    }

    if (query) {
      sql += ' AND (name LIKE ? OR jid LIKE ?)';
      const pattern = `%${query}%`;
      params.push(pattern, pattern);
    }

    sql += ' ORDER BY is_pinned DESC, last_message_time DESC NULLS LAST LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as Record<string, unknown>[];
    return rows.map((row) => this.rowToChat(row));
  }

  /**
   * Update chat archived status.
   */
  setArchived(jid: string, archived: boolean): void {
    const stmt = this.db.prepare(`
      UPDATE chats SET is_archived = ?, updated_at = datetime('now') WHERE jid = ?
    `);
    stmt.run(archived ? 1 : 0, jid);
  }

  /**
   * Update chat pinned status.
   */
  setPinned(jid: string, pinned: boolean): void {
    const stmt = this.db.prepare(`
      UPDATE chats SET is_pinned = ?, updated_at = datetime('now') WHERE jid = ?
    `);
    stmt.run(pinned ? 1 : 0, jid);
  }

  /**
   * Update chat muted status.
   */
  setMuted(jid: string, muted: boolean, muteUntil?: string): void {
    const stmt = this.db.prepare(`
      UPDATE chats SET is_muted = ?, mute_until = ?, updated_at = datetime('now') WHERE jid = ?
    `);
    stmt.run(muted ? 1 : 0, muteUntil ?? null, jid);
  }

  /**
   * Update unread count.
   */
  setUnreadCount(jid: string, count: number): void {
    const stmt = this.db.prepare(`
      UPDATE chats SET unread_count = ?, updated_at = datetime('now') WHERE jid = ?
    `);
    stmt.run(count, jid);
  }

  /**
   * Mark chat as read (set unread count to 0).
   */
  markAsRead(jid: string): void {
    this.setUnreadCount(jid, 0);
  }

  /**
   * Update last message time.
   */
  updateLastMessageTime(jid: string, timestamp: string): void {
    const stmt = this.db.prepare(`
      UPDATE chats SET last_message_time = ?, updated_at = datetime('now') WHERE jid = ?
    `);
    stmt.run(timestamp, jid);
  }

  /**
   * Delete a chat.
   */
  delete(jid: string): void {
    const stmt = this.db.prepare('DELETE FROM chats WHERE jid = ?');
    stmt.run(jid);
  }

  // Group participant methods

  /**
   * Set group participants.
   */
  setGroupParticipants(groupJid: string, participants: GroupParticipant[]): void {
    const deleteStmt = this.db.prepare('DELETE FROM group_participants WHERE group_jid = ?');
    const insertStmt = this.db.prepare(`
      INSERT INTO group_participants (group_jid, participant_jid, is_admin, is_super_admin)
      VALUES (?, ?, ?, ?)
    `);

    const transaction = this.db.transaction(() => {
      deleteStmt.run(groupJid);
      for (const p of participants) {
        insertStmt.run(groupJid, p.participantJid, p.isAdmin ? 1 : 0, p.isSuperAdmin ? 1 : 0);
      }
    });

    transaction();
  }

  /**
   * Get group participants.
   */
  getGroupParticipants(groupJid: string): GroupParticipant[] {
    const stmt = this.db.prepare('SELECT * FROM group_participants WHERE group_jid = ?');
    const rows = stmt.all(groupJid) as Record<string, unknown>[];

    return rows.map((row) => ({
      groupJid: row.group_jid as string,
      participantJid: row.participant_jid as string,
      isAdmin: Boolean(row.is_admin),
      isSuperAdmin: Boolean(row.is_super_admin),
    }));
  }

  /**
   * Add a participant to a group.
   */
  addGroupParticipant(groupJid: string, participantJid: string, isAdmin = false): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO group_participants (group_jid, participant_jid, is_admin, is_super_admin)
      VALUES (?, ?, ?, 0)
    `);
    stmt.run(groupJid, participantJid, isAdmin ? 1 : 0);
  }

  /**
   * Remove a participant from a group.
   */
  removeGroupParticipant(groupJid: string, participantJid: string): void {
    const stmt = this.db.prepare(
      'DELETE FROM group_participants WHERE group_jid = ? AND participant_jid = ?'
    );
    stmt.run(groupJid, participantJid);
  }

  private rowToChat(row: Record<string, unknown>): Chat {
    return {
      jid: row.jid as string,
      name: row.name as string | null,
      isGroup: Boolean(row.is_group),
      isArchived: Boolean(row.is_archived),
      isPinned: Boolean(row.is_pinned),
      isMuted: Boolean(row.is_muted),
      muteUntil: row.mute_until as string | null,
      unreadCount: row.unread_count as number,
      lastMessageTime: row.last_message_time as string | null,
      updatedAt: row.updated_at as string,
    };
  }
}
