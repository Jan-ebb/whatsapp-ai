export interface SecurityConfig {
  // Encryption
  requirePassphrase: boolean;

  // Operation controls
  requireConfirmation: boolean;
  maxMessagesPerQuery: number;
  maxChatsPerQuery: number;
  rateLimitPerMinute: number;

  // Session
  idleTimeoutMinutes: number;

  // Logging - message content logging is hardcoded to false
  logLevel: 'none' | 'errors' | 'operations';

  // History sync
  historySyncDays?: number;
}

export const defaultSecurityConfig: SecurityConfig = {
  requirePassphrase: true,
  requireConfirmation: true,
  maxMessagesPerQuery: 50,
  maxChatsPerQuery: 100,
  rateLimitPerMinute: 60,
  idleTimeoutMinutes: 30,
  logLevel: 'errors',
};

// Operations that require explicit confirmation
export const CONFIRMATION_REQUIRED_OPERATIONS = new Set([
  'send_message',
  'send_media',
  'reply_to_message',
  'forward_message',
  'react_to_message',
  'delete_message',
  'edit_message',
  'star_message',
  'create_group',
  'add_participants',
  'remove_participants',
]);
