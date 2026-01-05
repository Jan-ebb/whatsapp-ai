import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ServerContext } from '../server.js';
import { validateQueryLimits } from '../security/index.js';
import { formatMessage, formatChat } from '../utils/formatting.js';

export function createChatTools(): Tool[] {
  return [
    {
      name: 'list_chats',
      description: 'List WhatsApp chats with optional filters.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Optional search term to filter chats by name',
          },
          archived: {
            type: 'boolean',
            description: 'Filter by archived status',
          },
          pinned: {
            type: 'boolean',
            description: 'Filter by pinned status',
          },
          groups_only: {
            type: 'boolean',
            description: 'Only show group chats',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of chats to return (default: 20, max: 100)',
            default: 20,
          },
          offset: {
            type: 'number',
            description: 'Offset for pagination',
            default: 0,
          },
        },
      },
    },
    {
      name: 'get_chat',
      description: 'Get details about a specific chat.',
      inputSchema: {
        type: 'object',
        properties: {
          chat_jid: {
            type: 'string',
            description: 'The JID of the chat to retrieve',
          },
        },
        required: ['chat_jid'],
      },
    },
    {
      name: 'get_messages',
      description: 'Get messages from a chat with pagination.',
      inputSchema: {
        type: 'object',
        properties: {
          chat_jid: {
            type: 'string',
            description: 'The JID of the chat',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of messages to return (default: 20, max: 50)',
            default: 20,
          },
          offset: {
            type: 'number',
            description: 'Offset for pagination',
            default: 0,
          },
          before: {
            type: 'string',
            description: 'Only return messages before this ISO timestamp',
          },
          after: {
            type: 'string',
            description: 'Only return messages after this ISO timestamp',
          },
        },
        required: ['chat_jid'],
      },
    },
    {
      name: 'search_messages',
      description: 'Full-text search across messages.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query text',
          },
          chat_jid: {
            type: 'string',
            description: 'Optional: limit search to a specific chat',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results (default: 20, max: 50)',
            default: 20,
          },
          offset: {
            type: 'number',
            description: 'Offset for pagination',
            default: 0,
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'mark_as_read',
      description: 'Mark a chat as read.',
      inputSchema: {
        type: 'object',
        properties: {
          chat_jid: {
            type: 'string',
            description: 'The JID of the chat to mark as read',
          },
        },
        required: ['chat_jid'],
      },
    },
    {
      name: 'archive_chat',
      description: 'Archive or unarchive a chat.',
      inputSchema: {
        type: 'object',
        properties: {
          chat_jid: {
            type: 'string',
            description: 'The JID of the chat',
          },
          archive: {
            type: 'boolean',
            description: 'True to archive, false to unarchive',
          },
        },
        required: ['chat_jid', 'archive'],
      },
    },
    {
      name: 'pin_chat',
      description: 'Pin or unpin a chat.',
      inputSchema: {
        type: 'object',
        properties: {
          chat_jid: {
            type: 'string',
            description: 'The JID of the chat',
          },
          pin: {
            type: 'boolean',
            description: 'True to pin, false to unpin',
          },
        },
        required: ['chat_jid', 'pin'],
      },
    },
    {
      name: 'mute_chat',
      description: 'Mute or unmute a chat.',
      inputSchema: {
        type: 'object',
        properties: {
          chat_jid: {
            type: 'string',
            description: 'The JID of the chat',
          },
          mute: {
            type: 'boolean',
            description: 'True to mute, false to unmute',
          },
          duration_seconds: {
            type: 'number',
            description: 'Optional: mute duration in seconds (omit for indefinite)',
          },
        },
        required: ['chat_jid', 'mute'],
      },
    },
  ];
}

