#!/usr/bin/env node

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from './server.js';

// Load .env file if it exists
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const envPath = path.join(projectRoot, '.env');

if (fs.existsSync(envPath)) {
  const { config } = await import('dotenv');
  config({ path: envPath });
}

// Console formatting helpers
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message: string, type: 'info' | 'success' | 'warn' | 'error' | 'step' = 'info'): void {
  const prefix = {
    info: `${colors.blue}ℹ${colors.reset}`,
    success: `${colors.green}✓${colors.reset}`,
    warn: `${colors.yellow}⚠${colors.reset}`,
    error: `${colors.red}✗${colors.reset}`,
    step: `${colors.cyan}→${colors.reset}`,
  };
  console.error(`${prefix[type]} ${message}`);
}

function printBanner(): void {
  console.error('');
  console.error(`${colors.bright}${colors.green}╔════════════════════════════════════════╗${colors.reset}`);
  console.error(`${colors.bright}${colors.green}║      WhatsApp MCP Server v1.0.0        ║${colors.reset}`);
  console.error(`${colors.bright}${colors.green}╚════════════════════════════════════════╝${colors.reset}`);
  console.error('');
}

function printConfig(storePath: string, config: Record<string, unknown>): void {
  console.error(`${colors.dim}Configuration:${colors.reset}`);
  console.error(`${colors.dim}  Store path:     ${storePath}${colors.reset}`);
  console.error(`${colors.dim}  Confirmation:   ${config.requireConfirmation ? 'required' : 'disabled'}${colors.reset}`);
  console.error(`${colors.dim}  Rate limit:     ${config.rateLimitPerMinute}/min${colors.reset}`);
  console.error(`${colors.dim}  Max messages:   ${config.maxMessagesPerQuery}${colors.reset}`);

  const historySyncDays = config.historySyncDays as number | undefined;
  const historySyncText = historySyncDays === 0
    ? 'disabled'
    : historySyncDays
    ? `${historySyncDays} days`
    : 'default (full)';
  console.error(`${colors.dim}  History sync:   ${historySyncText}${colors.reset}`);
  console.error('');
}

const STORE_PATH = process.env.WHATSAPP_STORE_PATH || path.join(process.cwd(), 'store');
const PASSPHRASE = process.env.WHATSAPP_PASSPHRASE;

async function main(): Promise<void> {
  printBanner();

  // Validate passphrase
  if (!PASSPHRASE) {
    log('WHATSAPP_PASSPHRASE is required', 'error');
    console.error('');
    console.error(`${colors.dim}The passphrase encrypts your WhatsApp credentials stored locally.${colors.reset}`);
    console.error('');
    console.error(`${colors.bright}Option 1: Create a .env file${colors.reset}`);
    console.error(`  cp .env.example .env`);
    console.error(`  # Edit .env and set WHATSAPP_PASSPHRASE`);
    console.error('');
    console.error(`${colors.bright}Option 2: Run setup script${colors.reset}`);
    console.error(`  ./setup.sh`);
    console.error('');
    console.error(`${colors.bright}Option 3: Set environment variable${colors.reset}`);
    console.error(`  WHATSAPP_PASSPHRASE="your-passphrase" npm start`);
    console.error('');
    process.exit(1);
  }

  if (PASSPHRASE.length < 8) {
    log('Passphrase must be at least 8 characters', 'error');
    process.exit(1);
  }

  const serverConfig = {
    requireConfirmation: process.env.WHATSAPP_REQUIRE_CONFIRMATION !== 'false',
    maxMessagesPerQuery: parseInt(process.env.WHATSAPP_MAX_MESSAGES || '50', 10),
    maxChatsPerQuery: parseInt(process.env.WHATSAPP_MAX_CHATS || '100', 10),
    rateLimitPerMinute: parseInt(process.env.WHATSAPP_RATE_LIMIT || '60', 10),
    idleTimeoutMinutes: parseInt(process.env.WHATSAPP_IDLE_TIMEOUT || '30', 10),
    logLevel: (process.env.WHATSAPP_LOG_LEVEL as 'none' | 'errors' | 'operations') || 'errors',
    historySyncDays: process.env.WHATSAPP_HISTORY_SYNC_DAYS
      ? parseInt(process.env.WHATSAPP_HISTORY_SYNC_DAYS, 10)
      : undefined,
  };

  printConfig(STORE_PATH, serverConfig);

  try {
    log('Initializing encryption...', 'step');
    
    const { start, context } = await createServer(STORE_PATH, PASSPHRASE, serverConfig);

    log('Encryption initialized', 'success');
    log('Connecting to WhatsApp...', 'step');

    // Set up connection status logging
    context.whatsapp.on('connection.update', (update) => {
      if (update.isConnected) {
        log('Connected to WhatsApp', 'success');
        console.error('');
        log('Server is ready! Waiting for MCP client requests...', 'info');
        console.error('');
      } else if (update.qrCode) {
        console.error('');
        log('Scan this QR code with WhatsApp on your phone:', 'info');
        console.error(`${colors.dim}  WhatsApp → Settings → Linked Devices → Link a Device${colors.reset}`);
        console.error('');
      } else if (update.lastDisconnect) {
        log(`Disconnected: ${update.lastDisconnect.reason}`, 'warn');
      }
    });

    // Handle reconnection events
    context.whatsapp.on('connection.reconnecting' as any, (info: { attempt: number; maxAttempts: number; delay: number; reason: string }) => {
      log(`Reconnecting (attempt ${info.attempt}/${info.maxAttempts}) in ${Math.round(info.delay / 1000)}s...`, 'info');
    });

    context.whatsapp.on('connection.failed' as any, (info: { reason: string; attempts: number }) => {
      log(`Connection failed after ${info.attempts} attempts`, 'error');
      console.error('');
      log('Try restarting the server or check your internet connection', 'info');
    });

    context.whatsapp.on('connection.logout' as any, () => {
      log('Logged out from WhatsApp', 'warn');
      console.error('');
      log('You need to re-authenticate. Restart the server and scan the QR code.', 'info');
    });

    await start();

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log(`Failed to start: ${message}`, 'error');
    
    if (message.includes('passphrase') || message.includes('decrypt')) {
      console.error('');
      log('If you forgot your passphrase, delete the store directory and re-authenticate:', 'warn');
      console.error(`  rm -rf ${STORE_PATH}`);
    }
    
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.error('');
  log('Shutting down...', 'info');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('');
  log('Shutting down...', 'info');
  process.exit(0);
});

main();
