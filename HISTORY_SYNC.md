# Historical Message Syncing

## Overview

The WhatsApp MCP server now supports historical message syncing! This means when you connect for the first time or reconnect, the server will automatically fetch your message history from WhatsApp.

## Configuration

You can control how much history to sync using the `WHATSAPP_HISTORY_SYNC_DAYS` environment variable in your `.env` file:

```bash
# Sync last year of messages
WHATSAPP_HISTORY_SYNC_DAYS=365

# Sync last 3 months
WHATSAPP_HISTORY_SYNC_DAYS=90

# Sync last month
WHATSAPP_HISTORY_SYNC_DAYS=30

# Disable history sync (only new messages)
WHATSAPP_HISTORY_SYNC_DAYS=0

# Leave unset for WhatsApp's default (full available history)
# WHATSAPP_HISTORY_SYNC_DAYS=
```

## How It Works

### Automatic Sync

Historical messages are synced automatically when:
1. You first scan the QR code and authenticate
2. The server reconnects after being offline
3. WhatsApp sends history data through its protocol

This is controlled by the `syncFullHistory` setting in the Baileys connection configuration (src/whatsapp/client.ts:121).

### What Gets Synced

When `syncFullHistory` is enabled, WhatsApp will send:
- Recent message history across all your chats
- Chat metadata (names, participants, etc.)
- Contact information
- Group information

The amount of history synced depends on:
- WhatsApp's protocol limitations
- Your account's message history
- The connection speed and stability

### Important Notes

1. **First-time sync**: The first time you authenticate, the sync may take several minutes depending on how many messages you have

2. **Incremental updates**: After the initial sync, only new messages are added

3. **Database storage**: All synced messages are stored in the local SQLite database (`store/whatsapp.db`)

4. **No manual trigger**: Unlike some messaging systems, WhatsApp's protocol doesn't allow manually triggering historical syncs for specific chats

## CLI Usage

After the sync completes, you can access your historical messages using the CLI:

```bash
# View messages from a contact
npm run cli messages "Contact Name"

# List all chats
npm run cli chats

# Search contacts
npm run cli contacts
```

## MCP Tool

The `sync_chat_history` MCP tool is available but returns immediately since syncing happens automatically:

```json
{
  "name": "sync_chat_history",
  "parameters": {
    "chat_jid": "1234567890@s.whatsapp.net",
    "limit": 50
  }
}
```

## Technical Details

### Code Changes

1. **src/whatsapp/client.ts**
   - Changed `syncFullHistory: false` to `syncFullHistory: true` (line 117)
   - Added `syncChatHistory()` method for API compatibility

2. **src/tools/utility.ts**
   - Added `sync_chat_history` tool definition
   - Added handler for the tool

3. **src/server.ts**
   - Added `sync_chat_history` to UTILITY_TOOLS set

### Event Handling

Messages are synced through Baileys' event system:
- `messages.upsert` event receives historical messages
- Events are handled in `setupEventHandlers()` (src/whatsapp/client.ts:625+)
- Messages are automatically stored in the database via the server's event listeners (src/server.ts:246-268)

## Troubleshooting

### No messages appear after authentication

1. **Wait longer**: Initial sync can take several minutes
2. **Check connection**: Ensure the server shows "Connected to WhatsApp"
3. **Query the database**:
   ```bash
   sqlite3 store/whatsapp.db "SELECT COUNT(*) FROM messages;"
   ```

### Only recent messages appear

This is normal behavior. WhatsApp limits the amount of history synced based on:
- Your account type
- The age of messages
- Protocol limitations

### Messages from specific contacts missing

The sync prioritizes:
1. Recent chats
2. Chats with recent activity
3. Pinned chats

Older, inactive chats may not be included in the initial sync.

## Comparison: Before vs After

### Before
- Only NEW messages received while server was running were stored
- Database was empty on first start
- Had to wait for contacts to send new messages

### After
- Historical messages are automatically synced
- Database populated on first connection
- Can immediately view message history from the CLI
- All your recent conversations are available

## Future Enhancements

Potential improvements for the future:
1. Add progress tracking for initial sync
2. Expose sync status via MCP tool
3. Add configuration option for sync depth
4. Implement selective chat history fetch (if WhatsApp protocol adds support)
