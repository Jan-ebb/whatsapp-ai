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
    {
      name: 'semantic_search',
      description:
        'Search messages by meaning using AI embeddings. Finds semantically similar messages even without exact keyword matches. Requires Ollama running locally.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'Natural language query describing what you\'re looking for (e.g., "messages where someone seemed frustrated" or "discussions about deadlines")',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results (default: 10, max: 50)',
            default: 10,
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'hybrid_search',
      description:
        'Combined keyword and semantic search for best results. Uses both exact text matching (FTS5) and meaning-based search (embeddings). Recommended for most searches.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query - will match both keywords and meaning',
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
        },
        required: ['query'],
      },
    },
    {
      name: 'get_embedding_status',
      description: 'Check the status of message embeddings for semantic search.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'embed_historical_messages',
      description:
        'Generate embeddings for historical messages that haven\'t been embedded yet. Run this to enable semantic search on older messages.',
      inputSchema: {
        type: 'object',
        properties: {
          batch_size: {
            type: 'number',
            description: 'Number of messages to embed in this batch (default: 100, max: 500)',
            default: 100,
          },
        },
      },
    },
  ];
}

export async function handleChatTool(
  name: string,
  args: Record<string, unknown>,
  context: ServerContext
): Promise<unknown> {
  const { whatsapp, chats, messages, contacts, vectors, embeddings, config } = context;

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

    case 'semantic_search': {
      const query = args.query as string;
      const requestedLimit = (args.limit as number) || 10;

      const { limit } = validateQueryLimits(
        requestedLimit,
        config.maxMessagesPerQuery,
        'messages'
      );

      // Check if semantic search is available
      if (!vectors.isInitialized()) {
        throw new Error(
          'Semantic search not available. Vector store not initialized. Make sure Ollama is running.'
        );
      }

      const isAvailable = await embeddings.checkAvailability();
      if (!isAvailable) {
        throw new Error(
          `Semantic search not available. Ollama not running or model '${embeddings.getModel()}' not installed. Run: ollama pull ${embeddings.getModel()}`
        );
      }

      // Embed the query
      const queryEmbedding = await embeddings.embed(query);
      if (!queryEmbedding) {
        throw new Error('Failed to generate query embedding');
      }

      // Search for similar messages
      const vectorResults = vectors.search(queryEmbedding, limit);

      // Fetch full message details
      const results = vectorResults
        .map((vr) => {
          const msg = messages.getById(vr.messageId);
          if (!msg) return null;
          return {
            message: {
              id: msg.id,
              chat_jid: msg.chatJid,
              content: msg.content,
              sender_jid: msg.senderJid,
              timestamp: msg.timestamp,
              is_from_me: msg.isFromMe,
            },
            similarity_score: 1 - vr.distance, // Convert distance to similarity
          };
        })
        .filter((r) => r !== null);

      return {
        results,
        count: results.length,
        query,
        search_type: 'semantic',
      };
    }

    case 'hybrid_search': {
      const query = args.query as string;
      const chatJid = args.chat_jid as string | undefined;
      const requestedLimit = (args.limit as number) || 20;

      const { limit } = validateQueryLimits(
        requestedLimit,
        config.maxMessagesPerQuery,
        'messages'
      );

      // Get keyword search results
      const keywordResults = messages.search(query, { chatJid, limit, offset: 0 });
      const keywordIds = new Set(keywordResults.map((r) => r.message.id));

      // Try semantic search if available
      let semanticResults: Array<{ messageId: string; score: number }> = [];
      
      if (vectors.isInitialized() && (await embeddings.checkAvailability())) {
        const queryEmbedding = await embeddings.embed(query);
        if (queryEmbedding) {
          const vectorResults = vectors.search(queryEmbedding, limit);
          semanticResults = vectorResults.map((vr) => ({
            messageId: vr.messageId,
            score: 1 - vr.distance,
          }));
        }
      }

      // Combine and deduplicate results
      const combinedScores = new Map<string, { keyword: number; semantic: number }>();

      // Add keyword results with normalized scores
      keywordResults.forEach((r, index) => {
        const normalizedScore = 1 - index / keywordResults.length;
        combinedScores.set(r.message.id, {
          keyword: normalizedScore,
          semantic: 0,
        });
      });

      // Add semantic results
      semanticResults.forEach((r) => {
        const existing = combinedScores.get(r.messageId);
        if (existing) {
          existing.semantic = r.score;
        } else {
          combinedScores.set(r.messageId, {
            keyword: 0,
            semantic: r.score,
          });
        }
      });

      // Calculate combined score (weighted average)
      const rankedResults = Array.from(combinedScores.entries())
        .map(([id, scores]) => ({
          id,
          // Weight keyword matches slightly higher for exact matches
          combinedScore: scores.keyword * 0.6 + scores.semantic * 0.4,
          keywordScore: scores.keyword,
          semanticScore: scores.semantic,
        }))
        .sort((a, b) => b.combinedScore - a.combinedScore)
        .slice(0, limit);

      // Fetch full message details
      const results = rankedResults
        .map((r) => {
          const msg = messages.getById(r.id);
          if (!msg) return null;

          // Filter by chat if specified
          if (chatJid && msg.chatJid !== chatJid) return null;

          return {
            message: {
              id: msg.id,
              chat_jid: msg.chatJid,
              content: msg.content,
              sender_jid: msg.senderJid,
              timestamp: msg.timestamp,
              is_from_me: msg.isFromMe,
            },
            scores: {
              combined: r.combinedScore,
              keyword: r.keywordScore,
              semantic: r.semanticScore,
            },
          };
        })
        .filter((r) => r !== null);

      return {
        results,
        count: results.length,
        query,
        search_type: 'hybrid',
        semantic_available: vectors.isInitialized(),
      };
    }

    case 'get_embedding_status': {
      const isVectorStoreReady = vectors.isInitialized();
      const isOllamaAvailable = await embeddings.checkAvailability();

      let embeddedCount = 0;
      let unembeddedCount = 0;

      if (isVectorStoreReady) {
        embeddedCount = vectors.getEmbeddedCount();
        unembeddedCount = vectors.getUnembeddedCount();
      }

      return {
        status: isVectorStoreReady && isOllamaAvailable ? 'ready' : 'unavailable',
        vector_store_initialized: isVectorStoreReady,
        ollama_available: isOllamaAvailable,
        embedding_model: embeddings.getModel(),
        messages_embedded: embeddedCount,
        messages_pending: unembeddedCount,
        total_messages: embeddedCount + unembeddedCount,
        coverage_percent:
          embeddedCount + unembeddedCount > 0
            ? Math.round((embeddedCount / (embeddedCount + unembeddedCount)) * 100)
            : 0,
      };
    }

    case 'embed_historical_messages': {
      const batchSize = Math.min((args.batch_size as number) || 100, 500);

      if (!vectors.isInitialized()) {
        throw new Error('Vector store not initialized. Make sure Ollama is running.');
      }

      const isAvailable = await embeddings.checkAvailability();
      if (!isAvailable) {
        throw new Error(
          `Ollama not available or model '${embeddings.getModel()}' not installed. Run: ollama pull ${embeddings.getModel()}`
        );
      }

      // Get unembedded message IDs
      const unembeddedIds = vectors.getUnembeddedMessageIds(batchSize);

      if (unembeddedIds.length === 0) {
        return {
          success: true,
          embedded_count: 0,
          message: 'All messages are already embedded',
        };
      }

      // Fetch message contents
      const messagesToEmbed = unembeddedIds
        .map((id) => {
          const msg = messages.getById(id);
          return msg ? { id: msg.id, content: msg.content || '' } : null;
        })
        .filter((m) => m !== null && m.content) as Array<{ id: string; content: string }>;

      // Generate embeddings in batch
      const contents = messagesToEmbed.map((m) => m.content);
      const embeddingResults = await embeddings.embedBatch(contents);

      // Store embeddings
      const successfulEmbeddings: Array<{ messageId: string; embedding: number[] }> = [];

      embeddingResults.forEach((embedding, index) => {
        if (embedding) {
          successfulEmbeddings.push({
            messageId: messagesToEmbed[index].id,
            embedding,
          });
        }
      });

      if (successfulEmbeddings.length > 0) {
        vectors.upsertBatch(successfulEmbeddings, embeddings.getModel());
      }

      const remainingCount = vectors.getUnembeddedCount();

      return {
        success: true,
        embedded_count: successfulEmbeddings.length,
        failed_count: messagesToEmbed.length - successfulEmbeddings.length,
        remaining_count: remainingCount,
        message:
          remainingCount > 0
            ? `Embedded ${successfulEmbeddings.length} messages. ${remainingCount} remaining. Run again to continue.`
            : `Embedded ${successfulEmbeddings.length} messages. All messages are now embedded.`,
      };
    }

    default:
      throw new Error(`Unknown chat tool: ${name}`);
  }
}
