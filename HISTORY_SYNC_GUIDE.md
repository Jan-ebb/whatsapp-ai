# History Sync Configuration Guide

## Quick Start

Add this to your `.env` file to control message history syncing:

```bash
# For last year of messages
WHATSAPP_HISTORY_SYNC_DAYS=365
```

## Common Configurations

### Last Year (Recommended)
```bash
WHATSAPP_HISTORY_SYNC_DAYS=365
```
**Best for**: Most users who want recent history without excessive data
**Sync time**: 2-5 minutes
**Database size**: ~50-200 MB (depending on message volume)

### Last 3 Months
```bash
WHATSAPP_HISTORY_SYNC_DAYS=90
```
**Best for**: Users with limited storage or faster sync
**Sync time**: 1-2 minutes
**Database size**: ~20-80 MB

### Last Month
```bash
WHATSAPP_HISTORY_SYNC_DAYS=30
```
**Best for**: Testing or very limited storage
**Sync time**: 30-60 seconds
**Database size**: ~10-30 MB

### Full History (Default)
```bash
# Leave unset or comment out
# WHATSAPP_HISTORY_SYNC_DAYS=
```
**Best for**: Users who want all available history
**Sync time**: 5-15+ minutes
**Database size**: 200 MB - 1+ GB
**Note**: WhatsApp limits this to what's available on their servers

### Disable History Sync
```bash
WHATSAPP_HISTORY_SYNC_DAYS=0
```
**Best for**: Privacy-focused users or real-time only usage
**Sync time**: Instant (no sync)
**Database size**: Only new messages

## How to Apply Changes

1. **Edit `.env` file**:
   ```bash
   nano .env  # or use your preferred editor
   ```

2. **Add or update the line**:
   ```bash
   WHATSAPP_HISTORY_SYNC_DAYS=365
   ```

3. **Save and restart the server**:
   ```bash
   # Stop the server (Ctrl+C)
   npm start
   ```

4. **Re-authenticate if needed**:
   - If you've already authenticated, you may need to logout first
   - Use the MCP tool `logout` with `confirm: true`
   - Then scan the QR code again

## What Gets Synced

When history sync is enabled, you get:

- ✅ **Messages** - Text, media captions, reactions
- ✅ **Chat metadata** - Names, group info, participants
- ✅ **Contact information** - Names, phone numbers
- ✅ **Timestamps** - Accurate message timestamps
- ❌ **Media files** - Only metadata (captions, filenames, sizes)
- ❌ **Deleted messages** - Not recoverable
- ❌ **Ephemeral messages** - Respect ephemeral settings

## Troubleshooting

### "History sync seems slow"

This is normal! The sync happens in the background and depends on:
- Your internet speed
- WhatsApp server load
- Amount of history to sync
- Number of chats

**Solution**: Be patient. Check progress with:
```bash
sqlite3 store/whatsapp.db "SELECT COUNT(*) FROM messages;"
```

### "I changed HISTORY_SYNC_DAYS but nothing happened"

History sync happens during **connection establishment**. You need to:
1. Stop the server
2. Edit `.env`
3. Restart the server
4. The new setting applies on next connection

If you're already connected, the server won't re-sync automatically.

### "Only getting partial history"

This can happen due to:
- **WhatsApp protocol limits** - WhatsApp decides how much to send
- **Old/archived chats** - May not be prioritized
- **Inactive chats** - Less likely to be synced

**This is normal behavior** - WhatsApp prioritizes recent and active chats.

### "Want to reset and re-sync from scratch"

```bash
# 1. Stop the server (Ctrl+C)

# 2. Delete the store (WARNING: loses all local data)
rm -rf store/

# 3. Edit .env with desired HISTORY_SYNC_DAYS

# 4. Restart
npm start

# 5. Scan QR code - fresh sync will begin
```

## Performance Tips

### For Faster Startup
- Use `WHATSAPP_HISTORY_SYNC_DAYS=30` or `90`
- Smaller history = faster connection

### For Maximum History
- Leave `WHATSAPP_HISTORY_SYNC_DAYS` unset
- Be prepared to wait 10-15 minutes on first sync
- Subsequent connections are faster (only new messages)

### For Real-Time Only
- Set `WHATSAPP_HISTORY_SYNC_DAYS=0`
- Instant startup
- No database bloat
- Only stores messages received while running

## Advanced: How It Works

The `WHATSAPP_HISTORY_SYNC_DAYS` setting controls:

1. **syncFullHistory flag** - Tells Baileys whether to request history
   - `undefined` or any positive number → `true`
   - `0` → `false`

2. **WhatsApp protocol** - Sends history during connection
   - Not a "fetch" operation
   - Happens automatically
   - Can't be manually triggered after connection

3. **Event handling** - Messages arrive via events
   - `messages.upsert` event
   - Stored in SQLite database
   - Indexed for fast searching

## Note on WhatsApp Limits

**Important**: The `HISTORY_SYNC_DAYS` setting is a preference, not a guarantee.

WhatsApp's servers decide:
- How much history to send
- Which chats to prioritize
- When to throttle sync

The setting helps by:
- Disabling sync entirely when `0`
- Signaling your preference to WhatsApp
- Potentially reducing initial sync time

But ultimately, WhatsApp controls the actual history sent.
