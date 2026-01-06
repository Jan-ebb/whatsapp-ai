# WhatsApp CLI

A security-first CLI and Model Context Protocol (MCP) server for WhatsApp. Control your personal WhatsApp account through the command line or AI assistants like Claude.

## Features

- **Single-process architecture** - TypeScript/Node.js using Baileys library
- **Security-first design** - Encrypted storage, rate limiting, confirmation required for write operations
- **Historical message sync** - Automatically fetches message history (configurable from 7 days to full history)
- **Full messaging** - Send, reply, forward, react, delete, edit messages
- **Media support** - Send and receive images, videos, documents, audio
- **Group management** - Create groups, add/remove participants
- **Chat management** - Archive, pin, mute, mark as read
- **Scheduled messages** - Queue messages for future delivery
- **Full-text search** - FTS5-powered message search

## Security

All data is stored locally and fully encrypted:

- **Encrypted database** - All messages encrypted at rest with SQLCipher (AES-256)
- **Encrypted credentials** - WhatsApp auth state encrypted with AES-256-GCM
- **No network exposure** - stdio transport only, no HTTP server
- **Confirmation required** - Write operations require explicit `confirm: true`
- **Rate limiting** - Prevents bulk data extraction
- **Output truncation** - Max 50 messages per query
- **No message logging** - Message content never logged

## Installation

### Prerequisites

- Node.js 20+
- npm (comes with Node.js)

### Quick Setup (Recommended)

```bash
git clone https://github.com/yourusername/whatsapp-cli.git
cd whatsapp-cli
./setup.sh
```

The interactive setup will guide you through installation and configuration.

### Manual Setup

```bash
git clone https://github.com/yourusername/whatsapp-cli.git
cd whatsapp-cli
npm install
npm run build
cp .env.example .env
# Edit .env and set WHATSAPP_PASSPHRASE
npm start
```

## Configuration

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
| `WHATSAPP_HISTORY_SYNC_DAYS` | No | full | Days of history to sync (0=disable, 365=1 year) |

### Claude Desktop Configuration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "whatsapp": {
      "command": "node",
      "args": ["/path/to/whatsapp-cli/dist/index.js"],
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
      "args": ["/path/to/whatsapp-cli/dist/index.js"],
      "env": {
        "WHATSAPP_PASSPHRASE": "your-secure-passphrase-here"
      }
    }
  }
}
```

## First Run

1. Start the MCP server (via Claude/Cursor or manually)
2. A QR code will appear in the terminal
3. Open WhatsApp on your phone → Settings → Linked Devices → Link a Device
4. Scan the QR code
5. Wait for connection confirmation

Re-authentication may be required after ~20 days.

## Available Tools

### Messaging (require `confirm: true`)

| Tool | Description |
|------|-------------|
| `send_message` | Send text message |
| `send_media` | Send image/video/document/audio |
| `reply_to_message` | Reply to specific message |
| `forward_message` | Forward message to another chat |
| `react_to_message` | Add emoji reaction |
| `delete_message` | Delete message |
| `edit_message` | Edit sent message |
| `star_message` | Star/unstar message |

### Chats & Messages

| Tool | Description |
|------|-------------|
| `list_chats` | List chats with filters |
| `get_chat` | Get chat details |
| `get_messages` | Get messages with pagination |
| `search_messages` | Full-text search |
| `mark_as_read` | Mark chat as read |
| `archive_chat` | Archive/unarchive |
| `pin_chat` | Pin/unpin |
| `mute_chat` | Mute/unmute |

### Contacts

| Tool | Description |
|------|-------------|
| `search_contacts` | Search by name/number |
| `get_contact` | Get contact details |
| `get_profile_picture` | Get profile picture URL |

### Groups (require `confirm: true`)

| Tool | Description |
|------|-------------|
| `create_group` | Create new group |
| `get_group_info` | Get group metadata |
| `add_participants` | Add members |
| `remove_participants` | Remove members |

### Presence

| Tool | Description |
|------|-------------|
| `get_presence` | Subscribe to online status |
| `send_typing` | Send typing indicator |

### Utility

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

## Troubleshooting

### QR Code Not Displaying

- Check terminal supports QR code display
- Try restarting the server

### Connection Issues

- Delete `store/auth/` directory and re-authenticate
- Check WhatsApp is not logged out on phone

### Rate Limit Exceeded

- Wait for the reset period (shown in error)
- Reduce query frequency

### Wrong Passphrase

- If you forget your passphrase, delete the `store/` directory
- You'll need to re-authenticate with WhatsApp

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

## License

MIT
