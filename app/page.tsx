'use client';

/**
 * Buddy chat page — polished dark/light UI with voice, character switching,
 * and theme persistence via localStorage.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { CHARACTERS, getCharacter } from '@/lib/characters';
import { useVoice } from '@/hooks/useVoice';

/* ── Types ─────────────────────────────────────────────────────────────── */

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

/* ── Hooks ─────────────────────────────────────────────────────────────── */

/** Reads theme from localStorage, applies data-theme to <html>, persists changes. */
function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    // Sync React state with whatever the inline script set (or default dark)
    const saved = (localStorage.getItem('buddy-theme') as 'dark' | 'light') ?? 'dark';
    setTheme(saved);
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('buddy-theme', next);
      return next;
    });
  }, []);

  return { theme, toggle };
}

/** Auto-grows a textarea up to maxHeight px, then scrolls. */
function useAutoResize(value: string, maxHeight = 128) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [value, maxHeight]);
  return ref;
}

/* ── SVG Icons (inline, zero dependencies) ─────────────────────────────── */

type IconProps = { className?: string; style?: React.CSSProperties };

function SunIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function MicIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0M12 19v3M9 22h6" />
    </svg>
  );
}

function SendIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function ChevronDownIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function SpeakerIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

function SpeakerOffIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  );
}

function ChatIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

/* ── WaveformBars ────────────────────────────────────────────────────────
   Four animated bars that visualise audio activity while the mic is on.   */

function WaveformBars() {
  return (
    <span className="flex items-center gap-[3px]" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="w-[3px] rounded-full bg-current origin-center"
          style={{
            height: 14,
            animation: 'audio-wave 0.75s ease-in-out infinite',
            animationDelay: `${i * 0.12}s`,
          }}
        />
      ))}
    </span>
  );
}

/* ── ThemeToggle ─────────────────────────────────────────────────────────
   Animated pill switch. Circle slides left↔right; icon swaps.            */

function ThemeToggle({ theme, onToggle }: { theme: 'dark' | 'light'; onToggle: () => void }) {
  const isLight = theme === 'light';
  return (
    <button
      onClick={onToggle}
      role="switch"
      aria-checked={isLight}
      aria-label={`Switch to ${isLight ? 'dark' : 'light'} mode`}
      className="relative flex items-center w-12 h-6 rounded-full border transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      style={{
        background: isLight ? 'var(--accent-soft)' : 'var(--elevated)',
        borderColor: isLight ? 'var(--accent)' : 'var(--border)',
      }}
    >
      {/* Sliding circle */}
      <span
        className="absolute w-5 h-5 rounded-full flex items-center justify-center transition-all duration-300 shadow-sm"
        style={{
          left: isLight ? 'calc(100% - 22px)' : '2px',
          background: isLight ? 'var(--accent)' : 'var(--text-2)',
        }}
      >
        {isLight
          ? <SunIcon className="w-2.5 h-2.5 text-white" />
          : <MoonIcon className="w-2.5 h-2.5" style={{ color: 'var(--bg)' } as React.CSSProperties} />}
      </span>
    </button>
  );
}

/* ── CharacterDropdown ───────────────────────────────────────────────────
   Custom select built from scratch — no native <select>.
   Closes when you click outside or pick an option.                       */

