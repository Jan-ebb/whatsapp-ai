import { useState } from 'react';
import { Search, X, Sparkles, Type, Blend } from 'lucide-react';
import { format } from 'date-fns';
import clsx from 'clsx';
import type { SearchResult } from '../types';

interface SearchPanelProps {
  onSearch: (query: string, type: 'keyword' | 'semantic' | 'hybrid') => Promise<void>;
  results: SearchResult[];
  loading: boolean;
  onSelectResult: (chatJid: string, messageId: string) => void;
  onClose: () => void;
}

export function SearchPanel({ onSearch, results, loading, onSelectResult, onClose }: SearchPanelProps) {
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState<'keyword' | 'semantic' | 'hybrid'>('hybrid');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim(), searchType);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-20 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[70vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Search Messages</h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Search form */}
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search messages..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp-green"
              />
            </div>
            <button
              type="submit"
              disabled={!query.trim() || loading}
              className="px-4 py-2 bg-whatsapp-green text-white rounded-lg hover:bg-whatsapp-dark disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              Search
            </button>
          </form>

          {/* Search type toggle */}
          <div className="flex gap-2 mt-3">
            <SearchTypeButton
              type="hybrid"
              current={searchType}
              onClick={setSearchType}
              icon={<Blend className="w-4 h-4" />}
              label="Hybrid"
            />
            <SearchTypeButton
              type="keyword"
              current={searchType}
              onClick={setSearchType}
              icon={<Type className="w-4 h-4" />}
              label="Keyword"
            />
            <SearchTypeButton
              type="semantic"
              current={searchType}
              onClick={setSearchType}
              icon={<Sparkles className="w-4 h-4" />}
              label="Semantic"
            />
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-whatsapp-green"></div>
            </div>
          ) : results.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              {query ? 'No results found' : 'Enter a search query'}
            </div>
          ) : (
            <div className="space-y-3">
              {results.map((result, index) => (
                <SearchResultItem
                  key={`${result.message.id}-${index}`}
                  result={result}
                  onClick={() => onSelectResult(result.message.chatJid, result.message.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface SearchTypeButtonProps {
  type: 'keyword' | 'semantic' | 'hybrid';
  current: string;
  onClick: (type: 'keyword' | 'semantic' | 'hybrid') => void;
  icon: React.ReactNode;
  label: string;
}

function SearchTypeButton({ type, current, onClick, icon, label }: SearchTypeButtonProps) {
  return (
    <button
      type="button"
      onClick={() => onClick(type)}
      className={clsx(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors',
        type === current
          ? 'bg-whatsapp-green text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      )}
    >
      {icon}
      {label}
    </button>
  );
}

interface SearchResultItemProps {
  result: SearchResult;
  onClick: () => void;
}

function SearchResultItem({ result, onClick }: SearchResultItemProps) {
  const { message, score } = result;
  const time = format(new Date(message.timestamp), 'MMM d, yyyy HH:mm');

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-900">
          {message.chatJid.split('@')[0]}
        </span>
        <span className="text-xs text-gray-500">{time}</span>
      </div>
      <p className="text-sm text-gray-700 line-clamp-2">{message.content}</p>
      {score !== undefined && (
        <div className="mt-1 text-xs text-gray-500">
          Relevance: {Math.round(score * 100)}%
        </div>
      )}
    </button>
  );
}
