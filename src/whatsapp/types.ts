export interface WhatsAppConfig {
  storePath: string;
  printQRInTerminal: boolean;
  logLevel: 'silent' | 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  /**
   * Number of days of message history to sync (e.g., 90 for last 3 months, 365 for last year)
   * Set to 0 to disable history sync, or undefined for WhatsApp's default
   */
  historySyncDays?: number;
}

export interface ConnectionState {
  isConnected: boolean;
  isConnecting: boolean;
  qrCode: string | null;
  lastDisconnect: {
    reason: string;
    date: Date;
  } | null;
}

export interface SendMessageOptions {
  quotedMessageId?: string;
}

export interface SendMediaOptions extends SendMessageOptions {
  caption?: string;
  filename?: string;
  mimetype?: string;
}

export interface PresenceState {
  jid: string;
  presence: 'available' | 'unavailable' | 'composing' | 'recording' | 'paused';
  lastSeen?: Date;
}

export interface GroupMetadata {
  jid: string;
  subject: string;
  description?: string;
  owner?: string;
  creation?: number;
  participants: GroupParticipant[];
  ephemeralDuration?: number;
  announce?: boolean;
  restrict?: boolean;
}

export interface GroupParticipant {
  jid: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'reaction';

export interface IncomingMessage {
  id: string;
  chatJid: string;
  senderJid: string;
  content: string | null;
  timestamp: Date;
  isFromMe: boolean;
  isForwarded: boolean;
  quotedMessageId: string | null;
  messageType: MessageType;
  mediaUrl?: string;
  mediaMimeType?: string;
  mediaFilename?: string;
  mediaSize?: number;
}
