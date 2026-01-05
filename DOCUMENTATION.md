# WhatsApp MCP Server Documentation

This document explains how the WhatsApp MCP Server works and how to use it.

## Quick Start (macOS)

```bash
# Clone and enter the directory
git clone <repo>
cd whatsapp-mcp

# Run the interactive setup
./setup.sh
```

The setup script will:
1. Check Node.js is installed (v20+)
2. Install dependencies
3. Build the TypeScript
4. Prompt for your encryption passphrase
5. Create a `.env` file
6. Optionally start the server

## Overview

The WhatsApp MCP Server is a Model Context Protocol (MCP) server that allows AI assistants (like Claude or Cursor) to interact with your personal WhatsApp account. It uses the Baileys library to connect to WhatsApp's multi-device web protocol.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    WhatsApp MCP Server                       │
│                     (TypeScript/Node.js)                     │
├─────────────────────────────────────────────────────────────┤
│  MCP Layer (stdio transport)                                 │
│  └── Tools (30+ operations)                                 │
├─────────────────────────────────────────────────────────────┤
│  Security Layer                                              │
│  ├── Encryption (AES-256-GCM)                               │
│  ├── Rate Limiting                                          │
│  ├── Session Management                                     │
│  └── Confirmation Checks                                    │
├─────────────────────────────────────────────────────────────┤
│  WhatsApp Service (Baileys)                                 │
│  └── Multi-device Web Protocol                              │
├─────────────────────────────────────────────────────────────┤
│  Storage (SQLite + FTS5)                                    │
│  └── Messages, Chats, Contacts, Scheduled                   │
└─────────────────────────────────────────────────────────────┘
```

### Components

| Directory | Purpose |
|-----------|---------|
| `src/index.ts` | Entry point - validates passphrase and starts server |
| `src/server.ts` | MCP server setup, tool routing, event handlers |
| `src/tools/` | Tool definitions and handlers for each category |
| `src/whatsapp/` | WhatsApp client using Baileys library |
| `src/security/` | Encryption, rate limiting, session management |
| `src/storage/` | SQLite database with FTS5 for message search |
| `src/utils/` | Formatting helpers and message scheduler |

## How It Works

### 1. Connection Flow

1. Server starts and validates the `WHATSAPP_PASSPHRASE` environment variable
2. Encryption is initialized using PBKDF2 key derivation (100,000 iterations)
3. SQLite database is created/opened for local storage
4. WhatsApp client connects using Baileys
5. If not authenticated, a QR code is displayed in the terminal
6. User scans QR code with WhatsApp mobile app
7. Auth credentials are encrypted and stored locally
8. MCP server starts listening on stdio transport

### 2. Message Flow

**Incoming messages:**
1. Baileys receives message from WhatsApp
2. `message.new` event fires
3. Message is stored in SQLite database
4. Chat metadata is updated

**Outgoing messages:**
1. AI assistant calls a tool (e.g., `send_message`)
2. Rate limiter checks request count
3. Confirmation check verifies `confirm: true` flag
4. WhatsApp client sends message via Baileys
5. Response returned to AI assistant

### 3. Security Model

**Encryption:**
- All auth credentials encrypted with AES-256-GCM
- Key derived from passphrase using PBKDF2 with SHA-512
- Salt stored separately in `store/.salt`

**Rate Limiting:**
- Default: 60 requests per minute
- Prevents bulk data extraction
- Configurable via `WHATSAPP_RATE_LIMIT`

**Confirmation Required:**
- Write operations require `confirm: true` parameter
- Prevents accidental message sends
- Can be disabled via `WHATSAPP_REQUIRE_CONFIRMATION=false`

**Output Limits:**
- Max 50 messages per query (configurable)
- Max 100 chats per query (configurable)

## Installation

### Prerequisites

- Node.js 20+
- npm (comes with Node.js)

### Option 1: Interactive Setup (Recommended)

```bash
git clone <repo>
cd whatsapp-mcp
./setup.sh
```

### Option 2: Manual Setup

```bash
git clone <repo>
cd whatsapp-mcp
npm install
npm run build

