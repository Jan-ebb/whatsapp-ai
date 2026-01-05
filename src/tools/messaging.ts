import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ServerContext } from '../server.js';
import { phoneNumberToJid, isGroupJid } from '../utils/formatting.js';

export function createMessagingTools(): Tool[] {
  return [
    {
      name: 'send_message',
      description:
        'Send a text message to a contact or group. Requires confirm: true for security.',
      inputSchema: {
        type: 'object',
        properties: {
          recipient: {
            type: 'string',
            description:
              'Phone number with country code (e.g., "1234567890") or group JID (e.g., "123456789@g.us")',
          },
          message: {
            type: 'string',
            description: 'The message text to send',
          },
          confirm: {
            type: 'boolean',
            description: 'Must be true to confirm sending the message',
          },
        },
        required: ['recipient', 'message', 'confirm'],
      },
    },
    {
      name: 'send_media',
      description:
        'Send a media file (image, video, document, audio) to a contact or group. Requires confirm: true.',
      inputSchema: {
        type: 'object',
        properties: {
          recipient: {
            type: 'string',
            description: 'Phone number with country code or group JID',
          },
          media_path: {
            type: 'string',
            description: 'Absolute path to the media file',
          },
          media_type: {
            type: 'string',
            enum: ['image', 'video', 'document', 'audio'],
            description: 'Type of media being sent',
          },
          caption: {
            type: 'string',
            description: 'Optional caption for the media',
          },
          confirm: {
            type: 'boolean',
            description: 'Must be true to confirm sending',
          },
        },
        required: ['recipient', 'media_path', 'media_type', 'confirm'],
      },
    },
    {
      name: 'reply_to_message',
      description: 'Reply to a specific message. Requires confirm: true.',
      inputSchema: {
        type: 'object',
        properties: {
          chat_jid: {
            type: 'string',
            description: 'The chat JID where the message is',
          },
          message_id: {
            type: 'string',
            description: 'The ID of the message to reply to',
          },
          message: {
            type: 'string',
            description: 'The reply message text',
          },
          confirm: {
            type: 'boolean',
            description: 'Must be true to confirm sending',
          },
        },
        required: ['chat_jid', 'message_id', 'message', 'confirm'],
      },
    },
    {
      name: 'forward_message',
      description: 'Forward a message to another chat. Requires confirm: true.',
      inputSchema: {
        type: 'object',
        properties: {
          from_chat_jid: {
            type: 'string',
            description: 'The chat JID where the original message is',
          },
          message_id: {
            type: 'string',
            description: 'The ID of the message to forward',
          },
          to_recipient: {
            type: 'string',
            description: 'Phone number or group JID to forward to',
          },
          confirm: {
            type: 'boolean',
            description: 'Must be true to confirm forwarding',
          },
        },
        required: ['from_chat_jid', 'message_id', 'to_recipient', 'confirm'],
      },
    },
    {
      name: 'react_to_message',
      description: 'Add an emoji reaction to a message. Requires confirm: true.',
      inputSchema: {
        type: 'object',
        properties: {
          chat_jid: {
            type: 'string',
            description: 'The chat JID where the message is',
          },
          message_id: {
            type: 'string',
            description: 'The ID of the message to react to',
          },
          emoji: {
            type: 'string',
            description: 'The emoji to react with (e.g., "👍", "❤️")',
          },
          confirm: {
            type: 'boolean',
            description: 'Must be true to confirm',
          },
        },
        required: ['chat_jid', 'message_id', 'emoji', 'confirm'],
      },
    },
    {
      name: 'delete_message',
      description: 'Delete a message. Requires confirm: true.',
      inputSchema: {
        type: 'object',
        properties: {
          chat_jid: {
            type: 'string',
            description: 'The chat JID where the message is',
          },
          message_id: {
            type: 'string',
            description: 'The ID of the message to delete',
          },
          for_everyone: {
            type: 'boolean',
            description: 'If true, delete for everyone; if false, delete only for me',
            default: false,
          },
          confirm: {
            type: 'boolean',
            description: 'Must be true to confirm deletion',
          },
        },
        required: ['chat_jid', 'message_id', 'confirm'],
      },
    },
    {
      name: 'edit_message',
      description: 'Edit a sent message. Requires confirm: true.',
      inputSchema: {
        type: 'object',
        properties: {
          chat_jid: {
            type: 'string',
            description: 'The chat JID where the message is',
          },
          message_id: {
            type: 'string',
            description: 'The ID of the message to edit',
          },
          new_text: {
            type: 'string',
            description: 'The new message text',
          },
          confirm: {
            type: 'boolean',
            description: 'Must be true to confirm editing',
          },
        },
        required: ['chat_jid', 'message_id', 'new_text', 'confirm'],
      },
    },
    {
      name: 'star_message',
      description: 'Star or unstar a message. Requires confirm: true.',
      inputSchema: {
        type: 'object',
        properties: {
          chat_jid: {
            type: 'string',
            description: 'The chat JID where the message is',
          },
          message_id: {
            type: 'string',
            description: 'The ID of the message to star/unstar',
          },
          star: {
            type: 'boolean',
            description: 'True to star, false to unstar',
          },
          confirm: {
            type: 'boolean',
            description: 'Must be true to confirm',
          },
        },
        required: ['chat_jid', 'message_id', 'star', 'confirm'],
      },
    },
  ];
}

