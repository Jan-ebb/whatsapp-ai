import {
  useMultiFileAuthState,
  type AuthenticationState,
  type SignalDataTypeMap,
} from '@whiskeysockets/baileys';
import fs from 'node:fs';
import path from 'node:path';
import { Encryption } from '../security/encryption.js';

/**
 * Creates an encrypted auth state handler.
 * Auth credentials are encrypted at rest using the provided encryption instance.
 */
export async function useEncryptedAuthState(
  storePath: string,
  encryption: Encryption
): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
  clearCreds: () => Promise<void>;
}> {
  const authPath = path.join(storePath, 'auth');

  // Ensure auth directory exists
  if (!fs.existsSync(authPath)) {
    fs.mkdirSync(authPath, { recursive: true });
  }

  // Use baileys' built-in multi-file auth state
  const { state, saveCreds: originalSaveCreds } = await useMultiFileAuthState(authPath);

  // Wrap saveCreds to encrypt sensitive data
  const saveCreds = async (): Promise<void> => {
    await originalSaveCreds();

    // Encrypt the creds.json file if it exists
    const credsPath = path.join(authPath, 'creds.json');
    if (fs.existsSync(credsPath)) {
      const credsData = fs.readFileSync(credsPath, 'utf8');
      const encryptedPath = path.join(authPath, 'creds.enc');

      // Only encrypt if not already encrypted
      if (!credsData.startsWith('{')) {
        return; // Already encrypted or invalid
      }

      const encrypted = encryption.encrypt(credsData);
      fs.writeFileSync(encryptedPath, encrypted, { mode: 0o600 });

      // Remove unencrypted file
      fs.unlinkSync(credsPath);
    }
  };

  const clearCreds = async (): Promise<void> => {
    // Remove all auth files
    if (fs.existsSync(authPath)) {
      const files = fs.readdirSync(authPath);
      for (const file of files) {
        fs.unlinkSync(path.join(authPath, file));
      }
      fs.rmdirSync(authPath);
    }
  };

  // Check if we need to decrypt existing creds
  const encryptedCredsPath = path.join(authPath, 'creds.enc');
  const credsPath = path.join(authPath, 'creds.json');

  if (fs.existsSync(encryptedCredsPath) && !fs.existsSync(credsPath)) {
    try {
      const encryptedData = fs.readFileSync(encryptedCredsPath, 'utf8');
      const decrypted = encryption.decryptString(encryptedData);
      fs.writeFileSync(credsPath, decrypted, { mode: 0o600 });

      // Re-load state with decrypted creds
      const { state: newState } = await useMultiFileAuthState(authPath);
      return { state: newState, saveCreds, clearCreds };
    } catch (error) {
      // Decryption failed - likely wrong passphrase
      throw new Error('Failed to decrypt auth credentials. Wrong passphrase?');
    }
  }

  return { state, saveCreds, clearCreds };
}