function CharacterDropdown({
  selectedId,
  onChange,
  onSwitch,
}: {
  selectedId: string;
  onChange: (id: string) => void;
  onSwitch?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef    = useRef<HTMLDivElement>(null);
  const selected        = getCharacter(selectedId);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        style={{
          background:  open ? 'var(--elevated)' : 'transparent',
          color:       'var(--text-2)',
          border:      '1px solid',
          borderColor: open ? 'var(--border-strong)' : 'var(--border)',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-strong)'; }}
        onMouseLeave={(e) => { if (!open) { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-2)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; } }}
      >
        {selected.name}
        <ChevronDownIcon
          className="w-3 h-3 transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' } as React.CSSProperties}
        />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 w-44 rounded-xl overflow-hidden z-50 py-1"
          style={{
            background:  'var(--surface)',
            border:      '1px solid var(--border)',
            boxShadow:   '0 8px 32px var(--shadow)',
          }}
        >
          {CHARACTERS.map((char) => {
            const isActive = char.id === selectedId;
            return (
              <button
                key={char.id}
                onClick={() => { onChange(char.id); onSwitch?.(); setOpen(false); }}
                className="w-full text-left px-4 py-2 text-sm transition-colors"
                style={{
                  color:      isActive ? 'var(--accent)' : 'var(--text-2)',
                  background: isActive ? 'var(--accent-soft)' : 'transparent',
                  fontWeight: isActive ? 500 : 400,
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLButtonElement).style.background = 'var(--elevated)';
                    (e.currentTarget as HTMLButtonElement).style.color      = 'var(--text)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                    (e.currentTarget as HTMLButtonElement).style.color      = 'var(--text-2)';
                  }
                }}
              >
                {char.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */

export default function ChatPage() {
  const [messages,        setMessages]        = useState<Message[]>([]);
  const [input,           setInput]           = useState('');
  const [loading,         setLoading]         = useState(false);
  const [voiceEnabled,    setVoiceEnabled]    = useState(false);
  const [selectedCharId,  setSelectedCharId]  = useState('buddy');

  const { theme, toggle: toggleTheme } = useTheme();
  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useAutoResize(input);

  // Bridge ref so the stable voice callback always calls the latest sendMessage
  const sendMessageRef = useRef<((text?: string) => Promise<void>) | null>(null);

  const handleVoiceTranscript = useCallback((text: string) => {
    sendMessageRef.current?.(text);
  }, []);

  const {
    isListening, isSpeaking, interimTranscript, micError,
    startListening, stopListening, speak, cancelSpeech,
    speechInputSupported, speechOutputSupported,
  } = useVoice(handleVoiceTranscript, voiceEnabled);

  // ── Scroll to latest message ───────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // ── Core send ──────────────────────────────────────────────────────────
  /**
   * Send a message to /api/chat.
   * @param textOverride  Bypasses the textarea (used for voice input).
   */
  const sendMessage = useCallback(async (textOverride?: string) => {
    const text = (textOverride !== undefined ? textOverride : input).trim();
    if (!text || loading) return;

    const userMsg: Message = { role: 'user', content: text };
    const history = [...messages, userMsg];

    setMessages(history);
    if (textOverride === undefined) setInput('');
    setLoading(true);
    cancelSpeech();

    try {
      const res  = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ messages: history, character: selectedCharId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'API error');

      const reply: string = data.reply;
      setMessages([...history, { role: 'assistant', content: reply }]);

      if (voiceEnabled && speechOutputSupported) {
        speak(reply, getCharacter(selectedCharId));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setMessages([...history, { role: 'assistant', content: `Something went wrong — ${msg} Please try again.` }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, selectedCharId, voiceEnabled, speak, cancelSpeech, speechOutputSupported]);

  // Keep bridge ref current
  useEffect(() => { sendMessageRef.current = sendMessage; }, [sendMessage]);

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

  const activeChar   = getCharacter(selectedCharId);
  // Show live interim transcript in the input area while mic is active
  const displayValue = isListening && interimTranscript ? interimTranscript : input;

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <div
      className="flex flex-col h-screen"
      style={{ background: 'var(--bg)', color: 'var(--text)' }}
    >

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header
        className="flex items-center justify-between px-4 h-14 shrink-0 border-b"
        style={{
          background:  'var(--surface)',
          borderColor: 'var(--border)',
        }}
      >
        {/* Wordmark + speaking indicator */}
        <div className="flex items-center gap-3">
          {/* Small avatar circle — pulses while Buddy is speaking */}
          <div className="relative w-7 h-7 shrink-0">
            {isSpeaking && (
              <span
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{
                  background: 'var(--accent)',
                  animation:  'ping-ring 1.2s ease-out infinite',
                }}
              />
            )}
            <div
              className="relative w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              {activeChar.name[0]}
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--text)' }}>
              Buddy
            </p>
            <p
              className="text-xs leading-tight transition-colors"
              style={{ color: isSpeaking ? 'var(--accent)' : isListening ? '#f87171' : 'var(--text-3)' }}
            >
              {isSpeaking ? 'Speaking' : isListening ? 'Listening' : activeChar.name}
            </p>
          </div>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2">
          <CharacterDropdown
            selectedId={selectedCharId}
            onChange={setSelectedCharId}
            onSwitch={cancelSpeech}
          />

          {/* Voice output toggle */}
          {speechOutputSupported && (
            <button
              onClick={() => { if (voiceEnabled) cancelSpeech(); setVoiceEnabled((v) => !v); }}
              aria-label={voiceEnabled ? 'Turn voice off' : 'Turn voice on'}
              title={voiceEnabled ? 'Turn voice off' : 'Turn voice on'}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
              style={{
                background:  voiceEnabled ? 'var(--accent-soft)' : 'transparent',
                color:       voiceEnabled ? 'var(--accent)' : 'var(--text-3)',
                border:      '1px solid',
                borderColor: voiceEnabled ? 'var(--accent)' : 'var(--border)',
              }}
            >
              {voiceEnabled
                ? <SpeakerIcon className="w-3.5 h-3.5" />
                : <SpeakerOffIcon className="w-3.5 h-3.5" />}
            </button>
          )}

          {/* Light/dark toggle */}
          <ThemeToggle theme={theme} onToggle={toggleTheme} />

          {/* Clear chat — only visible when there are messages */}
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="h-8 px-3 rounded-lg text-xs font-medium transition-colors"
              style={{
                color:       'var(--text-3)',
                border:      '1px solid var(--border)',
                background:  'transparent',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color       = 'var(--text)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-strong)';
                (e.currentTarget as HTMLButtonElement).style.background  = 'var(--elevated)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color       = 'var(--text-3)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
                (e.currentTarget as HTMLButtonElement).style.background  = 'transparent';
              }}
            >
              Clear
            </button>
          )}
        </div>
      </header>

      {/* ── Messages ────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-3">

          {/* Empty state */}
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center gap-5 py-20 select-none text-center">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
              >
                <ChatIcon className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <p className="font-semibold text-base" style={{ color: 'var(--text)' }}>
                  Start a conversation
                </p>
                <p className="text-sm" style={{ color: 'var(--text-3)' }}>
                  {speechInputSupported
                    ? 'Type a message or tap the mic to speak.'
                    : 'Type a message below to get started.'}
                </p>
              </div>
            </div>
          )}

          {/* Mic permission error banner */}
          {micError && (
            <div
              className="rounded-xl px-4 py-3 text-sm msg-enter"
              style={{
                background:  'rgba(239,68,68,0.08)',
                border:      '1px solid rgba(239,68,68,0.2)',
                color:       '#fca5a5',
              }}
            >
              {micError}
            </div>
          )}

          {/* Message bubbles */}
          {messages.map((msg, i) => {
            const isUser = msg.role === 'user';
            return (
              <div key={i} className={`flex items-end gap-2.5 msg-enter ${isUser ? 'justify-end' : 'justify-start'}`}>

                {/* Character initial — left side of assistant messages */}
                {!isUser && (
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 mb-0.5"
                    style={{ background: 'var(--accent)', color: '#fff' }}
                  >
                    {activeChar.name[0]}
                  </div>
                )}

                <div
                  className="max-w-[75%] px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words"
                  style={{
                    background:   isUser ? 'var(--user-bg)'   : 'var(--buddy-bg)',
                    color:        isUser ? 'var(--user-text)'  : 'var(--buddy-text)',
                    borderRadius: isUser
                      ? '18px 18px 4px 18px'
                      : '18px 18px 18px 4px',
                  }}
                >
                  {msg.content}
                </div>
              </div>
            );
          })}

          {/* Thinking indicator */}
          {loading && (
            <div className="flex items-end gap-2.5 justify-start msg-enter">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 mb-0.5"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                {activeChar.name[0]}
              </div>
              <div
                className="px-4 py-3 flex items-center gap-1"
                style={{
                  background:   'var(--buddy-bg)',
                  borderRadius: '18px 18px 18px 4px',
                }}
              >
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      background:      'var(--text-3)',
                      animation:       'audio-wave 1s ease-in-out infinite',
                      animationDelay:  `${i * 0.2}s`,
                      display:         'inline-block',
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </main>

      {/* ── Input bar ───────────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 py-3" style={{ background: 'var(--bg)' }}>
        {/* Floating card */}
        <div
          className="flex items-end gap-2 max-w-2xl mx-auto rounded-2xl px-3 py-2"
          style={{
            background:  'var(--surface)',
            border:      '1px solid var(--border)',
            boxShadow:   '0 4px 24px var(--shadow)',
          }}
        >
          {/* Mic button */}
          {speechInputSupported && (
            <button
              onMouseDown={startListening}
              onMouseUp={stopListening}
              onTouchStart={(e) => { e.preventDefault(); startListening(); }}
              onTouchEnd={stopListening}
              onClick={isListening ? stopListening : startListening}
              aria-label={isListening ? 'Stop listening' : 'Start voice input'}
              title="Hold or click to speak"
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors mb-0.5"
              style={{
                background: isListening ? 'rgba(239,68,68,0.12)' : 'transparent',
                color:      isListening ? '#f87171' : 'var(--text-3)',
                border:     '1px solid',
                borderColor: isListening ? 'rgba(239,68,68,0.3)' : 'transparent',
              }}
            >
              {/* Show animated waveform while listening, mic icon when idle */}
              {isListening ? <WaveformBars /> : <MicIcon className="w-4 h-4" />}
            </button>
          )}

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={displayValue}
            onChange={(e) => { if (!isListening) setInput(e.target.value); }}
            onKeyDown={handleKeyDown}
            placeholder={isListening ? 'Listening…' : `Message ${activeChar.name}…`}
            rows={1}
            disabled={loading || isListening}
            className="flex-1 bg-transparent text-sm resize-none focus:outline-none leading-relaxed py-1.5 disabled:opacity-50"
            style={{
              color:       'var(--text)',
              caretColor:  'var(--accent)',
            }}
          />

          {/* Send button */}
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading || isListening}
            aria-label="Send message"
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all active:scale-95 mb-0.5 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: 'var(--accent)',
              color:      '#fff',
            }}
            onMouseEnter={(e) => {
              if (!(e.currentTarget as HTMLButtonElement).disabled)
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-hover)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent)';
            }}
          >
            <SendIcon className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Hint text */}
        <p className="text-center text-[11px] mt-2 select-none" style={{ color: 'var(--text-3)' }}>
          {speechInputSupported
            ? 'Enter to send · Shift+Enter for new line · Hold mic to speak'
            : 'Enter to send · Shift+Enter for new line'}
        </p>
      </div>
    </div>
  );
}
