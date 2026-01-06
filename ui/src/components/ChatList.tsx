import { useState } from 'react';
import { Search, Users, User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import type { Chat } from '../types';

interface ChatListProps {
  chats: Chat[];
  selectedChatJid: string | null;
  onSelectChat: (jid: string) => void;
  loading: boolean;
}

export function ChatList({ chats, selectedChatJid, onSelectChat, loading }: ChatListProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredChats = chats.filter((chat) => {
    if (!searchQuery) return true;
    const name = chat.name || chat.jid;
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Sort: pinned first, then by last message time
  const sortedChats = [...filteredChats].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    if (!a.lastMessageTime) return 1;
    if (!b.lastMessageTime) return -1;
    return new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime();
  });

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h1 className="text-xl font-semibold text-gray-800 mb-3">Chats</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-whatsapp-green"
          />
        </div>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-whatsapp-green"></div>
          </div>
        ) : sortedChats.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-500">
            <p>No chats found</p>
          </div>
        ) : (
          sortedChats.map((chat) => (
            <ChatItem
              key={chat.jid}
              chat={chat}
              isSelected={chat.jid === selectedChatJid}
              onClick={() => onSelectChat(chat.jid)}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface ChatItemProps {
  chat: Chat;
  isSelected: boolean;
  onClick: () => void;
}

function ChatItem({ chat, isSelected, onClick }: ChatItemProps) {
  const displayName = chat.name || chat.jid.split('@')[0];
  const timeAgo = chat.lastMessageTime
    ? formatDistanceToNow(new Date(chat.lastMessageTime), { addSuffix: true })
    : null;

  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left',
        isSelected && 'bg-gray-100'
      )}
    >
      {/* Avatar */}
      <div
        className={clsx(
          'w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0',
          chat.isGroup ? 'bg-whatsapp-teal' : 'bg-whatsapp-green'
        )}
      >
        {chat.isGroup ? (
          <Users className="w-6 h-6 text-white" />
        ) : (
          <User className="w-6 h-6 text-white" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="font-medium text-gray-900 truncate">{displayName}</span>
          {timeAgo && <span className="text-xs text-gray-500 flex-shrink-0 ml-2">{timeAgo}</span>}
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-sm text-gray-500 truncate">
            {chat.isGroup ? 'Group' : 'Chat'}
          </span>
          {chat.unreadCount > 0 && (
            <span className="bg-whatsapp-green text-white text-xs rounded-full px-2 py-0.5 ml-2">
              {chat.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