export async function handleChatTool(
  name: string,
  args: Record<string, unknown>,
  context: ServerContext
): Promise<unknown> {
  const { whatsapp, chats, messages, contacts, config } = context;

  switch (name) {
    case 'list_chats': {
      const query = args.query as string | undefined;
      const archived = args.archived as boolean | undefined;
      const pinned = args.pinned as boolean | undefined;
      const groupsOnly = args.groups_only as boolean | undefined;
      const requestedLimit = (args.limit as number) || 20;
      const offset = (args.offset as number) || 0;

      const { limit } = validateQueryLimits(requestedLimit, config.maxChatsPerQuery, 'chats');

      const chatList = chats.list({
        query,
        archived,
        pinned,
        groups: groupsOnly,
        limit,
        offset,
      });

      return {
        chats: chatList.map((chat) => ({
          jid: chat.jid,
          name: chat.name,
          is_group: chat.isGroup,
          is_archived: chat.isArchived,
          is_pinned: chat.isPinned,
          is_muted: chat.isMuted,
          unread_count: chat.unreadCount,
          last_message_time: chat.lastMessageTime,
        })),
        count: chatList.length,
        offset,
        has_more: chatList.length === limit,
      };
    }

    case 'get_chat': {
      const chatJid = args.chat_jid as string;

      const chat = chats.getByJid(chatJid);
      if (!chat) {
        throw new Error(`Chat not found: ${chatJid}`);
      }

      // Get recent messages
      const recentMessages = messages.getByChatJid(chatJid, { limit: 5 });

      // Get participants if it's a group
      let participants: unknown[] | undefined;
      if (chat.isGroup) {
        const groupParticipants = chats.getGroupParticipants(chatJid);
        participants = groupParticipants.map((p) => ({
          jid: p.participantJid,
          is_admin: p.isAdmin,
        }));
      }

      return {
        jid: chat.jid,
        name: chat.name,
        is_group: chat.isGroup,
        is_archived: chat.isArchived,
        is_pinned: chat.isPinned,
        is_muted: chat.isMuted,
        mute_until: chat.muteUntil,
        unread_count: chat.unreadCount,
        last_message_time: chat.lastMessageTime,
        participants,
        recent_messages: recentMessages.map((msg) => ({
          id: msg.id,
          content: msg.content,
          sender: msg.senderJid,
          timestamp: msg.timestamp,
          is_from_me: msg.isFromMe,
        })),
      };
    }

    case 'get_messages': {
      const chatJid = args.chat_jid as string;
      const requestedLimit = (args.limit as number) || 20;
      const offset = (args.offset as number) || 0;
      const before = args.before as string | undefined;
      const after = args.after as string | undefined;

      const { limit } = validateQueryLimits(
        requestedLimit,
        config.maxMessagesPerQuery,
        'messages'
      );

      const messageList = messages.getByChatJid(chatJid, {
        limit,
        offset,
        before,
        after,
      });

      return {
        messages: messageList.map((msg) => ({
          id: msg.id,
          content: msg.content,
          sender_jid: msg.senderJid,
          timestamp: msg.timestamp,
          is_from_me: msg.isFromMe,
          is_forwarded: msg.isForwarded,
          is_starred: msg.isStarred,
          is_deleted: msg.isDeleted,
          reply_to_id: msg.replyToId,
          media_type: msg.mediaType,
          reactions: msg.reactions ? JSON.parse(msg.reactions) : null,
        })),
        count: messageList.length,
        offset,
        has_more: messageList.length === limit,
      };
    }

    case 'search_messages': {
      const query = args.query as string;
      const chatJid = args.chat_jid as string | undefined;
      const requestedLimit = (args.limit as number) || 20;
      const offset = (args.offset as number) || 0;

      const { limit } = validateQueryLimits(
        requestedLimit,
        config.maxMessagesPerQuery,
        'messages'
      );

      const results = messages.search(query, { chatJid, limit, offset });

      return {
        results: results.map((r) => ({
          message: {
            id: r.message.id,
            chat_jid: r.message.chatJid,
            content: r.message.content,
            sender_jid: r.message.senderJid,
            timestamp: r.message.timestamp,
            is_from_me: r.message.isFromMe,
          },
          snippet: r.snippet,
          rank: r.rank,
        })),
        count: results.length,
        offset,
        has_more: results.length === limit,
      };
    }

    case 'mark_as_read': {
      const chatJid = args.chat_jid as string;

      await whatsapp.markChatRead(chatJid);
      chats.markAsRead(chatJid);

      return {
        success: true,
        chat_jid: chatJid,
      };
    }

    case 'archive_chat': {
      const chatJid = args.chat_jid as string;
      const archive = args.archive as boolean;

      await whatsapp.archiveChat(chatJid, archive);
      chats.setArchived(chatJid, archive);

      return {
        success: true,
        chat_jid: chatJid,
        archived: archive,
      };
    }

    case 'pin_chat': {
      const chatJid = args.chat_jid as string;
      const pin = args.pin as boolean;

      await whatsapp.pinChat(chatJid, pin);
      chats.setPinned(chatJid, pin);

      return {
        success: true,
        chat_jid: chatJid,
        pinned: pin,
      };
    }

    case 'mute_chat': {
      const chatJid = args.chat_jid as string;
      const mute = args.mute as boolean;
      const durationSeconds = args.duration_seconds as number | undefined;

      await whatsapp.muteChat(chatJid, mute, durationSeconds);

      const muteUntil = mute && durationSeconds
        ? new Date(Date.now() + durationSeconds * 1000).toISOString()
        : undefined;

      chats.setMuted(chatJid, mute, muteUntil);

      return {
        success: true,
        chat_jid: chatJid,
        muted: mute,
        mute_until: muteUntil,
      };
    }

    default:
      throw new Error(`Unknown chat tool: ${name}`);
  }
}
