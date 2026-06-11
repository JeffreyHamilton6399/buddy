'use client';

/**
 * Main chat page — renders the Buddy conversation UI.
 *
 * Features:
 *  - Dark-mode, mobile-friendly layout
 *  - Character picker (8 personas, each with unique voice + personality)
 *  - Voice input  via Web Speech Recognition (mic button)
 *  - Voice output via Web Speech Synthesis  (auto-reads Buddy's replies)
 *  - Voice on/off toggle and speaking/listening visual indicators
 *  - Clear chat button
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { CHARACTERS, getCharacter } from '@/lib/characters';
import { useVoice } from '@/hooks/useVoice';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// ── Auto-resize textarea ───────────────────────────────────────────────────
// Grows up to 128 px, then scrolls internally.
function useAutoResize(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [value]);
  return ref;
}

// ── Mic icon SVG ──────────────────────────────────────────────────────────
function MicIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 1a4 4 0 00-4 4v7a4 4 0 008 0V5a4 4 0 00-4-4z" />
      <path d="M6.25 10.5a.75.75 0 00-1.5 0V12a7.001 7.001 0 006.25 6.956V20.5H9a.75.75 0 000 1.5h6a.75.75 0 000-1.5h-2v-1.544A7.001 7.001 0 0019.25 12v-1.5a.75.75 0 00-1.5 0V12a5.5 5.5 0 01-11 0v-1.5z" />
    </svg>
  );
}

// ── Send icon SVG ─────────────────────────────────────────────────────────
function SendIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const [messages, setMessages]               = useState<Message[]>([]);
  const [input, setInput]                     = useState('');
  const [loading, setLoading]                 = useState(false);
  const [voiceEnabled, setVoiceEnabled]       = useState(false);
  const [selectedCharId, setSelectedCharId]   = useState('buddy');

  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useAutoResize(input);

  // ── Voice ref bridge ──────────────────────────────────────────────────────
  // useVoice needs a stable callback, but sendMessage changes on every render
  // (it closes over messages, input, etc.). We use a ref so the voice hook
  // always calls the latest version without triggering unnecessary re-renders.
  const sendMessageRef = useRef<((text?: string) => Promise<void>) | null>(null);

  // This stable callback is what we hand to useVoice
  const handleVoiceTranscript = useCallback((text: string) => {
    sendMessageRef.current?.(text);
  }, []);

  const {
    isListening,
    isSpeaking,
    interimTranscript,
    startListening,
    stopListening,
    speak,
    cancelSpeech,
    speechInputSupported,
    speechOutputSupported,
  } = useVoice(handleVoiceTranscript, voiceEnabled);

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // ── Core send logic ───────────────────────────────────────────────────────
  /**
   * Send a message to /api/chat and append the assistant reply.
   * @param textOverride  Text from voice recognition (bypasses the input field).
   */
  const sendMessage = useCallback(async (textOverride?: string) => {
    const text = (textOverride !== undefined ? textOverride : input).trim();
    if (!text || loading) return;

    const userMsg: Message = { role: 'user', content: text };
    const history = [...messages, userMsg];

    setMessages(history);
    if (textOverride === undefined) setInput(''); // Only clear the typed input
    setLoading(true);

    // Stop any in-progress speech before sending the next message
    cancelSpeech();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, character: selectedCharId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'API error');

      const reply: string = data.reply;
      setMessages([...history, { role: 'assistant', content: reply }]);

      // Read the reply aloud if voice output is enabled
      if (voiceEnabled && speechOutputSupported) {
        speak(reply, getCharacter(selectedCharId));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setMessages([
        ...history,
        { role: 'assistant', content: `Oops! ${msg} Please try again.` },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, selectedCharId, voiceEnabled, speak, cancelSpeech, speechOutputSupported]);

  // Keep the bridge ref current on every render
  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  // Enter to send; Shift+Enter for a new line
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function clearChat() {
    cancelSpeech();
    setMessages([]);
    setInput('');
  }

  const activeChar = getCharacter(selectedCharId);

  // While the mic is active, show the live interim transcript in the input area
  const displayValue = isListening && interimTranscript ? interimTranscript : input;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100 font-sans">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">

          {/* Character avatar — ping animation while Buddy is speaking */}
          <div className="relative w-9 h-9 shrink-0">
            {isSpeaking && (
              <span className="absolute inset-0 rounded-full bg-indigo-400/40 animate-ping pointer-events-none" />
            )}
            <div className="relative w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-lg shadow-lg">
              {activeChar.emoji}
            </div>
          </div>

          {/* Name + status line */}
          <div>
            <h1 className="font-semibold text-white text-sm leading-tight">{activeChar.name}</h1>
            <p className={`text-xs leading-tight transition-colors ${
              isSpeaking  ? 'text-indigo-400' :
              isListening ? 'text-red-400'    :
              'text-gray-400'
            }`}>
              {isSpeaking ? 'Speaking…' : isListening ? 'Listening…' : 'Your friendly AI'}
            </p>
          </div>
        </div>

        {/* Right-side controls */}
        <div className="flex items-center gap-2">

          {/* Voice toggle — only shown when synthesis is available */}
          {speechOutputSupported && (
            <button
              onClick={() => {
                if (voiceEnabled) cancelSpeech(); // Stop speaking immediately when toggled off
                setVoiceEnabled((v) => !v);
              }}
              title={voiceEnabled ? 'Turn voice off' : 'Turn voice on'}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-all active:scale-95 ${
                voiceEnabled
                  ? 'text-indigo-300 border-indigo-600 bg-indigo-600/20 hover:bg-indigo-600/30'
                  : 'text-gray-400 border-gray-700 hover:border-gray-500 hover:text-gray-200'
              }`}
            >
              {voiceEnabled ? '🔊 Voice on' : '🔇 Voice off'}
            </button>
          )}

          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 transition-all active:scale-95"
            >
              Clear chat
            </button>
          )}
        </div>
      </header>

      {/* ── Character picker ───────────────────────────────────────────────── */}
      {/* Horizontally scrollable strip of character pills */}
      <div className="shrink-0 overflow-x-auto border-b border-gray-800 bg-gray-900/40 scrollbar-hide">
        <div className="flex gap-2 px-4 py-2.5 min-w-max">
          {CHARACTERS.map((char) => (
            <button
              key={char.id}
              onClick={() => {
                setSelectedCharId(char.id);
                cancelSpeech(); // Stop current speech when switching personas
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-95 whitespace-nowrap select-none ${
                selectedCharId === char.id
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
              }`}
            >
              <span>{char.emoji}</span>
              <span>{char.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Message list ──────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto px-4 py-6">

        {/* Empty-state welcome screen */}
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4 select-none">
            <div className="w-16 h-16 rounded-full bg-indigo-500/20 flex items-center justify-center text-3xl">
              {activeChar.emoji}
            </div>
            <div>
              <p className="font-semibold text-gray-200 text-lg">
                Hey, I&apos;m {activeChar.name}!
              </p>
              <p className="text-gray-500 text-sm mt-1">
                {speechInputSupported
                  ? 'Type or tap the mic to start talking.'
                  : 'Ask me anything — I\'m here to help.'}
              </p>
            </div>
          </div>
        )}

        <div className="space-y-4 max-w-2xl mx-auto">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex items-end gap-2 ${
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {/* Character avatar sits to the left of each assistant bubble */}
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-sm shrink-0 mb-0.5">
                  {activeChar.emoji}
                </div>
              )}

              <div
                className={`max-w-[78%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-sm shadow-md'
                    : 'bg-gray-800 text-gray-100 rounded-bl-sm shadow-sm'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {/* Animated thinking dots while waiting for the API */}
          {loading && (
            <div className="flex items-end gap-2 justify-start">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-sm shrink-0 mb-0.5">
                {activeChar.emoji}
              </div>
              <div className="bg-gray-800 px-4 py-3 rounded-2xl rounded-bl-sm shadow-sm">
                <div className="flex gap-1 items-center h-4">
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:160ms]" />
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:320ms]" />
                </div>
              </div>
            </div>
          )}

          {/* Invisible scroll anchor */}
          <div ref={bottomRef} />
        </div>
      </main>

      {/* ── Input bar ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 py-3 border-t border-gray-800 bg-gray-900/80 backdrop-blur-sm">
        <div className="flex items-end gap-2 max-w-2xl mx-auto">

          {/* Mic button — shown only when the browser supports speech recognition.
              Click toggles on/off; holding also works (push-to-talk style). */}
          {speechInputSupported && (
            <button
              onMouseDown={startListening}
              onMouseUp={stopListening}
              onTouchStart={(e) => { e.preventDefault(); startListening(); }}
              onTouchEnd={stopListening}
              onClick={isListening ? stopListening : startListening}
              aria-label={isListening ? 'Stop listening' : 'Start voice input'}
              title="Hold or click to speak"
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all active:scale-95 shrink-0 ${
                isListening
                  ? 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/40 animate-pulse'
                  : 'bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200'
              }`}
            >
              <MicIcon className="w-4 h-4" />
            </button>
          )}

          {/* Text input — disabled while listening (voice fills it) */}
          <textarea
            ref={textareaRef}
            value={displayValue}
            onChange={(e) => {
              // Ignore changes while the mic is active (prevent overwriting interim)
              if (!isListening) setInput(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            placeholder={isListening ? 'Listening…' : `Message ${activeChar.name}…`}
            rows={1}
            disabled={loading || isListening}
            className={`flex-1 bg-gray-800 text-gray-100 placeholder-gray-500 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 disabled:opacity-50 leading-relaxed transition-all ${
              isListening
                ? 'focus:ring-red-500/50 border border-red-500/40'
                : 'focus:ring-indigo-500/70'
            }`}
          />

          {/* Send button */}
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading || isListening}
            aria-label="Send message"
            className="w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition-all active:scale-95 shrink-0 shadow-md"
          >
            <SendIcon className="w-4 h-4" />
          </button>
        </div>

        <p className="text-center text-xs text-gray-600 mt-2 select-none">
          {speechInputSupported
            ? 'Enter to send · Shift+Enter for new line · Hold mic to speak'
            : 'Enter to send · Shift+Enter for new line'}
        </p>
      </div>
    </div>
  );
}
