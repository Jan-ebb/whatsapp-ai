#!/usr/bin/env node

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Encryption } from './security/encryption.js';
import { DatabaseManager, MessageStore, ChatStore, ContactStore } from './storage/index.js';
import { WhatsAppClient } from './whatsapp/index.js';

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
  magenta: '\x1b[35m',
};

function log(message: string, type: 'info' | 'success' | 'warn' | 'error' = 'info'): void {
  const prefix = {
    info: `${colors.blue}ℹ${colors.reset}`,
    success: `${colors.green}✓${colors.reset}`,
    warn: `${colors.yellow}⚠${colors.reset}`,
    error: `${colors.red}✗${colors.reset}`,
  };
  console.log(`${prefix[type]} ${message}`);
}

const STORE_PATH = process.env.WHATSAPP_STORE_PATH || path.join(process.cwd(), 'store');
const PASSPHRASE = process.env.WHATSAPP_PASSPHRASE;

interface CliCommand {
  name: string;
  args: string[];
}

function parseCommand(args: string[]): CliCommand {
  const [name, ...commandArgs] = args.slice(2);
  return { name, args: commandArgs };
}

function printUsage(): void {
  console.log('');
  console.log(`${colors.bright}WhatsApp CLI${colors.reset}`);
  console.log('');
  console.log(`${colors.bright}Usage:${colors.reset}`);
  console.log('  npm run cli <command> [options]');
  console.log('');
  console.log(`${colors.bright}Commands:${colors.reset}`);
  console.log(`  ${colors.cyan}messages <contact>${colors.reset}       Get messages from a contact or group`);
  console.log(`  ${colors.cyan}chats${colors.reset}                    List all chats`);
  console.log(`  ${colors.cyan}contacts [query]${colors.reset}         Search contacts`);
  console.log(`  ${colors.cyan}send <contact> <message>${colors.reset} Send a message`);
  console.log(`  ${colors.cyan}status${colors.reset}                   Check connection status`);
  console.log('');
  console.log(`${colors.bright}Examples:${colors.reset}`);
  console.log(`  npm run cli messages "Estella Ho"`);
  console.log(`  npm run cli chats`);
  console.log(`  npm run cli contacts john`);
  console.log(`  npm run cli send "+1234567890" "Hello!"`);
  console.log('');
}

async function findContactByName(name: string, contacts: ContactStore): Promise<string | null> {
  const allContacts = contacts.search(name, { limit: 10 });

  if (allContacts.length === 0) {
    return null;
  }

  // Try exact match first
  const exactMatch = allContacts.find(
    (c) => c.name?.toLowerCase() === name.toLowerCase() || c.pushName?.toLowerCase() === name.toLowerCase()
  );

  if (exactMatch) {
    return exactMatch.jid;
  }

  // Return first partial match
  return allContacts[0].jid;
}

async function handleMessages(contactName: string, messages: MessageStore, contacts: ContactStore, chats: ChatStore): Promise<void> {
  log(`Searching for contact: ${contactName}`, 'info');

  const contactJid = await findContactByName(contactName, contacts);

  if (!contactJid) {
    log(`Contact not found: ${contactName}`, 'error');
    log('Try running "npm run cli contacts" to see available contacts', 'info');
    return;
  }

  const contact = contacts.getByJid(contactJid);
  const displayName = contact?.name || contact?.pushName || contactJid;

  log(`Found contact: ${displayName} (${contactJid})`, 'success');
  console.log('');

  const msgList = messages.getByChatJid(contactJid, { limit: 50 });

  if (msgList.length === 0) {
    log('No messages found', 'warn');
    return;
  }

  log(`Found ${msgList.length} messages:`, 'info');
  console.log('');

  for (const msg of msgList) {
    const timestamp = new Date(msg.timestamp);
    const timeStr = timestamp.toLocaleString();
    const sender = msg.isFromMe ? 'You' : displayName;
    const senderColor = msg.isFromMe ? colors.cyan : colors.green;

    console.log(`${colors.dim}${timeStr}${colors.reset} ${senderColor}${sender}:${colors.reset}`);
    console.log(`  ${msg.content || `[${msg.mediaType || 'media'}]`}`);
    console.log('');
  }
}

async function handleChats(chats: ChatStore, contacts: ContactStore): Promise<void> {
  const chatList = chats.list({ limit: 50 });

  if (chatList.length === 0) {
    log('No chats found', 'warn');
    return;
  }

  log(`Found ${chatList.length} chats:`, 'info');
  console.log('');

  for (const chat of chatList) {
    const contact = contacts.getByJid(chat.jid);
    const displayName = chat.name || contact?.name || contact?.pushName || chat.jid;
    const lastMessageTime = chat.lastMessageTime ? new Date(chat.lastMessageTime).toLocaleString() : 'Never';
    const unreadBadge = chat.unreadCount > 0 ? ` ${colors.yellow}(${chat.unreadCount} unread)${colors.reset}` : '';
    const groupBadge = chat.isGroup ? ` ${colors.blue}[Group]${colors.reset}` : '';

    console.log(`${colors.bright}${displayName}${colors.reset}${groupBadge}${unreadBadge}`);
    console.log(`  ${colors.dim}JID: ${chat.jid}${colors.reset}`);
    console.log(`  ${colors.dim}Last message: ${lastMessageTime}${colors.reset}`);
    console.log('');
  }
}