# Create config file
cp .env.example .env
# Edit .env and set WHATSAPP_PASSPHRASE

# Start the server
npm start
```

## Configuration

### Using .env File (Recommended)

Create a `.env` file in the project root (or copy from `.env.example`):

```bash
# Required
WHATSAPP_PASSPHRASE=your-secure-passphrase

# Optional
WHATSAPP_STORE_PATH=./store
WHATSAPP_REQUIRE_CONFIRMATION=true
WHATSAPP_MAX_MESSAGES=50
WHATSAPP_RATE_LIMIT=60
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `WHATSAPP_PASSPHRASE` | Yes | - | Encryption passphrase (min 8 chars) |
| `WHATSAPP_STORE_PATH` | No | `./store` | Path to store data |
| `WHATSAPP_REQUIRE_CONFIRMATION` | No | `true` | Require confirm flag for writes |
| `WHATSAPP_MAX_MESSAGES` | No | `50` | Max messages per query |
| `WHATSAPP_MAX_CHATS` | No | `100` | Max chats per query |
| `WHATSAPP_RATE_LIMIT` | No | `60` | Requests per minute |
| `WHATSAPP_IDLE_TIMEOUT` | No | `30` | Session lock timeout (minutes) |
| `WHATSAPP_LOG_LEVEL` | No | `errors` | Log level: none, errors, operations |

### Claude Desktop Configuration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "whatsapp": {
      "command": "node",
      "args": ["/path/to/whatsapp-mcp/dist/index.js"],
      "env": {
        "WHATSAPP_PASSPHRASE": "your-secure-passphrase-here"
      }
    }
  }
}
```

### Cursor Configuration

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "whatsapp": {
      "command": "node",
      "args": ["/path/to/whatsapp-mcp/dist/index.js"],
      "env": {
        "WHATSAPP_PASSPHRASE": "your-secure-passphrase-here"
      }
    }
  }
}
```

## First Run

1. Start the MCP server (via Claude/Cursor or manually)
2. A QR code appears in the terminal
3. Open WhatsApp on your phone → Settings → Linked Devices → Link a Device
4. Scan the QR code
5. Wait for connection confirmation

Re-authentication may be required after ~20 days.

## Available Tools

### Messaging Tools (require `confirm: true`)

| Tool | Description | Parameters |
|------|-------------|------------|
| `send_message` | Send text message | `recipient`, `message`, `confirm` |
| `send_media` | Send image/video/document/audio | `recipient`, `media_path`, `media_type`, `caption?`, `confirm` |
| `reply_to_message` | Reply to specific message | `chat_jid`, `message_id`, `message`, `confirm` |
| `forward_message` | Forward message to another chat | `from_chat_jid`, `message_id`, `to_recipient`, `confirm` |
| `react_to_message` | Add emoji reaction | `chat_jid`, `message_id`, `emoji`, `confirm` |
| `delete_message` | Delete message | `chat_jid`, `message_id`, `for_everyone?`, `confirm` |
| `edit_message` | Edit sent message | `chat_jid`, `message_id`, `new_text`, `confirm` |
| `star_message` | Star/unstar message | `chat_jid`, `message_id`, `star`, `confirm` |

### Chat Tools

| Tool | Description |
|------|-------------|
| `list_chats` | List chats with filters |
| `get_chat` | Get chat details |
| `get_messages` | Get messages with pagination |
| `search_messages` | Full-text search (FTS5) |
| `mark_as_read` | Mark chat as read |
| `archive_chat` | Archive/unarchive |
| `pin_chat` | Pin/unpin |
| `mute_chat` | Mute/unmute |

### Contact Tools

| Tool | Description |
|------|-------------|
| `search_contacts` | Search by name/number |
| `get_contact` | Get contact details |
| `get_profile_picture` | Get profile picture URL |

