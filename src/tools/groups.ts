import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ServerContext } from '../server.js';
import { phoneNumberToJid } from '../utils/formatting.js';

export function createGroupTools(): Tool[] {
  return [
    {
      name: 'create_group',
      description: 'Create a new WhatsApp group. Requires confirm: true.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Name of the group',
          },
          participants: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of phone numbers to add to the group',
          },
          confirm: {
            type: 'boolean',
            description: 'Must be true to confirm group creation',
          },
        },
        required: ['name', 'participants', 'confirm'],
      },
    },
    {
      name: 'get_group_info',
      description: 'Get metadata about a group.',
      inputSchema: {
        type: 'object',
        properties: {
          group_jid: {
            type: 'string',
            description: 'The JID of the group',
          },
        },
        required: ['group_jid'],
      },
    },
    {
      name: 'add_participants',
      description: 'Add participants to a group. Requires confirm: true.',
      inputSchema: {
        type: 'object',
        properties: {
          group_jid: {
            type: 'string',
            description: 'The JID of the group',
          },
          participants: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of phone numbers to add',
          },
          confirm: {
            type: 'boolean',
            description: 'Must be true to confirm adding participants',
          },
        },
        required: ['group_jid', 'participants', 'confirm'],
      },
    },
    {
      name: 'remove_participants',
      description: 'Remove participants from a group. Requires confirm: true.',
      inputSchema: {
        type: 'object',
        properties: {
          group_jid: {
            type: 'string',
            description: 'The JID of the group',
          },
          participants: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of phone numbers or JIDs to remove',
          },
          confirm: {
            type: 'boolean',
            description: 'Must be true to confirm removing participants',
          },
        },
        required: ['group_jid', 'participants', 'confirm'],
      },
    },
  ];
}

export async function handleGroupTool(
  name: string,
  args: Record<string, unknown>,
  context: ServerContext
): Promise<unknown> {
  const { whatsapp, chats, contacts } = context;

  switch (name) {
    case 'create_group': {
      const groupName = args.name as string;
      const participants = args.participants as string[];

      // Convert phone numbers to JIDs
      const participantJids = participants.map((p) =>
        p.includes('@') ? p : phoneNumberToJid(p)
      );

      const result = await whatsapp.createGroup(groupName, participantJids);

      // Store group in database
      chats.upsert({
        jid: result.jid,
        name: groupName,
        isGroup: true,
      });

      // Store participants
      const groupParticipants = result.participants
        .filter((p) => p.status === 'added')
        .map((p) => ({
          groupJid: result.jid,
          participantJid: p.jid,
          isAdmin: false,
          isSuperAdmin: false,
        }));

      chats.setGroupParticipants(result.jid, groupParticipants);

      return {
        success: true,
        group_jid: result.jid,
        name: groupName,
        participants: result.participants.map((p) => ({
          jid: p.jid,
          status: p.status,
        })),
      };
    }

    case 'get_group_info': {
      const groupJid = args.group_jid as string;

      const metadata = await whatsapp.getGroupMetadata(groupJid);

      // Update database
      chats.upsert({
        jid: metadata.jid,
        name: metadata.subject,
        isGroup: true,
      });

      const participants = metadata.participants.map((p) => ({
        groupJid: metadata.jid,
        participantJid: p.jid,
        isAdmin: p.isAdmin,
        isSuperAdmin: p.isSuperAdmin,
      }));

      chats.setGroupParticipants(metadata.jid, participants);

      return {
        jid: metadata.jid,
        name: metadata.subject,
        description: metadata.description,
        owner: metadata.owner,
        created_at: metadata.creation
          ? new Date(metadata.creation * 1000).toISOString()
          : null,
        participant_count: metadata.participants.length,
        participants: metadata.participants.map((p) => ({
          jid: p.jid,
          is_admin: p.isAdmin,
          is_super_admin: p.isSuperAdmin,
        })),
        settings: {
          announce: metadata.announce,
          restrict: metadata.restrict,
          ephemeral_duration: metadata.ephemeralDuration,
        },
      };
    }

    case 'add_participants': {
      const groupJid = args.group_jid as string;
      const participants = args.participants as string[];

      // Convert phone numbers to JIDs
      const participantJids = participants.map((p) =>
        p.includes('@') ? p : phoneNumberToJid(p)
      );

      const results = await whatsapp.addGroupParticipants(groupJid, participantJids);

      // Update database for successfully added participants
      for (const result of results) {
        if (result.status === '200' || result.status === 'added') {
          chats.addGroupParticipant(groupJid, result.jid);
        }
      }

      return {
        success: true,
        group_jid: groupJid,
        results: results.map((r) => ({
          jid: r.jid,
          status: r.status,
          added: r.status === '200' || r.status === 'added',
        })),
      };
    }

    case 'remove_participants': {
      const groupJid = args.group_jid as string;
      const participants = args.participants as string[];

      // Convert phone numbers to JIDs
      const participantJids = participants.map((p) =>
        p.includes('@') ? p : phoneNumberToJid(p)
      );

      const results = await whatsapp.removeGroupParticipants(groupJid, participantJids);

      // Update database for successfully removed participants
      for (const result of results) {
        if (result.status === '200' || result.status === 'removed') {
          chats.removeGroupParticipant(groupJid, result.jid);
        }
      }

      return {
        success: true,
        group_jid: groupJid,
        results: results.map((r) => ({
          jid: r.jid,
          status: r.status,
          removed: r.status === '200' || r.status === 'removed',
        })),
      };
    }

    default:
      throw new Error(`Unknown group tool: ${name}`);
  }
}
