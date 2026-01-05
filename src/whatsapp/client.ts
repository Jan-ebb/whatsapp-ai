import baileys, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type WASocket,
  type proto,
  type AnyMessageContent,
  type MiscMessageGenerationOptions,
  getContentType,
  downloadMediaMessage,
  type GroupMetadata as BaileysGroupMetadata,
  type GroupParticipant as BaileysGroupParticipant,
} from '@whiskeysockets/baileys';

const makeWASocket = baileys.default || baileys;
import { Boom } from '@hapi/boom';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import pino from 'pino';
import qrcode from 'qrcode-terminal';

import { useEncryptedAuthState } from './auth.js';
import { Encryption } from '../security/encryption.js';
import type {
  WhatsAppConfig,
  ConnectionState,
  SendMessageOptions,
  SendMediaOptions,
  PresenceState,
  GroupMetadata,
  IncomingMessage,
  MessageType,
} from './types.js';

export interface WhatsAppClientEvents {
  'connection.update': (state: ConnectionState) => void;
  'qr': (qr: string) => void;
  'message.new': (message: IncomingMessage) => void;
  'message.update': (update: { id: string; chatJid: string; update: Partial<IncomingMessage> }) => void;
  'message.reaction': (reaction: { messageId: string; chatJid: string; emoji: string; senderJid: string }) => void;
  'chat.update': (chat: { jid: string; name?: string; unreadCount?: number }) => void;
  'presence.update': (presence: PresenceState) => void;
  'group.update': (group: { jid: string; metadata: Partial<GroupMetadata> }) => void;
  'contacts.update': (contacts: Array<{ jid: string; name?: string; notify?: string }>) => void;
}

export class WhatsAppClient extends EventEmitter {
  private socket: WASocket | null = null;
  private connectionState: ConnectionState = {
    isConnected: false,
    isConnecting: false,
    qrCode: null,
    lastDisconnect: null,
  };
  private saveCreds: (() => Promise<void>) | null = null;
  private clearCreds: (() => Promise<void>) | null = null;
  private readonly config: WhatsAppConfig;
  private readonly encryption: Encryption;
  private readonly logger: pino.Logger;
  
  // Auto-reconnect settings
  private reconnectAttempts: number = 0;
  private readonly maxReconnectAttempts: number = 10;
  private readonly baseReconnectDelay: number = 1000; // 1 second
  private readonly maxReconnectDelay: number = 60000; // 1 minute
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(config: WhatsAppConfig, encryption: Encryption) {
    super();
    this.config = config;
    this.encryption = encryption;

    // Create a silent logger - never log message content
    this.logger = pino({
      level: config.logLevel,
      transport:
        config.logLevel !== 'silent'
          ? {
              target: 'pino-pretty',
              options: { colorize: true },
            }
          : undefined,
    });
  }

  /**
   * Connect to WhatsApp.
   */
  async connect(): Promise<void> {
    if (this.connectionState.isConnecting || this.connectionState.isConnected) {
      return;
    }

    this.connectionState.isConnecting = true;
    this.emitConnectionUpdate();

    try {
      const { state, saveCreds, clearCreds } = await useEncryptedAuthState(
        this.config.storePath,
        this.encryption
      );
      this.saveCreds = saveCreds;
      this.clearCreds = clearCreds;

      const { version } = await fetchLatestBaileysVersion();

      // Configure history sync based on user settings
      const syncFullHistory = this.config.historySyncDays !== 0;
      const getMessage = syncFullHistory ? undefined : async () => undefined;

      this.socket = (makeWASocket as Function)({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, this.logger),
        },
        printQRInTerminal: this.config.printQRInTerminal,
        logger: this.logger,
        generateHighQualityLinkPreview: true,
        syncFullHistory, // Enable/disable based on historySyncDays
        markOnlineOnConnect: false,
        getMessage, // Control message retrieval during sync
      });

