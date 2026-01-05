import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const PBKDF2_ITERATIONS = 100000;

export class Encryption {
  private key: Buffer | null = null;
  private salt: Buffer | null = null;

  constructor(private storePath: string) {}

  /**
   * Initialize encryption with a passphrase.
   * Derives a key using PBKDF2 and stores/loads salt.
   */
  async initialize(passphrase: string): Promise<void> {
    const saltPath = path.join(this.storePath, '.salt');

    if (fs.existsSync(saltPath)) {
      this.salt = fs.readFileSync(saltPath);
    } else {
      this.salt = crypto.randomBytes(SALT_LENGTH);
      fs.mkdirSync(this.storePath, { recursive: true });
      fs.writeFileSync(saltPath, this.salt, { mode: 0o600 });
    }

    this.key = await this.deriveKey(passphrase, this.salt);
  }

  private deriveKey(passphrase: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(
        passphrase,
        salt,
        PBKDF2_ITERATIONS,
        KEY_LENGTH,
        'sha512',
        (err, derivedKey) => {
          if (err) reject(err);
          else resolve(derivedKey);
        }
      );
    });
  }

  /**
   * Encrypt data. Returns base64 encoded string containing IV + auth tag + ciphertext.
   */
  encrypt(data: string | Buffer): string {
    if (!this.key) {
      throw new Error('Encryption not initialized');
    }

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);

    const input = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
    const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Format: IV (16) + AuthTag (16) + Ciphertext
    const result = Buffer.concat([iv, authTag, encrypted]);
    return result.toString('base64');
  }

  /**
   * Decrypt base64 encoded encrypted data.
   */
  decrypt(encryptedData: string): Buffer {
    if (!this.key) {
      throw new Error('Encryption not initialized');
    }

    const data = Buffer.from(encryptedData, 'base64');

    if (data.length < IV_LENGTH + AUTH_TAG_LENGTH) {
      throw new Error('Invalid encrypted data');
    }

    const iv = data.subarray(0, IV_LENGTH);
    const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  /**
   * Decrypt to string.
   */
  decryptString(encryptedData: string): string {
    return this.decrypt(encryptedData).toString('utf8');
  }

  /**
   * Securely wipe the key from memory.
   */
  wipe(): void {
    if (this.key) {
      crypto.randomFillSync(this.key);
      this.key = null;
    }
    if (this.salt) {
      crypto.randomFillSync(this.salt);
      this.salt = null;
    }
  }

  /**
   * Check if encryption is initialized.
   */
  isInitialized(): boolean {
    return this.key !== null;
  }
}
