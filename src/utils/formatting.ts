import type { Message, Chat, Contact } from '../storage/types.js';

/**
 * Format a JID to a readable phone number.
 */
export function jidToPhoneNumber(jid: string): string {
  if (!jid) return '';
  return jid.split('@')[0].replace(/[^0-9]/g, '');
}

/**
 * Format a phone number to a JID.
 */
export function phoneNumberToJid(phoneNumber: string): string {
  const cleaned = phoneNumber.replace(/[^0-9]/g, '');
  return `${cleaned}@s.whatsapp.net`;
}

/**
 * Check if a JID is a group.
 */
export function isGroupJid(jid: string): boolean {
  return jid.endsWith('@g.us');
}

/**
 * Format a message for display.
 */
export function formatMessage(message: Message, contactName?: string): string {
  const timestamp = new Date(message.timestamp).toLocaleString();
  const sender = message.isFromMe ? 'You' : (contactName || jidToPhoneNumber(message.senderJid || ''));
  
  let content = message.content || '';
  if (message.mediaType) {
    content = `[${message.mediaType}]${content ? ` ${content}` : ''}`;
  }
  if (message.isDeleted) {
    content = '[Message deleted]';
  }

  return `[${timestamp}] ${sender}: ${content}`;
}

/**
 * Format a chat for display.
 */
export function formatChat(chat: Chat): string {
  const name = chat.name || jidToPhoneNumber(chat.jid);
  const type = chat.isGroup ? 'Group' : 'Chat';
  const status = [
    chat.isPinned ? 'Pinned' : null,
    chat.isArchived ? 'Archived' : null,
    chat.isMuted ? 'Muted' : null,
  ].filter(Boolean).join(', ');

  return `${name} (${type})${status ? ` [${status}]` : ''}`;
}

/**
 * Format a contact for display.
 */
export function formatContact(contact: Contact): string {
  const name = contact.name || contact.pushName || jidToPhoneNumber(contact.jid);
  const phone = contact.phoneNumber || jidToPhoneNumber(contact.jid);
  return `${name} (${phone})`;
}

/**
 * Truncate text to a maximum length.
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Sanitize output to prevent sensitive data leakage.
 * Removes or masks potentially sensitive patterns.
 */
export function sanitizeForLogging(text: string): string {
  // Mask phone numbers (keep first 3 and last 2 digits)
  return text.replace(/\b(\d{3})\d{4,}(\d{2})\b/g, '$1****$2');
}
