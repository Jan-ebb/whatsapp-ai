import type Database from 'better-sqlite3';
import type { Contact } from './types.js';

export class ContactStore {
  constructor(private db: Database.Database) {}

  /**
   * Insert or update a contact.
   */
  upsert(contact: Partial<Contact> & { jid: string }): void {
    const stmt = this.db.prepare(`
      INSERT INTO contacts (
        jid, phone_number, name, push_name, profile_picture_url, is_business, updated_at
      ) VALUES (
        @jid, @phoneNumber, @name, @pushName, @profilePictureUrl, @isBusiness, datetime('now')
      )
      ON CONFLICT(jid) DO UPDATE SET
        phone_number = COALESCE(@phoneNumber, phone_number),
        name = COALESCE(@name, name),
        push_name = COALESCE(@pushName, push_name),
        profile_picture_url = COALESCE(@profilePictureUrl, profile_picture_url),
        is_business = COALESCE(@isBusiness, is_business),
        updated_at = datetime('now')
    `);

    stmt.run({
      jid: contact.jid,
      phoneNumber: contact.phoneNumber ?? null,
      name: contact.name ?? null,
      pushName: contact.pushName ?? null,
      profilePictureUrl: contact.profilePictureUrl ?? null,
      isBusiness: contact.isBusiness ? 1 : 0,
    });
  }

  /**
   * Get a contact by JID.
   */
  getByJid(jid: string): Contact | null {
    const stmt = this.db.prepare('SELECT * FROM contacts WHERE jid = ?');
    const row = stmt.get(jid) as Record<string, unknown> | undefined;
    return row ? this.rowToContact(row) : null;
  }

  /**
   * Get a contact by phone number.
   */
  getByPhoneNumber(phoneNumber: string): Contact | null {
    // Normalize phone number - remove any non-digit characters
    const normalized = phoneNumber.replace(/\D/g, '');

    const stmt = this.db.prepare(`
      SELECT * FROM contacts
      WHERE phone_number = ? OR phone_number LIKE ? OR jid LIKE ?
      LIMIT 1
    `);

    const row = stmt.get(normalized, `%${normalized}%`, `${normalized}@%`) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToContact(row) : null;
  }

  /**
   * Search contacts by name or phone number.
   */
  search(query: string, options: { limit?: number; offset?: number } = {}): Contact[] {
    const { limit = 50, offset = 0 } = options;

    const pattern = `%${query}%`;
    const stmt = this.db.prepare(`
      SELECT * FROM contacts
      WHERE name LIKE ? OR push_name LIKE ? OR phone_number LIKE ? OR jid LIKE ?
      ORDER BY name, push_name
      LIMIT ? OFFSET ?
    `);

    const rows = stmt.all(pattern, pattern, pattern, pattern, limit, offset) as Record<
      string,
      unknown
    >[];
    return rows.map((row) => this.rowToContact(row));
  }

  /**
   * List all contacts.
   */
  list(options: { limit?: number; offset?: number } = {}): Contact[] {
    const { limit = 100, offset = 0 } = options;

    const stmt = this.db.prepare(`
      SELECT * FROM contacts
      ORDER BY name, push_name
      LIMIT ? OFFSET ?
    `);

    const rows = stmt.all(limit, offset) as Record<string, unknown>[];
    return rows.map((row) => this.rowToContact(row));
  }

  /**
   * Update profile picture URL.
   */
  updateProfilePicture(jid: string, url: string | null): void {
    const stmt = this.db.prepare(`
      UPDATE contacts SET profile_picture_url = ?, updated_at = datetime('now') WHERE jid = ?
    `);
    stmt.run(url, jid);
  }

  /**
   * Delete a contact.
   */
  delete(jid: string): void {
    const stmt = this.db.prepare('DELETE FROM contacts WHERE jid = ?');
    stmt.run(jid);
  }

  /**
   * Get contact count.
   */
  count(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM contacts');
    const row = stmt.get() as { count: number };
    return row.count;
  }

  private rowToContact(row: Record<string, unknown>): Contact {
    return {
      jid: row.jid as string,
      phoneNumber: row.phone_number as string | null,
      name: row.name as string | null,
      pushName: row.push_name as string | null,
      profilePictureUrl: row.profile_picture_url as string | null,
      isBusiness: Boolean(row.is_business),
      updatedAt: row.updated_at as string,
    };
  }
}
