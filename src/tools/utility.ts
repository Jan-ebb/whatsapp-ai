import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ServerContext } from '../server.js';
import { phoneNumberToJid, isGroupJid } from '../utils/formatting.js';

export function createUtilityTools(): Tool[] {
  return [
    {
      name: 'get_connection_status',
      description: 'Get the current WhatsApp connection status.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'logout',
      description:
        'Logout from WhatsApp and clear all credentials. This will require re-scanning the QR code.',
      inputSchema: {
        type: 'object',
        properties: {
          confirm: {
            type: 'boolean',
            description: 'Must be true to confirm logout',
          },
        },
        required: ['confirm'],
      },
    },
    {
      name: 'schedule_message',
      description: 'Schedule a message to be sent at a future time.',
      inputSchema: {
        type: 'object',
        properties: {
          recipient: {
            type: 'string',
            description: 'Phone number or group JID',
          },
          message: {
            type: 'string',
            description: 'The message text to send',
          },
          scheduled_time: {
            type: 'string',
            description: 'ISO 8601 timestamp for when to send the message',
          },
          confirm: {
            type: 'boolean',
            description: 'Must be true to confirm scheduling',
          },
        },
        required: ['recipient', 'message', 'scheduled_time', 'confirm'],
      },
    },
    {
      name: 'cancel_scheduled',
      description: 'Cancel a scheduled message.',
      inputSchema: {
        type: 'object',
        properties: {
          message_id: {
            type: 'string',
            description: 'The ID of the scheduled message to cancel',
          },
        },
        required: ['message_id'],
      },
    },
    {
      name: 'list_scheduled',
      description: 'List all pending scheduled messages.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Maximum number of messages to return',
            default: 20,
          },
        },
      },
    },
  ];
}

export async function handleUtilityTool(
  name: string,
  args: Record<string, unknown>,
  context: ServerContext
): Promise<unknown> {
  const { whatsapp, scheduler, session, rateLimiter } = context;

  switch (name) {
    case 'get_connection_status': {
      const state = whatsapp.getConnectionState();
      const ownJid = whatsapp.getOwnJid();

      return {
        connected: state.isConnected,
        connecting: state.isConnecting,
        has_qr_code: state.qrCode !== null,
        own_jid: ownJid,
        last_disconnect: state.lastDisconnect
          ? {
              reason: state.lastDisconnect.reason,
              date: state.lastDisconnect.date.toISOString(),
            }
          : null,
        session: {
          idle_time_seconds: Math.floor(session.getIdleTime() / 1000),
          is_locked: session.isLocked(),
        },
        rate_limit: {
          remaining_requests: rateLimiter.getRemainingRequests(),
          reset_in_seconds: Math.ceil(rateLimiter.getTimeUntilReset() / 1000),
        },
      };
    }

    case 'logout': {
      if (args.confirm !== true) {
        throw new Error('Logout requires confirm: true');
      }

      await whatsapp.logout();
      session.lock();

      return {
        success: true,
        message: 'Logged out successfully. Credentials have been cleared.',
      };
    }

    case 'schedule_message': {
      const recipient = args.recipient as string;
      const message = args.message as string;
      const scheduledTimeStr = args.scheduled_time as string;

      const scheduledTime = new Date(scheduledTimeStr);
      if (isNaN(scheduledTime.getTime())) {
        throw new Error('Invalid scheduled_time format. Use ISO 8601 format.');
      }

      if (scheduledTime <= new Date()) {
        throw new Error('scheduled_time must be in the future');
      }

      const jid = isGroupJid(recipient) ? recipient : phoneNumberToJid(recipient);

      const scheduled = scheduler.schedule(jid, message, scheduledTime);

      return {
        success: true,
        scheduled_message: {
          id: scheduled.id,
          chat_jid: scheduled.chatJid,
          content: scheduled.content,
          scheduled_time: scheduled.scheduledTime,
          status: scheduled.status,
        },
      };
    }

    case 'cancel_scheduled': {
      const messageId = args.message_id as string;

      const cancelled = scheduler.cancel(messageId);

      if (!cancelled) {
        throw new Error(
          'Could not cancel message. It may have already been sent or does not exist.'
        );
      }

      return {
        success: true,
        message_id: messageId,
        message: 'Scheduled message cancelled',
      };
    }

    case 'list_scheduled': {
      const limit = (args.limit as number) || 20;

      const pending = scheduler.getPending().slice(0, limit);

      return {
        scheduled_messages: pending.map((msg) => ({
          id: msg.id,
          chat_jid: msg.chatJid,
          content: msg.content,
          scheduled_time: msg.scheduledTime,
          status: msg.status,
          created_at: msg.createdAt,
        })),
        count: pending.length,
      };
    }

    default:
      throw new Error(`Unknown utility tool: ${name}`);
  }
}
