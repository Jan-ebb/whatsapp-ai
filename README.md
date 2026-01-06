# WhatsApp AI

A secure AI assistant for WhatsApp with semantic search. Control your personal WhatsApp through Claude Desktop or Claude Code with full message history and intelligent search.

## Quick Install (macOS)

```bash
curl -fsSL https://raw.githubusercontent.com/Jan-ebb/whatsapp-ai/main/install.sh | bash
```

This will install everything you need and configure Claude Desktop or Claude Code automatically.

## Features

- **AI-Powered Search** - Semantic search finds messages by meaning, not just keywords
- **Full Encryption** - All messages encrypted at rest with SQLCipher (AES-256)
- **Local & Private** - Everything runs on your machine, no cloud services
- **Historical Sync** - Access your full WhatsApp message history
- **Full Messaging** - Send, reply, forward, react, delete, edit messages
- **Media Support** - Send and receive images, videos, documents, audio
- **Group Management** - Create groups, add/remove participants

## Security

All data is stored locally and fully encrypted:

- **Encrypted database** - All messages encrypted at rest with SQLCipher (AES-256)
- **Encrypted credentials** - WhatsApp auth state encrypted with AES-256-GCM
- **No network exposure** - stdio transport only, no HTTP server
- **Confirmation required** - Write operations require explicit confirmation
- **Rate limiting** - Prevents bulk data extraction
- **No message logging** - Message content never logged

## Manual Installation

### Prerequisites

- Node.js 20+
- Ollama (for semantic search)

### Setup

```bash
git clone https://github.com/Jan-ebb/whatsapp-ai.git
cd whatsapp-ai
./setup.sh
```

### Ollama Setup (for Semantic Search)

```bash
brew install ollama
ollama pull nomic-embed-text
ollama serve
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `WHATSAPP_PASSPHRASE` | Yes | - | Encryption passphrase (min 8 chars) |
| `WHATSAPP_STORE_PATH` | No | `./store` | Path to store data |
| `WHATSAPP_HISTORY_SYNC_DAYS` | No | full | Days of history to sync |
| `WHATSAPP_EMBEDDING_MODEL` | No | `nomic-embed-text` | Ollama model for embeddings |

### Claude Configuration

**Claude Desktop** - Add to `~/Library/Application Support/Claude/claude_desktop_config.json`

**Claude Code** - Add to `~/.claude/mcp.json`

```json
{
  "mcpServers": {
    "whatsapp": {
      "command": "node",
      "args": ["/path/to/whatsapp-ai/dist/index.js"],
      "env": {
        "WHATSAPP_PASSPHRASE": "your-secure-passphrase-here"
      }
    }
  }
}
```

## First Run

1. Start the server (via Claude Desktop or manually with `npm start`)
2. A QR code will appear in the terminal
3. Open WhatsApp on your phone → Settings → Linked Devices → Link a Device
4. Scan the QR code
5. Wait for connection confirmation

## Search Types

| Type | Description | Example |
|------|-------------|---------|
| `search_messages` | Keyword search (exact matches) | "meeting tomorrow" |
| `semantic_search` | AI search (finds meaning) | "messages where someone seemed frustrated" |
| `hybrid_search` | Combined (recommended) | "project deadline concerns" |

## Available Tools

### Messaging
`send_message`, `send_media`, `reply_to_message`, `forward_message`, `react_to_message`, `delete_message`, `edit_message`, `star_message`

### Search & Chat
`list_chats`, `get_chat`, `get_messages`, `search_messages`, `semantic_search`, `hybrid_search`, `mark_as_read`, `archive_chat`, `pin_chat`, `mute_chat`

### Contacts & Groups
`search_contacts`, `get_contact`, `get_profile_picture`, `create_group`, `get_group_info`, `add_participants`, `remove_participants`

### Utility
`get_connection_status`, `get_embedding_status`, `embed_historical_messages`, `schedule_message`, `list_scheduled`

## Usage Examples

**Search by meaning:**
```
"Find messages where someone was running late"
→ Uses semantic_search to find "running behind", "delayed", "won't make it on time", etc.
```

**Send a message:**
```
"Send 'On my way!' to John"
→ Uses send_message with confirmation
```

**Get context:**
```
"What did Sarah say about the project last week?"
→ Uses hybrid_search + get_messages
```

## Troubleshooting

### Semantic search not working
- Make sure Ollama is running: `ollama serve`
- Check model is installed: `ollama pull nomic-embed-text`
- Run `get_embedding_status` to check status

### Connection issues
- Delete `store/auth/` and re-scan QR code
- Check WhatsApp is still linked on your phone

### Wrong passphrase
- Delete `store/` directory and start fresh
- You'll need to re-authenticate with WhatsApp

## License

MIT
