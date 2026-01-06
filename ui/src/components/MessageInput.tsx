import { useState } from 'react';
import { Send, AlertCircle } from 'lucide-react';
import clsx from 'clsx';

interface MessageInputProps {
  chatJid: string | null;
  onSend: (message: string) => Promise<void>;
  disabled?: boolean;
}

export function MessageInput({ chatJid, onSend, disabled }: MessageInputProps) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !chatJid || disabled) return;

    // Show confirmation dialog
    setShowConfirm(true);
  };

  const confirmSend = async () => {
    setShowConfirm(false);
    setSending(true);
    setError(null);

    try {
      await onSend(message.trim());
      setMessage('');
    } catch (e) {
      setError('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const cancelSend = () => {
    setShowConfirm(false);
  };

  if (!chatJid) {
    return null;
  }

  return (
    <>
      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl">
            <h3 className="text-lg font-semibold mb-2">Confirm Send</h3>
            <p className="text-gray-600 mb-4">
              Are you sure you want to send this message?
            </p>
            <div className="bg-gray-100 rounded-lg p-3 mb-4">
              <p className="text-gray-800 whitespace-pre-wrap">{message}</p>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={cancelSend}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmSend}
                className="px-4 py-2 bg-whatsapp-green text-white rounded-lg hover:bg-whatsapp-dark transition-colors"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Input bar */}
      <div className="bg-gray-100 px-4 py-3 border-t border-gray-200">
        {error && (
          <div className="flex items-center gap-2 text-red-600 text-sm mb-2">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex items-center gap-3">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type a message..."
            disabled={disabled || sending}
            className={clsx(
              'flex-1 px-4 py-2 rounded-full bg-white border border-gray-300',
              'focus:outline-none focus:ring-2 focus:ring-whatsapp-green focus:border-transparent',
              'disabled:bg-gray-200 disabled:cursor-not-allowed'
            )}
          />
          <button
            type="submit"
            disabled={!message.trim() || disabled || sending}
            className={clsx(
              'w-10 h-10 rounded-full flex items-center justify-center transition-colors',
              message.trim() && !disabled && !sending
                ? 'bg-whatsapp-green text-white hover:bg-whatsapp-dark'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            )}
          >
            {sending ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </form>
      </div>
    </>
  );
}
