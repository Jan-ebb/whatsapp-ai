#!/usr/bin/env node

import path from 'node:path';
import { createServer } from './server.js';

const STORE_PATH = process.env.WHATSAPP_STORE_PATH || path.join(process.cwd(), 'store');
const PASSPHRASE = process.env.WHATSAPP_PASSPHRASE;

async function main(): Promise<void> {
  // Validate passphrase
  if (!PASSPHRASE) {
    console.error('Error: WHATSAPP_PASSPHRASE environment variable is required.');
    console.error('This passphrase is used to encrypt your WhatsApp credentials and message database.');
    console.error('');
    console.error('Usage:');
    console.error('  WHATSAPP_PASSPHRASE="your-secure-passphrase" npm start');
    console.error('');
    console.error('Or set it in your MCP client configuration.');
    process.exit(1);
  }

  if (PASSPHRASE.length < 8) {
    console.error('Error: WHATSAPP_PASSPHRASE must be at least 8 characters long.');
    process.exit(1);
  }

  try {
    console.error('Starting WhatsApp MCP Server...');
    console.error(`Store path: ${STORE_PATH}`);

    const { start } = await createServer(STORE_PATH, PASSPHRASE, {
      // Security configuration - can be overridden via environment variables
      requireConfirmation: process.env.WHATSAPP_REQUIRE_CONFIRMATION !== 'false',
      maxMessagesPerQuery: parseInt(process.env.WHATSAPP_MAX_MESSAGES || '50', 10),
      maxChatsPerQuery: parseInt(process.env.WHATSAPP_MAX_CHATS || '100', 10),
      rateLimitPerMinute: parseInt(process.env.WHATSAPP_RATE_LIMIT || '60', 10),
      idleTimeoutMinutes: parseInt(process.env.WHATSAPP_IDLE_TIMEOUT || '30', 10),
      logLevel: (process.env.WHATSAPP_LOG_LEVEL as 'none' | 'errors' | 'operations') || 'errors',
    });

    await start();

    console.error('WhatsApp MCP Server started successfully.');
    console.error('Waiting for QR code scan if not already authenticated...');
  } catch (error) {
    console.error('Failed to start WhatsApp MCP Server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.error('Shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('Shutting down...');
  process.exit(0);
});

main();
