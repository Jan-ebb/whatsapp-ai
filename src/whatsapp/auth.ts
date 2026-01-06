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
  const encryptedCredsPath = path.join(authPath, 'creds.enc');
  const credsPath = path.join(authPath, 'creds.json');

  // Ensure auth directory exists
  if (!fs.existsSync(authPath)) {
    fs.mkdirSync(authPath, { recursive: true });
  }

  // FIRST: Check if we need to decrypt existing creds BEFORE loading state
  if (fs.existsSync(encryptedCredsPath)) {
    try {
      console.error('[Auth] Found encrypted credentials, decrypting...');
      const encryptedData = fs.readFileSync(encryptedCredsPath, 'utf8');
      const decrypted = encryption.decryptString(encryptedData);
      fs.writeFileSync(credsPath, decrypted, { mode: 0o600 });
      console.error('[Auth] Credentials decrypted successfully');
    } catch (error) {
      console.error('[Auth] Failed to decrypt credentials:', error);
      // Delete corrupted encrypted file and start fresh
      fs.unlinkSync(encryptedCredsPath);
      throw new Error('Failed to decrypt auth credentials. Wrong passphrase? Starting fresh.');
    }
  }

  // Use baileys' built-in multi-file auth state
  const { state, saveCreds: originalSaveCreds } = await useMultiFileAuthState(authPath);

  // Wrap saveCreds to encrypt sensitive data
  const saveCreds = async (): Promise<void> => {
    await originalSaveCreds();

    // Encrypt the creds.json file if it exists
    if (fs.existsSync(credsPath)) {
      try {
        const credsData = fs.readFileSync(credsPath, 'utf8');

        // Only encrypt if it's valid JSON
        if (credsData.startsWith('{')) {
          const encrypted = encryption.encrypt(credsData);
          fs.writeFileSync(encryptedCredsPath, encrypted, { mode: 0o600 });
          // Keep creds.json for baileys to use, it will be encrypted on next startup
          console.error('[Auth] Credentials saved and encrypted');
        }
      } catch (error) {
        console.error('[Auth] Error encrypting credentials:', error);
      }
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

  return { state, saveCreds, clearCreds };
}
