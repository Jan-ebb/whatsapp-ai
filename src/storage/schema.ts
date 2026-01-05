export const SCHEMA = `
-- Contacts table
CREATE TABLE IF NOT EXISTS contacts (
  jid TEXT PRIMARY KEY,
  phone_number TEXT,
  name TEXT,
  push_name TEXT,
  profile_picture_url TEXT,
  is_business INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone_number);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name);

-- Chats table
CREATE TABLE IF NOT EXISTS chats (
  jid TEXT PRIMARY KEY,
  name TEXT,
  is_group INTEGER DEFAULT 0,
  is_archived INTEGER DEFAULT 0,
  is_pinned INTEGER DEFAULT 0,
  is_muted INTEGER DEFAULT 0,
  mute_until TEXT,
  unread_count INTEGER DEFAULT 0,
  last_message_time TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chats_last_message ON chats(last_message_time DESC);
CREATE INDEX IF NOT EXISTS idx_chats_name ON chats(name);

-- Group participants table
CREATE TABLE IF NOT EXISTS group_participants (
  group_jid TEXT NOT NULL,
  participant_jid TEXT NOT NULL,
  is_admin INTEGER DEFAULT 0,
  is_super_admin INTEGER DEFAULT 0,
  PRIMARY KEY (group_jid, participant_jid),
  FOREIGN KEY (group_jid) REFERENCES chats(jid) ON DELETE CASCADE
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  chat_jid TEXT NOT NULL,
  sender_jid TEXT,
  content TEXT,
  timestamp TEXT NOT NULL,
  is_from_me INTEGER DEFAULT 0,
  is_forwarded INTEGER DEFAULT 0,
  is_starred INTEGER DEFAULT 0,
  is_deleted INTEGER DEFAULT 0,
  reply_to_id TEXT,
  media_type TEXT,
  media_url TEXT,
  media_mime_type TEXT,
  media_filename TEXT,
  media_size INTEGER,
  media_downloaded INTEGER DEFAULT 0,
  media_local_path TEXT,
  reactions TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (chat_jid) REFERENCES chats(jid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_jid);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_jid);
CREATE INDEX IF NOT EXISTS idx_messages_starred ON messages(is_starred) WHERE is_starred = 1;

-- Full-text search for messages
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  content,
  content='messages',
  content_rowid='rowid'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, content) VALUES (NEW.rowid, NEW.content);
END;

CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', OLD.rowid, OLD.content);
END;

CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', OLD.rowid, OLD.content);
  INSERT INTO messages_fts(rowid, content) VALUES (NEW.rowid, NEW.content);
END;

-- Scheduled messages table
CREATE TABLE IF NOT EXISTS scheduled_messages (
  id TEXT PRIMARY KEY,
  chat_jid TEXT NOT NULL,
  content TEXT NOT NULL,
  media_path TEXT,
  scheduled_time TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (chat_jid) REFERENCES chats(jid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scheduled_time ON scheduled_messages(scheduled_time);
CREATE INDEX IF NOT EXISTS idx_scheduled_status ON scheduled_messages(status);
`;