async function handleContacts(query: string | undefined, contacts: ContactStore): Promise<void> {
  const contactList = query ? contacts.search(query, { limit: 50 }) : contacts.list({ limit: 50 });

  if (contactList.length === 0) {
    log('No contacts found', 'warn');
    return;
  }

  log(`Found ${contactList.length} contacts:`, 'info');
  console.log('');

  for (const contact of contactList) {
    const displayName = contact.name || contact.pushName || 'Unknown';

    console.log(`${colors.bright}${displayName}${colors.reset}`);
    console.log(`  ${colors.dim}JID: ${contact.jid}${colors.reset}`);
    if (contact.name && contact.pushName && contact.name !== contact.pushName) {
      console.log(`  ${colors.dim}Push name: ${contact.pushName}${colors.reset}`);
    }
    console.log('');
  }
}

async function handleSend(contactName: string, message: string, whatsapp: WhatsAppClient, contacts: ContactStore): Promise<void> {
  log(`Searching for contact: ${contactName}`, 'info');

  // Check if it's a phone number
  let targetJid: string | null = null;

  if (contactName.startsWith('+') || /^\d+$/.test(contactName)) {
    // It's a phone number
    const phoneNumber = contactName.replace(/[^\d]/g, '');
    targetJid = `${phoneNumber}@s.whatsapp.net`;
  } else {
    // Search by name
    targetJid = await findContactByName(contactName, contacts);
  }

  if (!targetJid) {
    log(`Contact not found: ${contactName}`, 'error');
    return;
  }

  log(`Sending message to ${targetJid}...`, 'info');

  await whatsapp.sendMessage(targetJid, message);

  log('Message sent successfully!', 'success');
}

async function handleStatus(whatsapp: WhatsAppClient): Promise<void> {
  const isConnected = whatsapp.isConnected();

  if (isConnected) {
    log('Connected to WhatsApp', 'success');
  } else {
    log('Not connected to WhatsApp', 'error');
    log('Make sure the MCP server is running with "npm start"', 'info');
  }
}

async function main(): Promise<void> {
  const command = parseCommand(process.argv);

  if (!command.name || command.name === 'help') {
    printUsage();
    process.exit(0);
  }

  // Validate passphrase
  if (!PASSPHRASE) {
    log('WHATSAPP_PASSPHRASE is required', 'error');
    console.log('');
    console.log(`${colors.dim}Set the passphrase in your .env file or environment${colors.reset}`);
    process.exit(1);
  }

  try {
    // Initialize encryption
    const encryption = new Encryption(STORE_PATH);
    await encryption.initialize(PASSPHRASE);

    // Initialize database with encryption
    const db = new DatabaseManager(STORE_PATH, PASSPHRASE);
    db.initialize();

    const dbInstance = db.getDb();
    const messages = new MessageStore(dbInstance);
    const chats = new ChatStore(dbInstance);
    const contacts = new ContactStore(dbInstance);

    // Initialize WhatsApp client for send/status commands
    let whatsapp: WhatsAppClient | null = null;

    if (command.name === 'send' || command.name === 'status') {
      whatsapp = new WhatsAppClient(
        {
          storePath: STORE_PATH,
          printQRInTerminal: true,
          logLevel: 'silent',
        },
        encryption
      );

      await whatsapp.connect();

      // Wait for connection
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 30000);

        whatsapp!.on('connection.update', (update) => {
          if (update.isConnected) {
            clearTimeout(timeout);
            resolve();
          }
        });
      });
    }

    // Handle commands
    switch (command.name) {
      case 'messages': {
        if (command.args.length === 0) {
          log('Please provide a contact name', 'error');
          console.log('Usage: npm run cli messages <contact>');
          process.exit(1);
        }
        const contactName = command.args.join(' ');
        await handleMessages(contactName, messages, contacts, chats);
        break;
      }

      case 'chats': {
        await handleChats(chats, contacts);
        break;
      }

      case 'contacts': {
        const query = command.args.length > 0 ? command.args.join(' ') : undefined;
        await handleContacts(query, contacts);
        break;
      }

      case 'send': {
        if (command.args.length < 2) {
          log('Please provide a contact and message', 'error');
          console.log('Usage: npm run cli send <contact> <message>');
          process.exit(1);
        }
        const [contactName, ...msgParts] = command.args;
        const message = msgParts.join(' ');
        await handleSend(contactName, message, whatsapp!, contacts);
        break;
      }

      case 'status': {
        await handleStatus(whatsapp!);
        break;
      }

      default: {
        log(`Unknown command: ${command.name}`, 'error');
        printUsage();
        process.exit(1);
      }
    }

    // Disconnect if we connected
    if (whatsapp) {
      await whatsapp.disconnect();
    }

    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log(`Error: ${message}`, 'error');
    process.exit(1);
  }
}

main();
