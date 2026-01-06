export interface Chat {
  jid: string;
  name: string | null;
  isGroup: boolean;
  unreadCount: number;
  lastMessageTime: string | null;
  isArchived: boolean;
  isPinned: boolean;
  isMuted: boolean;
  profilePictureUrl?: string;
}

export interface Message {
  id: string;
  chatJid: string;
  senderJid: string | null;
  content: string | null;
  timestamp: string;
  isFromMe: boolean;
  isForwarded: boolean;
  isStarred: boolean;
  isDeleted: boolean;
  replyToId: string | null;
  mediaType: string | null;
  mediaUrl: string | null;
  mediaMimeType: string | null;
  mediaFilename: string | null;
  reactions: string | null;
}

export interface Contact {
  jid: string;
  phoneNumber: string | null;
  name: string | null;
  pushName: string | null;
  profilePictureUrl: string | null;
}

export interface ConnectionState {
  connected: boolean;
  connecting: boolean;
  sync?: {
    stage: string;
    progress?: number;
  };
}

export interface SearchResult {
  message: Message;
  score?: number;
}
