import { Ollama } from 'ollama';

export interface EmbeddingConfig {
  model: string;
  baseUrl?: string;
  batchSize: number;
}

export const defaultEmbeddingConfig: EmbeddingConfig = {
  model: 'nomic-embed-text',
  baseUrl: 'http://localhost:11434',
  batchSize: 50,
};

export class EmbeddingService {
  private client: Ollama;
  private config: EmbeddingConfig;
  private isAvailable: boolean | null = null;

  constructor(config: Partial<EmbeddingConfig> = {}) {
    this.config = { ...defaultEmbeddingConfig, ...config };
    this.client = new Ollama({ host: this.config.baseUrl });
  }

  /**
   * Check if Ollama is available and the model is loaded.
   */
  async checkAvailability(): Promise<boolean> {
    if (this.isAvailable !== null) {
      return this.isAvailable;
    }

    try {
      // Check if Ollama is running
      const models = await this.client.list();
      
      // Check if our embedding model is available
      const hasModel = models.models.some(
        (m) => m.name === this.config.model || m.name.startsWith(`${this.config.model}:`)
      );

      if (!hasModel) {
        console.error(`Embedding model '${this.config.model}' not found. Pull it with: ollama pull ${this.config.model}`);
        this.isAvailable = false;
        return false;
      }

      this.isAvailable = true;
      return true;
    } catch (error) {
      console.error('Ollama not available. Semantic search disabled.');
      this.isAvailable = false;
      return false;
    }
  }

  /**
   * Generate embedding for a single text.
   */
  async embed(text: string): Promise<number[] | null> {
    if (!(await this.checkAvailability())) {
      return null;
    }

    try {
      const response = await this.client.embed({
        model: this.config.model,
        input: text,
      });

      return response.embeddings[0];
    } catch (error) {
      console.error('Failed to generate embedding:', error);
      return null;
    }
  }

  /**
   * Generate embeddings for multiple texts in batches.
   */
  async embedBatch(texts: string[]): Promise<(number[] | null)[]> {
    if (!(await this.checkAvailability())) {
      return texts.map(() => null);
    }

    const results: (number[] | null)[] = [];

    // Process in batches
    for (let i = 0; i < texts.length; i += this.config.batchSize) {
      const batch = texts.slice(i, i + this.config.batchSize);
      
      try {
        const response = await this.client.embed({
          model: this.config.model,
          input: batch,
        });

        results.push(...response.embeddings);
      } catch (error) {
        console.error(`Failed to embed batch ${i / this.config.batchSize}:`, error);
        results.push(...batch.map(() => null));
      }
    }

    return results;
  }

  /**
   * Get the embedding dimension for the current model.
   * nomic-embed-text produces 768-dimensional vectors.
   */
  getDimension(): number {
    // nomic-embed-text uses 768 dimensions
    if (this.config.model.includes('nomic-embed-text')) {
      return 768;
    }
    // Default fallback
    return 768;
  }

  /**
   * Get the current model name.
   */
  getModel(): string {
    return this.config.model;
  }
}