### Group Tools (require `confirm: true`)

| Tool | Description |
|------|-------------|
| `create_group` | Create new group |
| `get_group_info` | Get group metadata |
| `add_participants` | Add members |
| `remove_participants` | Remove members |

### Presence Tools

| Tool | Description |
|------|-------------|
| `get_presence` | Subscribe to online status |
| `send_typing` | Send typing indicator |

### Utility Tools

| Tool | Description |
|------|-------------|
| `get_connection_status` | Check connection |
| `logout` | Disconnect and clear credentials |
| `schedule_message` | Schedule future message |
| `cancel_scheduled` | Cancel scheduled message |
| `list_scheduled` | List pending scheduled messages |

## Usage Examples

### Send a message

```
Use send_message with recipient "1234567890" and message "Hello!" with confirm: true
```

### Search messages

```
Use search_messages with query "meeting tomorrow"
```

### Create a group

```
Use create_group with name "Project Team" and participants ["1234567890", "0987654321"] with confirm: true
```

### Schedule a message

```
Use schedule_message with chat_jid "1234567890@s.whatsapp.net", content "Reminder!", and scheduled_time "2024-01-15T09:00:00Z"
```

## Data Storage

### Database Schema

The SQLite database stores:

- **contacts**: JID, phone number, name, push name, profile picture
- **chats**: JID, name, group status, archive/pin/mute state, unread count
- **messages**: ID, chat JID, sender, content, timestamp, media info, reactions
- **scheduled_messages**: ID, chat JID, content, scheduled time, status
- **messages_fts**: Full-text search index for message content

### File Structure

```
store/
├── .salt              # Encryption salt
├── auth/              # Encrypted WhatsApp credentials
├── database.sqlite    # SQLite database
└── media/             # Downloaded media files
```

## Auto-Reconnect

The server automatically handles disconnections:

- **Exponential backoff**: Reconnect attempts start at 1 second and increase up to 1 minute
- **Max attempts**: 10 reconnection attempts before giving up
- **Automatic reset**: Successful connection resets the attempt counter

You'll see status messages like:
```
⚠ Disconnected: connectionLost
ℹ Reconnecting (attempt 1/10) in 2s...
✓ Connected to WhatsApp
```

## Troubleshooting

### QR Code Not Displaying

- Check terminal supports QR code display
- Try restarting the server

### Connection Issues

- The server will auto-reconnect up to 10 times
- If it keeps failing, check your internet connection
- Delete `store/auth/` directory and re-authenticate

### Rate Limit Exceeded

- Wait for the reset period (shown in error)
- Reduce query frequency

### Wrong Passphrase

- If you forget your passphrase, delete the `store/` directory
- You'll need to re-authenticate with WhatsApp

### "Not connected to WhatsApp" Error

- Check internet connection
- Verify WhatsApp is still linked on your phone
- Restart the server

### Logged Out

If you see "Logged out from WhatsApp":
1. Delete `store/auth/` directory
2. Restart the server
3. Scan the new QR code

## Security Considerations

1. **Passphrase**: Use a strong passphrase (8+ characters). It encrypts your WhatsApp credentials.

2. **Local Storage**: All data is stored locally. No data is sent to external servers.

3. **Confirmation Flag**: Write operations require explicit confirmation to prevent accidental actions.

4. **Rate Limiting**: Prevents abuse and bulk data extraction.

5. **No Message Logging**: Message content is never logged to console or files.

6. **stdio Transport**: No HTTP server exposed. Communication only via stdio.

## Dependencies

| Package | Purpose |
|---------|---------|
| `@modelcontextprotocol/sdk` | MCP server implementation |
| `@whiskeysockets/baileys` | WhatsApp Web API client |
| `better-sqlite3` | SQLite database |
| `pino` | Logging |
| `qrcode-terminal` | QR code display |
| `zod` | Schema validation |

## License

MIT
