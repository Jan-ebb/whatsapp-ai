import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ServerContext } from '../server.js';
import { validateQueryLimits } from '../security/index.js';
import { phoneNumberToJid } from '../utils/formatting.js';

export function createContactTools(): Tool[] {
  return [
    {
      name: 'search_contacts',
      description: 'Search contacts by name or phone number.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search term to match against contact names or phone numbers',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of contacts to return (default: 20, max: 50)',
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
      name: 'get_contact',
      description: 'Get details about a specific contact.',
      inputSchema: {
        type: 'object',
        properties: {
          identifier: {
            type: 'string',
            description: 'Contact JID or phone number',
          },
        },
        required: ['identifier'],
      },
    },
    {
      name: 'get_profile_picture',
      description: 'Get the profile picture URL for a contact or group.',
      inputSchema: {
        type: 'object',
        properties: {
          jid: {
            type: 'string',
            description: 'Contact or group JID',
          },
        },
        required: ['jid'],
      },
    },
  ];
}

export async function handleContactTool(
  name: string,
  args: Record<string, unknown>,
  context: ServerContext
): Promise<unknown> {
  const { whatsapp, contacts, chats, messages, config } = context;

  switch (name) {
    case 'search_contacts': {
      const query = args.query as string;
      const requestedLimit = (args.limit as number) || 20;
      const offset = (args.offset as number) || 0;

      const { limit } = validateQueryLimits(requestedLimit, 50, 'contacts');

      const contactList = contacts.search(query, { limit, offset });

      return {
        contacts: contactList.map((contact) => ({
          jid: contact.jid,
          phone_number: contact.phoneNumber,
          name: contact.name,
          push_name: contact.pushName,
          is_business: contact.isBusiness,
        })),
        count: contactList.length,
        offset,
        has_more: contactList.length === limit,
      };
    }

    case 'get_contact': {
      const identifier = args.identifier as string;

      // Try to find by JID first, then by phone number
      let contact = contacts.getByJid(identifier);

      if (!contact) {
        contact = contacts.getByPhoneNumber(identifier);
      }

      if (!contact) {
        // Try constructing a JID from the identifier
        const jid = phoneNumberToJid(identifier);
        contact = contacts.getByJid(jid);
      }

      if (!contact) {
        throw new Error(`Contact not found: ${identifier}`);
      }

      // Get chat with this contact if exists
      const chat = chats.getByJid(contact.jid);

      // Get last interaction
      const recentMessages = messages.getByChatJid(contact.jid, { limit: 1 });
      const lastMessage = recentMessages[0];

      return {
        jid: contact.jid,
        phone_number: contact.phoneNumber,
        name: contact.name,
        push_name: contact.pushName,
        profile_picture_url: contact.profilePictureUrl,
        is_business: contact.isBusiness,
        chat: chat
          ? {
              is_archived: chat.isArchived,
              is_pinned: chat.isPinned,
              is_muted: chat.isMuted,
              unread_count: chat.unreadCount,
            }
          : null,
        last_message: lastMessage
          ? {
              content: lastMessage.content,
              timestamp: lastMessage.timestamp,
              is_from_me: lastMessage.isFromMe,
            }
          : null,
      };
    }

    case 'get_profile_picture': {
      const jid = args.jid as string;

      const url = await whatsapp.getProfilePicture(jid);

      // Update in database
      if (url) {
        contacts.updateProfilePicture(jid, url);
      }

      return {
        jid,
        profile_picture_url: url,
        has_picture: url !== null,
      };
    }

    default:
      throw new Error(`Unknown contact tool: ${name}`);
  }
}
