import { useState, useEffect, useCallback } from 'react';
import type { Chat, Message, ConnectionState, SearchResult } from '../types';

const API_BASE = '/api';

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

export function useConnectionStatus() {
  const [status, setStatus] = useState<ConnectionState>({
    connected: false,
    connecting: true,
  });
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchApi<ConnectionState>('/status');
      setStatus(data);
      setError(null);
    } catch (e) {
      setError('Failed to fetch status');
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { status, error, refresh };
}

export function useChats() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchApi<Chat[]>('/chats?limit=100');
      setChats(data);
      setError(null);
    } catch (e) {
      setError('Failed to fetch chats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { chats, loading, error, refresh };
}

export function useMessages(chatJid: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!chatJid) {
      setMessages([]);
      return;
    }

    try {
      setLoading(true);
      const data = await fetchApi<Message[]>(`/chats/${encodeURIComponent(chatJid)}/messages?limit=100`);
      setMessages(data);
      setError(null);
    } catch (e) {
      setError('Failed to fetch messages');
    } finally {
      setLoading(false);
    }
  }, [chatJid]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { messages, loading, error, refresh };
}

export function useSearch() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (query: string, type: 'keyword' | 'semantic' | 'hybrid' = 'hybrid') => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    try {
      setLoading(true);
      const data = await fetchApi<{ results: SearchResult[] }>(
        `/search?q=${encodeURIComponent(query)}&type=${type}&limit=50`
      );
      setResults(data.results);
      setError(null);
    } catch (e) {
      setError('Search failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setResults([]);
  }, []);

  return { results, loading, error, search, clear };
}

export async function sendMessage(to: string, message: string): Promise<{ success: boolean; messageId?: string }> {
  return fetchApi('/send', {
    method: 'POST',
    body: JSON.stringify({ to, message }),
  });
}
