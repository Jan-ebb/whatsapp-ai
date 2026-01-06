import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import path from 'node:path';

import {
  Encryption,
  RateLimiter,
  SessionManager,
  checkConfirmation,
  validateQueryLimits,
  type SecurityConfig,
  defaultSecurityConfig,
} from './security/index.js';
import {
  DatabaseManager,
  MessageStore,
  ChatStore,
  ContactStore,
  ScheduledMessageStore,
  VectorStore,
} from './storage/index.js';
import { EmbeddingService } from './embeddings/index.js';
import { WhatsAppClient } from './whatsapp/index.js';
import { MessageScheduler } from './utils/scheduler.js';
import { phoneNumberToJid, isGroupJid } from './utils/formatting.js';

// Import tool handlers
import { createMessagingTools, handleMessagingTool } from './tools/messaging.js';
import { createChatTools, handleChatTool } from './tools/chats.js';
import { createContactTools, handleContactTool } from './tools/contacts.js';
import { createGroupTools, handleGroupTool } from './tools/groups.js';
import { createPresenceTools, handlePresenceTool } from './tools/presence.js';
import { createUtilityTools, handleUtilityTool } from './tools/utility.js';

export interface ServerContext {
  whatsapp: WhatsAppClient;
  db: DatabaseManager;
  messages: MessageStore;
  chats: ChatStore;
  contacts: ContactStore;
  scheduled: ScheduledMessageStore;
  vectors: VectorStore;
  embeddings: EmbeddingService;
  scheduler: MessageScheduler;
  encryption: Encryption;
  rateLimiter: RateLimiter;
  session: SessionManager;
  config: SecurityConfig;
}

