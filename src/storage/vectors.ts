import type Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { VECTOR_SCHEMA, getVectorTableSQL } from './schema.js';

export interface VectorSearchResult {
  messageId: string;
  distance: number;
}

export class VectorStore {
  private initialized = false;
  private dimension: number;

  constructor(
    private db: Database.Database,
    dimension: number = 768
  ) {
    this.dimension = dimension;
  }

  /**
   * Initialize the vector extension and create tables.
   */
  initialize(): void {
    if (this.initialized) return;

    // Load sqlite-vec extension
    sqliteVec.load(this.db);

    // Create metadata table
    this.db.exec(VECTOR_SCHEMA);

    // Create vector virtual table
    this.db.exec(getVectorTableSQL(this.dimension));

    this.initialized = true;
  }

  /**
   * Check if vector store is initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Store an embedding for a message.
   */
  upsert(messageId: string, embedding: number[], model: string): void {
    if (!this.initialized) {
      throw new Error('Vector store not initialized');
    }

    // Convert embedding array to the format sqlite-vec expects
    const embeddingBlob = this.float32ArrayToBlob(embedding);

    // Use a transaction for consistency
    const transaction = this.db.transaction(() => {
      // Delete existing embedding if any
      this.db.prepare('DELETE FROM message_embeddings WHERE message_id = ?').run(messageId);
      this.db.prepare('DELETE FROM message_embeddings_meta WHERE message_id = ?').run(messageId);

      // Insert new embedding
      this.db.prepare(
        'INSERT INTO message_embeddings (message_id, embedding) VALUES (?, ?)'
      ).run(messageId, embeddingBlob);

      // Insert metadata
      this.db.prepare(
        'INSERT INTO message_embeddings_meta (message_id, embedding_model) VALUES (?, ?)'
      ).run(messageId, model);
    });

    transaction();
  }

  /**
   * Store multiple embeddings in a batch.
   */
  upsertBatch(
    items: Array<{ messageId: string; embedding: number[] }>,
    model: string
  ): void {
    if (!this.initialized) {
      throw new Error('Vector store not initialized');
    }

    const transaction = this.db.transaction(() => {
      const deleteEmbedding = this.db.prepare('DELETE FROM message_embeddings WHERE message_id = ?');
      const deleteMeta = this.db.prepare('DELETE FROM message_embeddings_meta WHERE message_id = ?');
      const insertEmbedding = this.db.prepare(
        'INSERT INTO message_embeddings (message_id, embedding) VALUES (?, ?)'
      );
      const insertMeta = this.db.prepare(
        'INSERT INTO message_embeddings_meta (message_id, embedding_model) VALUES (?, ?)'
      );

      for (const item of items) {
        const embeddingBlob = this.float32ArrayToBlob(item.embedding);
        
        deleteEmbedding.run(item.messageId);
        deleteMeta.run(item.messageId);
        insertEmbedding.run(item.messageId, embeddingBlob);
        insertMeta.run(item.messageId, model);
      }
    });

    transaction();
  }

  /**
   * Search for similar messages using vector similarity.
   */
  search(queryEmbedding: number[], limit: number = 20): VectorSearchResult[] {
    if (!this.initialized) {
      throw new Error('Vector store not initialized');
    }

    const embeddingBlob = this.float32ArrayToBlob(queryEmbedding);

    const results = this.db.prepare(`
      SELECT 
        message_id as messageId,
        distance
      FROM message_embeddings
      WHERE embedding MATCH ?
      ORDER BY distance
      LIMIT ?
    `).all(embeddingBlob, limit) as VectorSearchResult[];

    return results;
  }

  /**
   * Check if a message has an embedding.
   */
  hasEmbedding(messageId: string): boolean {
    if (!this.initialized) return false;

    const result = this.db.prepare(
      'SELECT 1 FROM message_embeddings_meta WHERE message_id = ?'
    ).get(messageId);

    return result !== undefined;
  }

  /**
   * Get message IDs that don't have embeddings yet.
   */
  getUnembeddedMessageIds(limit: number = 100): string[] {
    if (!this.initialized) return [];

    const results = this.db.prepare(`
      SELECT m.id
      FROM messages m
      LEFT JOIN message_embeddings_meta e ON m.id = e.message_id
      WHERE e.message_id IS NULL
        AND m.content IS NOT NULL
        AND m.content != ''
        AND m.is_deleted = 0
      ORDER BY m.timestamp DESC
      LIMIT ?
    `).all(limit) as Array<{ id: string }>;

    return results.map((r) => r.id);
  }

  /**
   * Get count of embedded messages.
   */
  getEmbeddedCount(): number {
    if (!this.initialized) return 0;

    const result = this.db.prepare(
      'SELECT COUNT(*) as count FROM message_embeddings_meta'
    ).get() as { count: number };

    return result.count;
  }

  /**
   * Get count of messages without embeddings.
   */
  getUnembeddedCount(): number {
    if (!this.initialized) return 0;

    const result = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM messages m
      LEFT JOIN message_embeddings_meta e ON m.id = e.message_id
      WHERE e.message_id IS NULL
        AND m.content IS NOT NULL
        AND m.content != ''
        AND m.is_deleted = 0
    `).get() as { count: number };

    return result.count;
  }

  /**
   * Delete embedding for a message.
   */
  delete(messageId: string): void {
    if (!this.initialized) return;

    this.db.prepare('DELETE FROM message_embeddings WHERE message_id = ?').run(messageId);
    this.db.prepare('DELETE FROM message_embeddings_meta WHERE message_id = ?').run(messageId);
  }

  /**
   * Convert a number array to a Float32Array blob for sqlite-vec.
   */
  private float32ArrayToBlob(arr: number[]): Buffer {
    const float32 = new Float32Array(arr);
    return Buffer.from(float32.buffer);
  }
}
