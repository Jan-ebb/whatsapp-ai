import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Import the WhatsApp AI modules from parent directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const parentDir = path.resolve(__dirname, '../..');

// Dynamic imports for the WhatsApp modules
async function loadWhatsAppModules() {
  const distPath = path.join(parentDir, 'dist');
  
  const { DatabaseManager, MessageStore, ChatStore, ContactStore, VectorStore } = await import(
    path.join(distPath, 'storage/index.js')
  );
  const { WhatsAppClient } = await import(path.join(distPath, 'whatsapp/index.js'));
  const { Encryption } = await import(path.join(distPath, 'security/index.js'));
  const { EmbeddingService } = await import(path.join(distPath, 'embeddings/index.js'));

  return {
    DatabaseManager,
    MessageStore,
    ChatStore,
    ContactStore,
    VectorStore,
    WhatsAppClient,
    Encryption,
    EmbeddingService,
  };
}

// Load environment variables
const envPath = path.join(parentDir, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach((line) => {
    const [key, ...valueParts] = line.split('=');
    if (key && !key.startsWith('#')) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
}

const PASSPHRASE = process.env.WHATSAPP_PASSPHRASE;
const STORE_PATH = process.env.WHATSAPP_STORE_PATH || path.join(parentDir, 'store');
const PORT = parseInt(process.env.UI_PORT || '3001', 10);

if (!PASSPHRASE) {
  console.error('Error: WHATSAPP_PASSPHRASE not set');
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Store connected WebSocket clients
const clients = new Set<WebSocket>();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('WebSocket client connected');

  ws.on('close', () => {
    clients.delete(ws);
    console.log('WebSocket client disconnected');
  });
});

// Broadcast to all connected clients
function broadcast(event: string, data: unknown) {
  const message = JSON.stringify({ event, data });
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Initialize WhatsApp modules
async function init() {
  const modules = await loadWhatsAppModules();
  const {
    DatabaseManager,
    MessageStore,
    ChatStore,
    ContactStore,
    VectorStore,
    WhatsAppClient,
    Encryption,
    EmbeddingService,
  } = modules;

  // Initialize encryption
  const encryption = new Encryption(STORE_PATH);
  await encryption.initialize(PASSPHRASE);

  // Initialize database
  const db = new DatabaseManager(STORE_PATH, PASSPHRASE);
  db.initialize();

  const dbInstance = db.getDb();
  const messages = new MessageStore(dbInstance);
  const chats = new ChatStore(dbInstance);
  const contacts = new ContactStore(dbInstance);

  // Initialize embeddings
  const embeddings = new EmbeddingService();
  const vectors = new VectorStore(dbInstance, embeddings.getDimension());
  try {
    vectors.initialize();
  } catch (e) {
    console.log('Vector store not available');
  }

  // Initialize WhatsApp client
  const whatsapp = new WhatsAppClient(
    { 
      storePath: STORE_PATH, 
      printQRInTerminal: true,
      logLevel: 'silent',
    },
    encryption
  );

  // Set up event handlers
  whatsapp.on('connection.update', (state: { isConnected: boolean; qrCode?: string }) => {
    broadcast('connection', state);
  });

  whatsapp.on('message.new', (msg: unknown) => {
    broadcast('message', msg);
  });

  // Connect to WhatsApp
  whatsapp.connect().catch(console.error);

  // API Routes

  // Connection status
  app.get('/api/status', (req, res) => {
    const state = whatsapp.getConnectionState();
    const syncProgress = whatsapp.getSyncProgress();
    res.json({
      connected: state.isConnected,
      connecting: state.isConnecting,
      sync: syncProgress,
    });
  });

  // List chats
  app.get('/api/chats', (req, res) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const chatList = chats.list({ limit, offset });
    res.json(chatList);
  });

  // Get single chat
  app.get('/api/chats/:jid', (req, res) => {
    const chat = chats.getByJid(req.params.jid);
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    res.json(chat);
  });

  // Get messages for a chat
  app.get('/api/chats/:jid/messages', (req, res) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const chatMessages = messages.getByChatJid(req.params.jid, { limit, offset });
    res.json(chatMessages);
  });

  // Search messages
  app.get('/api/search', async (req, res) => {
    const query = req.query.q as string;
    const type = (req.query.type as string) || 'hybrid';
    const limit = parseInt(req.query.limit as string) || 20;

    if (!query) {
      return res.status(400).json({ error: 'Query required' });
    }

    if (type === 'keyword') {
      const results = messages.search(query, { limit, offset: 0 });
      return res.json({ results, type: 'keyword' });
    }

    if (type === 'semantic' && vectors.isInitialized()) {
      const isAvailable = await embeddings.checkAvailability();
      if (isAvailable) {
        const queryEmbedding = await embeddings.embed(query);
        if (queryEmbedding) {
          const vectorResults = vectors.search(queryEmbedding, limit);
          const results = vectorResults
            .map((vr: { messageId: string; distance: number }) => {
              const msg = messages.getById(vr.messageId);
              return msg ? { message: msg, score: 1 - vr.distance } : null;
            })
            .filter(Boolean);
          return res.json({ results, type: 'semantic' });
        }
      }
    }

    // Hybrid search (default)
    const keywordResults = messages.search(query, { limit, offset: 0 });
    let semanticResults: Array<{ message: unknown; score: number }> = [];

    if (vectors.isInitialized() && (await embeddings.checkAvailability())) {
      const queryEmbedding = await embeddings.embed(query);
      if (queryEmbedding) {
        const vectorResults = vectors.search(queryEmbedding, limit);
        semanticResults = vectorResults
          .map((vr: { messageId: string; distance: number }) => {
            const msg = messages.getById(vr.messageId);
            return msg ? { message: msg, score: 1 - vr.distance } : null;
          })
          .filter(Boolean) as Array<{ message: unknown; score: number }>;
      }
    }

    // Combine results
    const seen = new Set<string>();
    const combined = [...keywordResults, ...semanticResults.map((r) => ({ message: r.message }))].filter(
      (r: { message: { id?: string } }) => {
        if (!r.message?.id || seen.has(r.message.id)) return false;
        seen.add(r.message.id);
        return true;
      }
    );

    res.json({ results: combined.slice(0, limit), type: 'hybrid' });
  });

  // Send message
  app.post('/api/send', async (req, res) => {
    const { to, message } = req.body;

    if (!to || !message) {
      return res.status(400).json({ error: 'to and message required' });
    }

    if (!whatsapp.isConnected()) {
      return res.status(503).json({ error: 'WhatsApp not connected' });
    }

    try {
      const result = await whatsapp.sendMessage(to, { text: message });
      res.json({ success: true, messageId: result?.key?.id });
    } catch (error) {
      res.status(500).json({ error: 'Failed to send message' });
    }
  });

  // Get contacts
  app.get('/api/contacts', (req, res) => {
    const query = req.query.q as string;
    const limit = parseInt(req.query.limit as string) || 50;

    if (query) {
      const results = contacts.search(query, limit);
      return res.json(results);
    }

    const allContacts = contacts.list(limit);
    res.json(allContacts);
  });

  // Start server
  server.listen(PORT, () => {
    console.log(`WhatsApp AI UI server running on http://localhost:${PORT}`);
  });
}

init().catch(console.error);
