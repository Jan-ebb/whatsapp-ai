import { useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { Check, CheckCheck, Star, Reply, Image, FileText, Mic, Video } from 'lucide-react';
import clsx from 'clsx';
import type { Message, Chat } from '../types';

interface MessageViewProps {
  chat: Chat | null;
  messages: Message[];
  loading: boolean;
}

export function MessageView({ chat, messages, loading }: MessageViewProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!chat) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center text-gray-500">
          <div className="w-24 h-24 mx-auto mb-4 bg-gray-200 rounded-full flex items-center justify-center">
            <svg className="w-12 h-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h2 className="text-xl font-medium mb-2">WhatsApp AI</h2>
          <p>Select a chat to view messages</p>
        </div>
      </div>
    );
  }

  const displayName = chat.name || chat.jid.split('@')[0];

  // Sort messages by timestamp
  const sortedMessages = [...messages].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // Group messages by date
  const groupedMessages = groupMessagesByDate(sortedMessages);

  return (
    <div className="flex-1 flex flex-col bg-[#e5ddd5]">
      {/* Header */}
      <div className="bg-whatsapp-dark text-white px-4 py-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-whatsapp-teal flex items-center justify-center">
          <span className="text-lg font-medium">{displayName[0]?.toUpperCase()}</span>
        </div>
        <div>
          <h2 className="font-medium">{displayName}</h2>
          <p className="text-xs text-gray-300">
            {chat.isGroup ? 'Group' : 'Chat'} • {messages.length} messages
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-whatsapp-green"></div>
          </div>
        ) : sortedMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <p>No messages yet</p>
          </div>
        ) : (
          Object.entries(groupedMessages).map(([date, msgs]) => (
            <div key={date}>
              {/* Date separator */}
              <div className="flex justify-center my-4">
                <span className="bg-white/80 text-gray-600 text-xs px-3 py-1 rounded-lg shadow-sm">
                  {date}
                </span>
              </div>
              {/* Messages for this date */}
              {msgs.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}

interface MessageBubbleProps {
  message: Message;
}

function MessageBubble({ message }: MessageBubbleProps) {
  const time = format(new Date(message.timestamp), 'HH:mm');

  return (
    <div
      className={clsx(
        'flex mb-2',
        message.isFromMe ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={clsx(
          'message-bubble relative',
          message.isFromMe ? 'message-bubble-sent' : 'message-bubble-received'
        )}
      >
        {/* Media indicator */}
        {message.mediaType && (
          <div className="flex items-center gap-1 text-gray-500 text-sm mb-1">
            {getMediaIcon(message.mediaType)}
            <span className="capitalize">{message.mediaType}</span>
          </div>
        )}

        {/* Reply indicator */}
        {message.replyToId && (
          <div className="flex items-center gap-1 text-xs text-gray-500 mb-1 border-l-2 border-whatsapp-green pl-2">
            <Reply className="w-3 h-3" />
            <span>Reply</span>
          </div>
        )}

        {/* Content */}
        {message.content && (
          <p className="text-gray-800 whitespace-pre-wrap break-words">{message.content}</p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-1 mt-1">
          {message.isStarred && <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />}
          <span className="text-[10px] text-gray-500">{time}</span>
          {message.isFromMe && (
            <CheckCheck className="w-4 h-4 text-blue-500" />
          )}
        </div>
      </div>
    </div>
  );
}

function getMediaIcon(mediaType: string) {
  switch (mediaType) {
    case 'image':
      return <Image className="w-4 h-4" />;
    case 'video':
      return <Video className="w-4 h-4" />;
    case 'audio':
      return <Mic className="w-4 h-4" />;
    case 'document':
      return <FileText className="w-4 h-4" />;
    default:
      return <FileText className="w-4 h-4" />;
  }
}

function groupMessagesByDate(messages: Message[]): Record<string, Message[]> {
  const groups: Record<string, Message[]> = {};

  messages.forEach((message) => {
    const date = format(new Date(message.timestamp), 'MMMM d, yyyy');
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(message);
  });

  return groups;
}
