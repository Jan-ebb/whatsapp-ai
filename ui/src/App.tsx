import { useState, useCallback, useEffect } from 'react';
import { Search } from 'lucide-react';
import {
  ChatList,
  MessageView,
  MessageInput,
  SearchPanel,
  ConnectionStatus,
  ConnectionBanner,
} from './components';
import { useConnectionStatus, useChats, useMessages, useSearch, sendMessage } from './hooks/useApi';
import { useWebSocket } from './hooks/useWebSocket';
import type { Chat, Message } from './types';

export default function App() {
  const [selectedChatJid, setSelectedChatJid] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);

  const { status } = useConnectionStatus();
  const { chats, loading: chatsLoading, refresh: refreshChats } = useChats();
  const { messages, loading: messagesLoading, refresh: refreshMessages } = useMessages(selectedChatJid);
  const { results: searchResults, loading: searchLoading, search, clear: clearSearch } = useSearch();

  // Find selected chat
  const selectedChat = chats.find((c) => c.jid === selectedChatJid) || null;

  // Handle WebSocket messages
  const handleWebSocketMessage = useCallback(
    (event: string, data: unknown) => {
      if (event === 'connection') {
        // Connection status changed, refresh will happen via polling
      } else if (event === 'message') {
        const msg = data as Message;
        // Refresh messages if it's for the current chat
        if (msg.chatJid === selectedChatJid) {
          refreshMessages();
        }
        // Refresh chat list to update last message time
        refreshChats();
      }
    },
    [selectedChatJid, refreshMessages, refreshChats]
  );

  useWebSocket(handleWebSocketMessage);

  // Handle send message
  const handleSendMessage = async (message: string) => {
    if (!selectedChatJid) return;
    await sendMessage(selectedChatJid, message);
    refreshMessages();
  };

  // Handle search
  const handleSearch = async (query: string, type: 'keyword' | 'semantic' | 'hybrid') => {
    await search(query, type);
  };

  // Handle search result click
  const handleSearchResultClick = (chatJid: string, _messageId: string) => {
    setSelectedChatJid(chatJid);
    setShowSearch(false);
    clearSearch();
  };

  // Keyboard shortcut for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch(true);
      }
      if (e.key === 'Escape') {
        setShowSearch(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Connection banner */}
      <ConnectionBanner status={status} />

      {/* Header */}
      <header className="bg-whatsapp-dark text-white px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-semibold">WhatsApp AI</h1>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowSearch(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
          >
            <Search className="w-4 h-4" />
            <span className="text-sm">Search</span>
            <kbd className="text-xs bg-white/20 px-1.5 py-0.5 rounded">⌘K</kbd>
          </button>
          <ConnectionStatus status={status} />
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-80 flex-shrink-0">
          <ChatList
            chats={chats}
            selectedChatJid={selectedChatJid}
            onSelectChat={setSelectedChatJid}
            loading={chatsLoading}
          />
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col">
          <MessageView
            chat={selectedChat}
            messages={messages}
            loading={messagesLoading}
          />
          <MessageInput
            chatJid={selectedChatJid}
            onSend={handleSendMessage}
            disabled={!status.connected}
          />
        </div>
      </div>

      {/* Search panel */}
      {showSearch && (
        <SearchPanel
          onSearch={handleSearch}
          results={searchResults}
          loading={searchLoading}
          onSelectResult={handleSearchResultClick}
          onClose={() => {
            setShowSearch(false);
            clearSearch();
          }}
        />
      )}
    </div>
  );
}