      this.setupEventHandlers();
    } catch (error) {
      this.connectionState.isConnecting = false;
      this.emitConnectionUpdate();
      throw error;
    }
  }

  /**
   * Disconnect from WhatsApp.
   */
  async disconnect(): Promise<void> {
    // Cancel any pending reconnect
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;

    if (this.socket) {
      this.socket.end(undefined);
      this.socket = null;
    }

    this.connectionState.isConnected = false;
    this.connectionState.isConnecting = false;
    this.emitConnectionUpdate();
  }

  /**
   * Schedule a reconnection attempt with exponential backoff.
   */
  private scheduleReconnect(reason: string): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('connection.failed', {
        reason: 'max_reconnect_attempts',
        attempts: this.reconnectAttempts,
      });
      return;
    }

    // Exponential backoff with jitter
    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts) + Math.random() * 1000,
      this.maxReconnectDelay
    );

    this.reconnectAttempts++;

    this.emit('connection.reconnecting', {
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
      delay,
      reason,
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => {
        // Connection failed, will trigger another reconnect via connection.update
      });
    }, delay);
  }

  /**
   * Logout and clear credentials.
   */
  async logout(): Promise<void> {
    if (this.socket) {
      await this.socket.logout();
      this.socket = null;
    }

    if (this.clearCreds) {
      await this.clearCreds();
    }

    this.connectionState.isConnected = false;
    this.connectionState.isConnecting = false;
    this.connectionState.qrCode = null;
    this.emitConnectionUpdate();
  }

  /**
   * Get current connection state.
   */
  getConnectionState(): ConnectionState {
    return { ...this.connectionState };
  }

  /**
   * Check if connected.
   */
  isConnected(): boolean {
    return this.connectionState.isConnected;
  }

  /**
   * Send a text message.
   */
  async sendMessage(
    jid: string,
    text: string,
    options: SendMessageOptions = {}
  ): Promise<proto.WebMessageInfo | undefined> {
    this.ensureConnected();

    const content: AnyMessageContent = { text };
    const msgOptions: MiscMessageGenerationOptions = {};

    if (options.quotedMessageId) {
      // We need to fetch the quoted message to properly quote it
      // For now, we'll use a simplified approach
      msgOptions.quoted = {
        key: {
          remoteJid: jid,
          id: options.quotedMessageId,
        },
      } as proto.IWebMessageInfo;
    }

    return this.socket!.sendMessage(jid, content, msgOptions);
  }

  /**
   * Send a media message (image, video, document, audio).
   */
  async sendMedia(
    jid: string,
    mediaPath: string,
    mediaType: 'image' | 'video' | 'document' | 'audio',
    options: SendMediaOptions = {}
  ): Promise<proto.WebMessageInfo | undefined> {
    this.ensureConnected();

    if (!fs.existsSync(mediaPath)) {
      throw new Error(`Media file not found: ${mediaPath}`);
    }

    const buffer = fs.readFileSync(mediaPath);
    const filename = options.filename || path.basename(mediaPath);

    let content: AnyMessageContent;

    switch (mediaType) {
      case 'image':
        content = {
          image: buffer,
          caption: options.caption,
          mimetype: options.mimetype || 'image/jpeg',
        };
        break;
      case 'video':
        content = {
          video: buffer,
          caption: options.caption,
          mimetype: options.mimetype || 'video/mp4',
        };
        break;
      case 'audio':
        content = {
          audio: buffer,
          mimetype: options.mimetype || 'audio/mp4',
          ptt: true, // Send as voice note
        };
        break;
      case 'document':
        content = {
          document: buffer,
          fileName: filename,
          mimetype: options.mimetype || 'application/octet-stream',
        };
        break;
    }

    const msgOptions: MiscMessageGenerationOptions = {};
    if (options.quotedMessageId) {
      msgOptions.quoted = {
        key: {
          remoteJid: jid,
          id: options.quotedMessageId,
        },
      } as proto.IWebMessageInfo;
    }

    return this.socket!.sendMessage(jid, content, msgOptions);
  }

  /**
   * Forward a message to another chat.
   */
  async forwardMessage(
    toJid: string,
    messageId: string,
    fromJid: string
  ): Promise<proto.WebMessageInfo | undefined> {
    this.ensureConnected();

    // Fetch the message to forward
    // Note: This requires the message to be in local cache
    const content: AnyMessageContent = {
      forward: {
        key: {
          remoteJid: fromJid,
          id: messageId,
        },
      } as proto.IWebMessageInfo,
    };

    return this.socket!.sendMessage(toJid, content);
  }

  /**
   * React to a message with an emoji.
   */
  async reactToMessage(
    chatJid: string,
    messageId: string,
    emoji: string,
    senderJid?: string
  ): Promise<proto.WebMessageInfo | undefined> {
    this.ensureConnected();

    const content: AnyMessageContent = {
      react: {
        text: emoji,
        key: {
          remoteJid: chatJid,
          id: messageId,
          fromMe: senderJid === undefined,
          participant: senderJid,
        },
      },
    };

    return this.socket!.sendMessage(chatJid, content);
  }

  /**
   * Delete a message.
   */
  async deleteMessage(
    chatJid: string,
    messageId: string,
    forEveryone: boolean = false
  ): Promise<proto.WebMessageInfo | undefined> {
    this.ensureConnected();

    if (forEveryone) {
      const content: AnyMessageContent = {
        delete: {
          remoteJid: chatJid,
          id: messageId,
          fromMe: true,
        },
      };
      return this.socket!.sendMessage(chatJid, content);
    } else {
      // Delete for me only - clear the chat message
      // Note: Baileys API for deleting single messages for self is limited
      // Using clear with specific message
      await this.socket!.chatModify(
        {
          clear: {
            messages: [{ id: messageId, fromMe: true }],
          },
        } as unknown as Parameters<WASocket['chatModify']>[0],
        chatJid
      );
      return undefined;
    }
  }

  /**
   * Edit a sent message.
   */
  async editMessage(
    chatJid: string,
    messageId: string,
    newText: string
  ): Promise<proto.WebMessageInfo | undefined> {
    this.ensureConnected();

    const content: AnyMessageContent = {
      text: newText,
      edit: {
        remoteJid: chatJid,
        id: messageId,
        fromMe: true,
      },
    };

    return this.socket!.sendMessage(chatJid, content);
  }

  /**
   * Star/unstar a message.
   */
  async starMessage(chatJid: string, messageId: string, star: boolean): Promise<void> {
    this.ensureConnected();

    // Note: starring messages requires specific message info
    await this.socket!.chatModify(
      {
        star: {
          messages: [{ id: messageId, fromMe: true }],
          star,
        },
      },
      chatJid
    );
  }

  /**
   * Mark chat as read.
   */
  async markChatRead(chatJid: string): Promise<void> {
    this.ensureConnected();
    await this.socket!.readMessages([{ remoteJid: chatJid, id: 'all' }]);
  }

  /**
   * Archive/unarchive a chat.
   */
  async archiveChat(chatJid: string, archive: boolean): Promise<void> {
    this.ensureConnected();
    await this.socket!.chatModify(
      {
        archive,
        lastMessages: [],
      },
      chatJid
    );
  }

  /**
   * Pin/unpin a chat.
   */
  async pinChat(chatJid: string, pin: boolean): Promise<void> {
    this.ensureConnected();
    await this.socket!.chatModify({ pin }, chatJid);
  }

  /**
   * Mute/unmute a chat.
   */
  async muteChat(chatJid: string, mute: boolean, duration?: number): Promise<void> {
    this.ensureConnected();

    const muteEndTime = mute && duration ? Date.now() + duration * 1000 : undefined;
    await this.socket!.chatModify({ mute: mute ? muteEndTime || -1 : null }, chatJid);
  }

  /**
   * Get presence (online status) of a contact.
   */
  async subscribePresence(jid: string): Promise<void> {
    this.ensureConnected();
    await this.socket!.presenceSubscribe(jid);
  }

  /**
   * Send typing indicator.
   */
  async sendTyping(chatJid: string, composing: boolean = true): Promise<void> {
    this.ensureConnected();
    await this.socket!.sendPresenceUpdate(composing ? 'composing' : 'paused', chatJid);
  }

  /**
   * Create a group.
   */
  async createGroup(
    name: string,
    participants: string[]
  ): Promise<{ jid: string; participants: Array<{ jid: string; status: string }> }> {
    this.ensureConnected();

    const result = await this.socket!.groupCreate(name, participants);
    return {
      jid: result.id,
      participants: (result.participants as Array<{ id: string; error?: unknown }>).map((p) => ({
        jid: p.id,
        status: p.error ? 'failed' : 'added',
      })),
    };
  }

  /**
   * Get group metadata.
   */
  async getGroupMetadata(groupJid: string): Promise<GroupMetadata> {
    this.ensureConnected();

    const metadata = await this.socket!.groupMetadata(groupJid);
    return this.convertGroupMetadata(metadata);
  }

  /**
   * Add participants to a group.
   */
  async addGroupParticipants(
    groupJid: string,
    participants: string[]
  ): Promise<Array<{ jid: string; status: string }>> {
    this.ensureConnected();

    const result = await this.socket!.groupParticipantsUpdate(groupJid, participants, 'add');
    return result.map((r) => ({
      jid: r.jid,
      status: r.status,
    }));
  }

  /**
   * Remove participants from a group.
   */
  async removeGroupParticipants(
    groupJid: string,
    participants: string[]
  ): Promise<Array<{ jid: string; status: string }>> {
    this.ensureConnected();

    const result = await this.socket!.groupParticipantsUpdate(groupJid, participants, 'remove');
    return result.map((r) => ({
      jid: r.jid,
      status: r.status,
    }));
  }

  /**
   * Get profile picture URL.
   */
  async getProfilePicture(jid: string): Promise<string | null> {
    this.ensureConnected();

    try {
      const url = await this.socket!.profilePictureUrl(jid, 'image');
      return url ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Download media from a message.
   */
  async downloadMedia(message: proto.IWebMessageInfo): Promise<Buffer> {
    this.ensureConnected();
    return downloadMediaMessage(message, 'buffer', {}) as Promise<Buffer>;
  }

  /**
   * Get the user's own JID.
   */
  getOwnJid(): string | null {
    return this.socket?.user?.id || null;
  }

  private setupEventHandlers(): void {
    if (!this.socket) return;

    // Connection updates
    this.socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.connectionState.qrCode = qr;
        if (this.config.printQRInTerminal) {
          qrcode.generate(qr, { small: true });
        }
        this.emit('qr', qr);
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        const reason = DisconnectReason[statusCode] || 'unknown';

        this.connectionState.isConnected = false;
        this.connectionState.isConnecting = false;
        this.connectionState.lastDisconnect = {
          reason,
          date: new Date(),
        };

        if (shouldReconnect) {
          this.scheduleReconnect(reason);
        } else {
          // Logged out - reset reconnect attempts
          this.reconnectAttempts = 0;
          this.emit('connection.logout');
        }
      } else if (connection === 'open') {
        // Reset reconnect attempts on successful connection
        this.reconnectAttempts = 0;
        this.connectionState.isConnected = true;
        this.connectionState.isConnecting = false;
        this.connectionState.qrCode = null;
      }

      this.emitConnectionUpdate();
    });

    // Credentials update
    this.socket.ev.on('creds.update', async () => {
      if (this.saveCreds) {
        await this.saveCreds();
      }
    });

    // New messages
    this.socket.ev.on('messages.upsert', ({ messages, type }) => {
      for (const msg of messages) {
        if (type === 'notify') {
          const parsed = this.parseMessage(msg);
          if (parsed) {
            this.emit('message.new', parsed);
          }
        }
      }
    });

    // Message updates (read receipts, etc.)
    this.socket.ev.on('messages.update', (updates) => {
      for (const update of updates) {
        if (update.key.id && update.key.remoteJid) {
          this.emit('message.update', {
            id: update.key.id,
            chatJid: update.key.remoteJid,
            update: {},
          });
        }
      }
    });

    // Message reactions
    this.socket.ev.on('messages.reaction', (reactions) => {
      for (const reaction of reactions) {
        if (reaction.key.id && reaction.key.remoteJid && reaction.reaction.text) {
          this.emit('message.reaction', {
            messageId: reaction.key.id,
            chatJid: reaction.key.remoteJid,
            emoji: reaction.reaction.text,
            senderJid: reaction.key.participant || reaction.key.remoteJid,
          });
        }
      }
    });

    // Chat updates
    this.socket.ev.on('chats.update', (chats) => {
      for (const chat of chats) {
        if (chat.id) {
          this.emit('chat.update', {
            jid: chat.id,
            name: chat.name,
            unreadCount: chat.unreadCount,
          });
        }
      }
    });

    // Presence updates
    this.socket.ev.on('presence.update', ({ id, presences }) => {
      for (const [jid, presence] of Object.entries(presences)) {
        this.emit('presence.update', {
          jid,
          presence: presence.lastKnownPresence as PresenceState['presence'],
          lastSeen: presence.lastSeen ? new Date(presence.lastSeen * 1000) : undefined,
        });
      }
    });

    // Contact updates
    this.socket.ev.on('contacts.update', (contacts) => {
      this.emit(
        'contacts.update',
        contacts.map((c) => ({
          jid: c.id!,
          name: c.name,
          notify: c.notify,
        }))
      );
    });

    // Group updates
    this.socket.ev.on('groups.update', (groups) => {
      for (const group of groups) {
        if (group.id) {
          this.emit('group.update', {
            jid: group.id,
            metadata: {
              subject: group.subject,
              description: group.desc,
            },
          });
        }
      }
    });
  }

  private parseMessage(msg: proto.IWebMessageInfo): IncomingMessage | null {
    if (!msg.key.id || !msg.key.remoteJid) return null;

    const messageContent = msg.message;
    if (!messageContent) return null;

    const contentType = getContentType(messageContent);
    if (!contentType) return null;

    let content: string | null = null;
    let messageType: MessageType = 'text';
    const mediaUrl: string | undefined = undefined;
    let mediaMimeType: string | undefined;
    let mediaFilename: string | undefined;
    let mediaSize: number | undefined;

    switch (contentType) {
      case 'conversation':
        content = messageContent.conversation || null;
        messageType = 'text';
        break;
      case 'extendedTextMessage':
        content = messageContent.extendedTextMessage?.text || null;
        messageType = 'text';
        break;
      case 'imageMessage':
        content = messageContent.imageMessage?.caption || null;
        messageType = 'image';
        mediaMimeType = messageContent.imageMessage?.mimetype || undefined;
        mediaSize = messageContent.imageMessage?.fileLength
          ? Number(messageContent.imageMessage.fileLength)
          : undefined;
        break;
      case 'videoMessage':
        content = messageContent.videoMessage?.caption || null;
        messageType = 'video';
        mediaMimeType = messageContent.videoMessage?.mimetype || undefined;
        mediaSize = messageContent.videoMessage?.fileLength
          ? Number(messageContent.videoMessage.fileLength)
          : undefined;
        break;
      case 'audioMessage':
        messageType = 'audio';
        mediaMimeType = messageContent.audioMessage?.mimetype || undefined;
        mediaSize = messageContent.audioMessage?.fileLength
          ? Number(messageContent.audioMessage.fileLength)
          : undefined;
        break;
      case 'documentMessage':
        content = messageContent.documentMessage?.caption || null;
        messageType = 'document';
        mediaMimeType = messageContent.documentMessage?.mimetype || undefined;
        mediaFilename = messageContent.documentMessage?.fileName || undefined;
        mediaSize = messageContent.documentMessage?.fileLength
          ? Number(messageContent.documentMessage.fileLength)
          : undefined;
        break;
      case 'reactionMessage':
        messageType = 'reaction';
        content = messageContent.reactionMessage?.text || null;
        break;
      default:
        return null;
    }

    const quotedMessage =
      messageContent.extendedTextMessage?.contextInfo?.quotedMessage ||
      messageContent.imageMessage?.contextInfo?.quotedMessage ||
      messageContent.videoMessage?.contextInfo?.quotedMessage;

    const quotedMessageId =
      messageContent.extendedTextMessage?.contextInfo?.stanzaId ||
      messageContent.imageMessage?.contextInfo?.stanzaId ||
      messageContent.videoMessage?.contextInfo?.stanzaId ||
      null;

    return {
      id: msg.key.id,
      chatJid: msg.key.remoteJid,
      senderJid: msg.key.participant || msg.key.remoteJid,
      content,
      timestamp: new Date((msg.messageTimestamp as number) * 1000),
      isFromMe: msg.key.fromMe || false,
      isForwarded: Boolean(
        messageContent.extendedTextMessage?.contextInfo?.isForwarded ||
          messageContent.imageMessage?.contextInfo?.isForwarded
      ),
      quotedMessageId,
      messageType,
      mediaUrl,
      mediaMimeType,
      mediaFilename,
      mediaSize,
    };
  }

  /**
   * Get info about history sync status.
   *
   * Note: Historical messages are synced automatically when syncFullHistory is enabled.
   * This happens during the initial connection and when WhatsApp sends history data.
   * There's no manual API to trigger on-demand sync for specific chats.
   */
  async syncChatHistory(
    chatJid: string,
    limit: number = 50
  ): Promise<{ count: number; success: boolean; error?: string }> {
    this.ensureConnected();

    if (!this.socket) {
      return { count: 0, success: false, error: 'Socket not available' };
    }

    // Baileys automatically syncs history when syncFullHistory: true is set
    // The syncing happens via WhatsApp's protocol during connection
    return {
      count: 0,
      success: true,
      error: undefined,
    };
  }

  /**
   * Get the underlying WASocket for advanced operations.
   * Use with caution - direct socket access bypasses our abstractions.
   */
  getSocket(): WASocket | null {
    return this.socket;
  }

  private convertGroupMetadata(metadata: BaileysGroupMetadata): GroupMetadata {
    return {
      jid: metadata.id,
      subject: metadata.subject,
      description: metadata.desc,
      owner: metadata.owner,
      creation: metadata.creation,
      participants: metadata.participants.map((p) => ({
        jid: p.id,
        isAdmin: p.admin === 'admin' || p.admin === 'superadmin',
        isSuperAdmin: p.admin === 'superadmin',
      })),
      ephemeralDuration: metadata.ephemeralDuration,
      announce: metadata.announce,
      restrict: metadata.restrict,
    };
  }

  private emitConnectionUpdate(): void {
    this.emit('connection.update', { ...this.connectionState });
  }

  private ensureConnected(): void {
    if (!this.socket || !this.connectionState.isConnected) {
      throw new Error('Not connected to WhatsApp');
    }
  }
}