export async function handleMessagingTool(
  name: string,
  args: Record<string, unknown>,
  context: ServerContext
): Promise<unknown> {
  const { whatsapp, messages } = context;

  switch (name) {
    case 'send_message': {
      const recipient = args.recipient as string;
      const message = args.message as string;

      const jid = isGroupJid(recipient) ? recipient : phoneNumberToJid(recipient);
      const result = await whatsapp.sendMessage(jid, message);

      return {
        success: true,
        message_id: result?.key.id,
        timestamp: new Date().toISOString(),
      };
    }

    case 'send_media': {
      const recipient = args.recipient as string;
      const mediaPath = args.media_path as string;
      const mediaType = args.media_type as 'image' | 'video' | 'document' | 'audio';
      const caption = args.caption as string | undefined;

      const jid = isGroupJid(recipient) ? recipient : phoneNumberToJid(recipient);
      const result = await whatsapp.sendMedia(jid, mediaPath, mediaType, { caption });

      return {
        success: true,
        message_id: result?.key.id,
        timestamp: new Date().toISOString(),
      };
    }

    case 'reply_to_message': {
      const chatJid = args.chat_jid as string;
      const messageId = args.message_id as string;
      const message = args.message as string;

      const result = await whatsapp.sendMessage(chatJid, message, {
        quotedMessageId: messageId,
      });

      return {
        success: true,
        message_id: result?.key.id,
        timestamp: new Date().toISOString(),
      };
    }

    case 'forward_message': {
      const fromChatJid = args.from_chat_jid as string;
      const messageId = args.message_id as string;
      const toRecipient = args.to_recipient as string;

      const toJid = isGroupJid(toRecipient) ? toRecipient : phoneNumberToJid(toRecipient);
      const result = await whatsapp.forwardMessage(toJid, messageId, fromChatJid);

      return {
        success: true,
        message_id: result?.key.id,
        timestamp: new Date().toISOString(),
      };
    }

    case 'react_to_message': {
      const chatJid = args.chat_jid as string;
      const messageId = args.message_id as string;
      const emoji = args.emoji as string;

      await whatsapp.reactToMessage(chatJid, messageId, emoji);

      return {
        success: true,
        timestamp: new Date().toISOString(),
      };
    }

    case 'delete_message': {
      const chatJid = args.chat_jid as string;
      const messageId = args.message_id as string;
      const forEveryone = (args.for_everyone as boolean) || false;

      await whatsapp.deleteMessage(chatJid, messageId, forEveryone);

      // Update local database
      messages.markDeleted(messageId);

      return {
        success: true,
        deleted_for: forEveryone ? 'everyone' : 'me',
        timestamp: new Date().toISOString(),
      };
    }

    case 'edit_message': {
      const chatJid = args.chat_jid as string;
      const messageId = args.message_id as string;
      const newText = args.new_text as string;

      await whatsapp.editMessage(chatJid, messageId, newText);

      return {
        success: true,
        timestamp: new Date().toISOString(),
      };
    }

    case 'star_message': {
      const chatJid = args.chat_jid as string;
      const messageId = args.message_id as string;
      const star = args.star as boolean;

      await whatsapp.starMessage(chatJid, messageId, star);

      // Update local database
      messages.setStar(messageId, star);

      return {
        success: true,
        starred: star,
        timestamp: new Date().toISOString(),
      };
    }

    default:
      throw new Error(`Unknown messaging tool: ${name}`);
  }
}