export async function createServer(
  storePath: string,
  passphrase: string,
  config: Partial<SecurityConfig> = {}
): Promise<{ server: Server; context: ServerContext; start: () => Promise<void> }> {
  const securityConfig: SecurityConfig = { ...defaultSecurityConfig, ...config };

  // Initialize security components
  const encryption = new Encryption(storePath);
  await encryption.initialize(passphrase);

  const rateLimiter = new RateLimiter(securityConfig.rateLimitPerMinute);
  const session = new SessionManager(securityConfig.idleTimeoutMinutes);

  // Initialize database with encryption
  const db = new DatabaseManager(storePath, passphrase);
  db.initialize();

  const dbInstance = db.getDb();
  const messages = new MessageStore(dbInstance);
  const chats = new ChatStore(dbInstance);
  const contacts = new ContactStore(dbInstance);
  const scheduledStore = new ScheduledMessageStore(dbInstance);

  // Initialize embedding service
  const embeddings = new EmbeddingService({
    model: process.env.WHATSAPP_EMBEDDING_MODEL || 'nomic-embed-text',
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  });

  // Initialize vector store
  const vectors = new VectorStore(dbInstance, embeddings.getDimension());
  
  // Try to initialize vectors (will fail gracefully if Ollama not available)
  try {
    vectors.initialize();
  } catch (error) {
    console.error('Vector store initialization failed. Semantic search disabled.');
  }

  // Initialize scheduler
  const scheduler = new MessageScheduler(scheduledStore);

  // Initialize WhatsApp client
  const whatsapp = new WhatsAppClient(
    {
      storePath,
      printQRInTerminal: true,
      logLevel: securityConfig.logLevel === 'none' ? 'silent' : 'error',
      historySyncDays: securityConfig.historySyncDays,
    },
    encryption
  );

  // Set up WhatsApp event handlers to sync with database
  setupWhatsAppEventHandlers(whatsapp, { messages, chats, contacts }, vectors, embeddings);

  // Set up scheduler event handlers
  scheduler.on('message.due', async (msg) => {
    try {
      if (whatsapp.isConnected()) {
        await whatsapp.sendMessage(msg.chatJid, msg.content);
        scheduler.markSent(msg.id);
      }
    } catch (error) {
      scheduler.markFailed(msg.id);
    }
  });

  const context: ServerContext = {
    whatsapp,
    db,
    messages,
    chats,
    contacts,
    scheduled: scheduledStore,
    vectors,
    embeddings,
    scheduler,
    encryption,
    rateLimiter,
    session,
    config: securityConfig,
  };

  // Create MCP server
  const server = new Server(
    {
      name: 'whatsapp-ai',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register tool list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools: Tool[] = [
      ...createMessagingTools(),
      ...createChatTools(),
      ...createContactTools(),
      ...createGroupTools(),
      ...createPresenceTools(),
      ...createUtilityTools(),
    ];

    return { tools };
  });

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Check rate limit
    if (!rateLimiter.checkLimit()) {
      return {
        content: [
          {
            type: 'text',
            text: `Rate limit exceeded. Try again in ${Math.ceil(rateLimiter.getTimeUntilReset() / 1000)} seconds.`,
          },
        ],
        isError: true,
      };
    }

    // Record activity for session management
    session.recordActivity();

    // Check confirmation for write operations
    const confirmResult = checkConfirmation(
      name,
      (args as Record<string, unknown>)?.confirm as boolean | undefined,
      securityConfig.requireConfirmation
    );

    if (!confirmResult.allowed) {
      return {
        content: [
          {
            type: 'text',
            text: confirmResult.reason || 'Operation not allowed',
          },
        ],
        isError: true,
      };
    }

    try {
      let result: unknown;

      // Route to appropriate handler
      if (isMessagingTool(name)) {
        result = await handleMessagingTool(name, args as Record<string, unknown>, context);
      } else if (isChatTool(name)) {
        result = await handleChatTool(name, args as Record<string, unknown>, context);
      } else if (isContactTool(name)) {
        result = await handleContactTool(name, args as Record<string, unknown>, context);
      } else if (isGroupTool(name)) {
        result = await handleGroupTool(name, args as Record<string, unknown>, context);
      } else if (isPresenceTool(name)) {
        result = await handlePresenceTool(name, args as Record<string, unknown>, context);
      } else if (isUtilityTool(name)) {
        result = await handleUtilityTool(name, args as Record<string, unknown>, context);
      } else {
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  const start = async (): Promise<void> => {
    // Start MCP server immediately so Claude Code doesn't timeout
    const transport = new StdioServerTransport();
    await server.connect(transport);

    // Start scheduler
    scheduler.start();

    // Unlock session
    session.unlock();

    // Connect to WhatsApp in background (don't await)
    // This allows MCP to respond while WhatsApp is still connecting/syncing
    whatsapp.connect().catch((error) => {
      console.error('WhatsApp connection error:', error);
    });
  };

  return { server, context, start };
}

function setupWhatsAppEventHandlers(
  whatsapp: WhatsAppClient,
  stores: { messages: MessageStore; chats: ChatStore; contacts: ContactStore },
  vectors: VectorStore,
  embeddings: EmbeddingService
): void {
  whatsapp.on('message.new', async (msg) => {
    stores.messages.upsert({
      id: msg.id,
      chatJid: msg.chatJid,
      senderJid: msg.senderJid,
      content: msg.content,
      timestamp: msg.timestamp.toISOString(),
      isFromMe: msg.isFromMe,
      isForwarded: msg.isForwarded,
      replyToId: msg.quotedMessageId,
      mediaType: msg.messageType !== 'text' ? msg.messageType : null,
      mediaMimeType: msg.mediaMimeType,
      mediaFilename: msg.mediaFilename,
      mediaSize: msg.mediaSize,
    });

    // Update chat last message time
    stores.chats.upsert({
      jid: msg.chatJid,
      lastMessageTime: msg.timestamp.toISOString(),
      isGroup: isGroupJid(msg.chatJid),
    });

    // Embed message content for semantic search (async, non-blocking)
    if (msg.content && vectors.isInitialized()) {
      embeddings.embed(msg.content).then((embedding) => {
        if (embedding) {
          vectors.upsert(msg.id, embedding, embeddings.getModel());
        }
      }).catch(() => {
        // Silently fail - embedding is best-effort
      });
    }
  });

  whatsapp.on('chat.update', (chat) => {
    stores.chats.upsert({
      jid: chat.jid,
      name: chat.name,
      unreadCount: chat.unreadCount,
    });
  });

  whatsapp.on('contacts.update', (contactUpdates) => {
    for (const contact of contactUpdates) {
      stores.contacts.upsert({
        jid: contact.jid,
        name: contact.name,
        pushName: contact.notify,
      });
    }
  });

  whatsapp.on('message.reaction', (reaction) => {
    const message = stores.messages.getById(reaction.messageId);
    if (message) {
      const reactions = message.reactions ? JSON.parse(message.reactions) : {};
      if (!reactions[reaction.emoji]) {
        reactions[reaction.emoji] = [];
      }
      if (!reactions[reaction.emoji].includes(reaction.senderJid)) {
        reactions[reaction.emoji].push(reaction.senderJid);
      }
      stores.messages.updateReactions(reaction.messageId, reactions);
    }
  });
}

// Tool category checks
const MESSAGING_TOOLS = new Set([
  'send_message',
  'send_media',
  'reply_to_message',
  'forward_message',
  'react_to_message',
  'delete_message',
  'edit_message',
  'star_message',
]);

const CHAT_TOOLS = new Set([
  'list_chats',
  'get_chat',
  'get_messages',
  'search_messages',
  'semantic_search',
  'hybrid_search',
  'get_embedding_status',
  'embed_historical_messages',
  'mark_as_read',
  'archive_chat',
  'pin_chat',
  'mute_chat',
]);

const CONTACT_TOOLS = new Set(['search_contacts', 'get_contact', 'get_profile_picture']);

const GROUP_TOOLS = new Set([
  'create_group',
  'get_group_info',
  'add_participants',
  'remove_participants',
]);

const PRESENCE_TOOLS = new Set(['get_presence', 'send_typing']);

const UTILITY_TOOLS = new Set([
  'get_connection_status',
  'logout',
  'schedule_message',
  'cancel_scheduled',
  'list_scheduled',
  'sync_chat_history',
]);

function isMessagingTool(name: string): boolean {
  return MESSAGING_TOOLS.has(name);
}

function isChatTool(name: string): boolean {
  return CHAT_TOOLS.has(name);
}

function isContactTool(name: string): boolean {
  return CONTACT_TOOLS.has(name);
}

function isGroupTool(name: string): boolean {
  return GROUP_TOOLS.has(name);
}

function isPresenceTool(name: string): boolean {
  return PRESENCE_TOOLS.has(name);
}

function isUtilityTool(name: string): boolean {
  return UTILITY_TOOLS.has(name);
}
