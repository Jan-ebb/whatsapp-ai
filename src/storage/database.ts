import Database from 'better-sqlite3-multiple-ciphers';
import path from 'node:path';
import fs from 'node:fs';
import { SCHEMA } from './schema.js';

export class DatabaseManager {
  private db: Database.Database | null = null;
  private readonly dbPath: string;
  private readonly passphrase: string;

  constructor(storePath: string, passphrase: string) {
    this.dbPath = path.join(storePath, 'whatsapp.db');
    this.passphrase = passphrase;
  }

  /**
   * Initialize the database with schema and encryption.
   */
  initialize(): void {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);

    // Enable SQLCipher encryption with the passphrase
    // Using sqlcipher cipher which is the most widely used
    this.db.pragma(`cipher='sqlcipher'`);
    this.db.pragma(`key='${this.escapePassphrase(this.passphrase)}'`);

    // Verify encryption is working by running a simple query
    // This will throw if the passphrase is wrong for an existing database
    try {
      this.db.pragma('cipher_version');
    } catch (error) {
      this.db.close();
      this.db = null;
      throw new Error('Failed to decrypt database. Wrong passphrase?');
    }

    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');

    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');

    // Execute schema
    this.db.exec(SCHEMA);
  }

  /**
   * Escape single quotes in passphrase for SQL.
   */
  private escapePassphrase(passphrase: string): string {
    return passphrase.replace(/'/g, "''");
  }

  /**
   * Get the database instance.
   */
  getDb(): Database.Database {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }

  /**
   * Close the database connection.
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Check if database is initialized.
   */
  isInitialized(): boolean {
    return this.db !== null;
  }
}
