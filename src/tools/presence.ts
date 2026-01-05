import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ServerContext } from '../server.js';
import { phoneNumberToJid, isGroupJid } from '../utils/formatting.js';

export function createPresenceTools(): Tool[] {
  return [
    {
      name: 'get_presence',
      description:
        'Subscribe to and get the online presence status of a contact. Note: presence updates are received asynchronously.',
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
      name: 'send_typing',
      description: 'Send a typing indicator to a chat.',
      inputSchema: {
        type: 'object',
        properties: {
          chat_jid: {
            type: 'string',
            description: 'The JID of the chat',
          },
          typing: {
            type: 'boolean',
            description: 'True to show typing, false to stop',
            default: true,
          },
        },
        required: ['chat_jid'],
      },
    },
  ];
}

export async function handlePresenceTool(
  name: string,
  args: Record<string, unknown>,
  context: ServerContext
): Promise<unknown> {
  const { whatsapp } = context;

  switch (name) {
    case 'get_presence': {
      const identifier = args.identifier as string;

      // Convert to JID if needed
      const jid = identifier.includes('@') ? identifier : phoneNumberToJid(identifier);

      // Subscribe to presence updates
      await whatsapp.subscribePresence(jid);

      return {
        success: true,
        jid,
        message:
          'Subscribed to presence updates. Presence information will be available when the contact comes online or updates their status.',
      };
    }

    case 'send_typing': {
      const chatJid = args.chat_jid as string;
      const typing = args.typing !== false; // Default to true

      await whatsapp.sendTyping(chatJid, typing);

      return {
        success: true,
        chat_jid: chatJid,
        typing,
      };
    }

    default:
      throw new Error(`Unknown presence tool: ${name}`);
  }
}
