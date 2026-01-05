export interface Contact {
  jid: string;
  phoneNumber: string | null;
  name: string | null;
  pushName: string | null;
  profilePictureUrl: string | null;
  isBusiness: boolean;
  updatedAt: string;
}

export interface Chat {
  jid: string;
  name: string | null;
  isGroup: boolean;
  isArchived: boolean;
  isPinned: boolean;
  isMuted: boolean;
  muteUntil: string | null;
  unreadCount: number;
  lastMessageTime: string | null;
  updatedAt: string;
}

export interface GroupParticipant {
  groupJid: string;
  participantJid: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
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
  mediaSize: number | null;
  mediaDownloaded: boolean;
  mediaLocalPath: string | null;
  reactions: string | null; // JSON string of reactions
  updatedAt: string;
}

export interface ScheduledMessage {
  id: string;
  chatJid: string;
  content: string;
  mediaPath: string | null;
  scheduledTime: string;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  createdAt: string;
}

export interface MessageSearchResult {
  message: Message;
  rank: number;
  snippet: string;
}
