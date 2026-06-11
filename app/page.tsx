'use client';

/**
 * Buddy chat page.
 *
 * Layout  : left sidebar (conversation history) + right chat area.
 * Storage : conversations → lib/conversations.ts, custom chars → lib/customCharacters.ts.
 * AI      : streaming chat via /api/chat, character enrichment via /api/enrich-character.
 *
 * The storage layers are fully decoupled from UI — swap either for a database
 * without touching any component code.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { CHARACTERS, getCharacter }                  from '@/lib/characters';
import { useVoice }                                  from '@/hooks/useVoice';
import { useConversations }                          from '@/hooks/useConversations';
import { useCustomCharacters }                       from '@/hooks/useCustomCharacters';
import { buildCustomCharacter }                      from '@/lib/customCharacters';
import type { CustomCharacter }                      from '@/hooks/useCustomCharacters';
import {
  type Message,
  type Conversation,
  generateId,
  generateTitle,
  formatRelativeTime,
} from '@/lib/conversations';

/* ── Hooks ─────────────────────────────────────────────────────────────── */

function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  useEffect(() => {
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

/* ── SVG Icons ──────────────────────────────────────────────────────────── */

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
function SpinnerIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
        style={{ animation: 'spin 1s linear infinite', transformOrigin: 'center' }}
      />
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
function HamburgerIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6"  x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}
function PlusIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5"  y1="12" x2="19" y2="12" />
    </svg>
  );
}
function TrashIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}
function XIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6"  y2="18" />
      <line x1="6"  y1="6" x2="18" y2="18" />
    </svg>
  );
}
function EditIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

/* ── WaveformBars ────────────────────────────────────────────────────────── */

function WaveformBars() {
  return (
    <span className="flex items-center gap-[3px]" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="w-[3px] rounded-full bg-current origin-center"
          style={{ height: 14, animation: 'audio-wave 0.75s ease-in-out infinite', animationDelay: `${i * 0.12}s` }}
        />
      ))}
    </span>
  );
}

/* ── ThemeToggle ─────────────────────────────────────────────────────────── */

function ThemeToggle({ theme, onToggle }: { theme: 'dark' | 'light'; onToggle: () => void }) {
  const isLight = theme === 'light';
  return (
    <button onClick={onToggle} role="switch" aria-checked={isLight}
      aria-label={`Switch to ${isLight ? 'dark' : 'light'} mode`}
      className="relative flex items-center w-12 h-6 rounded-full border transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      style={{ background: isLight ? 'var(--accent-soft)' : 'var(--elevated)', borderColor: isLight ? 'var(--accent)' : 'var(--border)' }}
    >
      <span className="absolute w-5 h-5 rounded-full flex items-center justify-center transition-all duration-300 shadow-sm"
        style={{ left: isLight ? 'calc(100% - 22px)' : '2px', background: isLight ? 'var(--accent)' : 'var(--text-2)' }}
      >
        {isLight
          ? <SunIcon className="w-2.5 h-2.5 text-white" />
          : <MoonIcon className="w-2.5 h-2.5" style={{ color: 'var(--bg)' } as React.CSSProperties} />}
      </span>
    </button>
  );
}

/* ── CharacterDropdown ───────────────────────────────────────────────────
   Shows preset characters, then any user-created characters (with delete
   buttons), then a "+ Create Character" action at the bottom.             */

function CharacterDropdown({
  selectedId,
  onChange,
  onSwitch,
  customCharacters,
  onDeleteCustom,
  onCreateNew,
}: {
  selectedId: string;
  onChange: (id: string) => void;
  onSwitch?: () => void;
  customCharacters: CustomCharacter[];
  onDeleteCustom: (id: string) => void;
  onCreateNew: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef    = useRef<HTMLDivElement>(null);

  // Resolve display name for the currently selected character (preset or custom)
  const selectedPreset = CHARACTERS.find((c) => c.id === selectedId);
  const selectedCustom = customCharacters.find((c) => c.id === selectedId);
  const displayName    = selectedPreset?.name ?? selectedCustom?.name ?? 'Buddy';

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function select(id: string) {
    onChange(id);
    onSwitch?.();
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
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
        {displayName}
        <ChevronDownIcon className="w-3 h-3 transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' } as React.CSSProperties}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-52 rounded-xl overflow-hidden z-50 py-1"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 8px 32px var(--shadow)' }}
        >
          {/* ── Preset characters ──────────────────────────────────────── */}
          {CHARACTERS.map((char) => {
            const isActive = char.id === selectedId;
            return (
              <button key={char.id} onClick={() => select(char.id)}
                className="w-full text-left px-4 py-2 text-sm transition-colors"
                style={{ color: isActive ? 'var(--accent)' : 'var(--text-2)', background: isActive ? 'var(--accent-soft)' : 'transparent', fontWeight: isActive ? 500 : 400 }}
                onMouseEnter={(e) => { if (!isActive) { (e.currentTarget as HTMLButtonElement).style.background = 'var(--elevated)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)'; } }}
                onMouseLeave={(e) => { if (!isActive) { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-2)'; } }}
              >
                {char.name}
              </button>
            );
          })}

          {/* ── Custom characters (if any) ─────────────────────────────── */}
          {customCharacters.length > 0 && (
            <>
              {/* Divider */}
              <div className="mx-3 my-1" style={{ height: 1, background: 'var(--border)' }} />
              <p className="px-4 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
                Custom
              </p>
              {customCharacters.map((char) => {
                const isActive = char.id === selectedId;
                return (
                  // Outer div handles selection; inner button handles deletion
                  <div key={char.id}
                    className="group flex items-center px-4 py-2 text-sm cursor-pointer transition-colors"
                    style={{ color: isActive ? 'var(--accent)' : 'var(--text-2)', background: isActive ? 'var(--accent-soft)' : 'transparent', fontWeight: isActive ? 500 : 400 }}
                    onClick={() => select(char.id)}
                    onMouseEnter={(e) => { if (!isActive) { (e.currentTarget as HTMLDivElement).style.background = 'var(--elevated)'; (e.currentTarget as HTMLDivElement).style.color = 'var(--text)'; } }}
                    onMouseLeave={(e) => { if (!isActive) { (e.currentTarget as HTMLDivElement).style.background = isActive ? 'var(--accent-soft)' : 'transparent'; (e.currentTarget as HTMLDivElement).style.color = isActive ? 'var(--accent)' : 'var(--text-2)'; } }}
                  >
                    <span className="flex-1 truncate">{char.name}</span>
                    {/* Delete button — stops propagation so clicking it doesn't select */}
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteCustom(char.id); }}
                      className="ml-2 w-5 h-5 shrink-0 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: 'var(--text-3)' }}
                      aria-label={`Delete ${char.name}`}
                      title={`Delete ${char.name}`}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#f87171'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-3)'; }}
                    >
                      <TrashIcon className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </>
          )}

          {/* ── Create Character action ─────────────────────────────────── */}
          <div className="mx-3 my-1" style={{ height: 1, background: 'var(--border)' }} />
          <button
            onClick={() => { setOpen(false); onCreateNew(); }}
            className="w-full text-left px-4 py-2 text-sm flex items-center gap-2 transition-colors"
            style={{ color: 'var(--accent)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-soft)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            <PlusIcon className="w-3.5 h-3.5 shrink-0" />
            Create Character
          </button>
        </div>
      )}
    </div>
  );
}

/* ── StreamingBubble ─────────────────────────────────────────────────────
   Word-by-word fade-in: React reuses existing span nodes (same key =
   same DOM element) so only newly appended words animate.               */

function StreamingBubble({ content }: { content: string }) {
  const words = content.split(' ');
  return (
    <>
      {words.map((word, i) => (
        <span key={i} style={{ display: 'inline', animation: 'word-in 0.15s ease both', animationDelay: `${Math.min(i * 25, 600)}ms` }}>
          {word}{i < words.length - 1 ? ' ' : ''}
        </span>
      ))}
      <span style={{ display: 'inline-block', width: '2px', height: '0.85em', background: 'var(--text-3)', animation: 'audio-wave 0.8s ease-in-out infinite', verticalAlign: 'middle', marginLeft: '2px' }} />
    </>
  );
}

/* ── GeminiWave ──────────────────────────────────────────────────────────────
   Canvas-based animated sine-wave visualization inspired by Gemini's audio UI.
   Reads the latest mode from a ref so the animation loop never needs restarting.
   Speaking mode: blue / purple / teal. Listening mode: red / orange / amber.  */

function GeminiWave({ mode }: { mode: 'speaking' | 'listening' | null }) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const modeRef    = useRef(mode);
  const opacityRef = useRef(0);
  const frameRef   = useRef(0);

  // Keep the ref current without restarting the animation loop
  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const c = ctx; // non-null alias so TypeScript sees it as non-null inside draw()
    const W = canvas.width;
    const H = canvas.height;

    const SPEAKING = [
      { color: '#818cf8', amp: 8,  freq: 0.024, speed: 0.040, phase: 0.0 },
      { color: '#38bdf8', amp: 6,  freq: 0.017, speed: 0.028, phase: 1.8 },
      { color: '#a78bfa', amp: 9,  freq: 0.031, speed: 0.052, phase: 3.6 },
      { color: '#34d399', amp: 4,  freq: 0.019, speed: 0.022, phase: 2.7 },
    ];
    const LISTENING = [
      { color: '#f87171', amp: 7,  freq: 0.026, speed: 0.048, phase: 0.0 },
      { color: '#fb923c', amp: 9,  freq: 0.020, speed: 0.036, phase: 2.1 },
      { color: '#fbbf24', amp: 5,  freq: 0.014, speed: 0.028, phase: 1.4 },
    ];

    let raf: number;

    function draw() {
      const currentMode = modeRef.current;
      const target = currentMode !== null ? 1 : 0;

      opacityRef.current += (target - opacityRef.current) * 0.07;
      if (Math.abs(opacityRef.current - target) < 0.003) opacityRef.current = target;

      c.clearRect(0, 0, W, H);

      if (opacityRef.current > 0.01) {
        frameRef.current++;
        const waves = currentMode === 'listening' ? LISTENING : SPEAKING;

        waves.forEach((wave, i) => {
          c.beginPath();
          c.strokeStyle = wave.color;
          c.lineWidth   = 1.5;
          c.globalAlpha = opacityRef.current * (0.45 + i * 0.15);
          for (let x = 0; x <= W; x++) {
            const y = H / 2 + Math.sin(x * wave.freq + frameRef.current * wave.speed + wave.phase) * wave.amp;
            if (x === 0) c.moveTo(x, y); else c.lineTo(x, y);
          }
          c.stroke();
        });

        c.globalAlpha = 1;
      }

      raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []); // intentionally empty — reads mode from ref

  return <canvas ref={canvasRef} width={140} height={28} style={{ display: 'block' }} />;
}

/* ── MessageText ─────────────────────────────────────────────────────────────
   Parses *action text* expressions from character messages and renders them
   as italic, violet-tinted text to signal physical emotion/gesture cues.    */

function MessageText({ content }: { content: string }) {
  const parts = content.split(/(\*[^*\n]+\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^\*[^*]+\*$/.test(part) ? (
          <em key={i} style={{ color: '#a78bfa', fontSize: '0.88em', fontStyle: 'italic', opacity: 0.9 }}>
            {part}
          </em>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

/* ── ConversationItem ────────────────────────────────────────────────────── */

function ConversationItem({
  conv, isActive, onSelect, onDelete,
}: {
  conv: Conversation;
  isActive: boolean;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const char = getCharacter(conv.characterId);
  return (
    <div role="button" tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative flex items-center gap-2 px-3 py-2.5 mx-2 mb-0.5 rounded-lg cursor-pointer transition-colors"
      style={{ background: isActive ? 'var(--accent-soft)' : hovered ? 'var(--elevated)' : 'transparent' }}
    >
      <div className="flex-1 min-w-0 pr-1">
        <p className="text-sm font-medium truncate leading-snug" style={{ color: isActive ? 'var(--accent)' : 'var(--text)' }}>
          {conv.title}
        </p>
        <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--text-3)' }}>
          {char.name} · {formatRelativeTime(conv.updatedAt)}
        </p>
      </div>
      {(hovered || isActive) && (
        <button onClick={onDelete} aria-label="Delete conversation" title="Delete conversation"
          className="w-6 h-6 shrink-0 flex items-center justify-center rounded-md transition-colors"
          style={{ color: 'var(--text-3)' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#f87171'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-3)'; }}
        >
          <TrashIcon className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

/* ── Sidebar ─────────────────────────────────────────────────────────────── */

function Sidebar({
  conversations, activeId, isOpen, onNew, onSelect, onDelete,
}: {
  conversations: Conversation[];
  activeId: string | null;
  isOpen: boolean;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <aside
      className={[
        'fixed inset-y-0 left-0 z-40 flex flex-col w-64',
        'transition-transform duration-[220ms] ease-in-out',
        'md:relative md:z-auto md:translate-x-0',
        isOpen ? 'translate-x-0' : '-translate-x-full',
      ].join(' ')}
      style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)' }}
    >
      <div className="p-3 shrink-0">
        <button onClick={onNew}
          className="w-full flex items-center gap-2 h-9 px-3 rounded-lg text-sm font-medium transition-colors"
          style={{ background: 'var(--elevated)', color: 'var(--text)', border: '1px solid var(--border)' }}
          onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.background = 'var(--accent-soft)'; b.style.color = 'var(--accent)'; b.style.borderColor = 'var(--accent)'; }}
          onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.background = 'var(--elevated)'; b.style.color = 'var(--text)'; b.style.borderColor = 'var(--border)'; }}
        >
          <PlusIcon className="w-4 h-4 shrink-0" />
          New Chat
        </button>
      </div>
      <div className="mx-3 mb-2 shrink-0" style={{ height: 1, background: 'var(--border)' }} />
      <div className="flex-1 overflow-y-auto pb-4 scrollbar-hide">
        {conversations.length === 0 ? (
          <div className="px-5 py-6 text-center">
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
              No conversations yet. Start chatting to save your first one.
            </p>
          </div>
        ) : (
          conversations.map((conv) => (
            <ConversationItem key={conv.id} conv={conv} isActive={conv.id === activeId}
              onSelect={() => onSelect(conv.id)}
              onDelete={(e) => { e.stopPropagation(); onDelete(conv.id); }}
            />
          ))
        )}
      </div>
    </aside>
  );
}

/* ── buildFallbackPrompt (client-side) ───────────────────────────────────
   Used when /api/enrich-character fails entirely (network error etc.).
   Mirrors the server-side fallback in api/enrich-character/route.ts.     */

function buildFallbackPrompt(name: string, desc: string, style: string): string {
  const parts = [`You are ${name}, a character with a distinct and consistent personality.`];
  if (desc)  parts.push(desc);
  if (style) parts.push(`Your speaking style: ${style}.`);
  parts.push('Stay in character at all times. Be engaging, consistent, and true to your personality.');
  return parts.join('\n\n');
}

/* ── CharacterCreatorModal ───────────────────────────────────────────────
   Multi-step panel:
   1. User fills name, description, speaking style, voice gender.
   2. On submit → POST /api/enrich-character (Groq researches the character).
   3. On success → CustomCharacter is assembled and passed to onCreate().
   4. On "not found" → friendly notice is shown before the modal closes.  */

function CharacterCreatorModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (char: CustomCharacter) => void;
}) {
  const [name,        setName]        = useState('');
  const [description, setDescription] = useState('');
  const [style,       setStyle]       = useState('');
  const [gender,      setGender]      = useState<'any' | 'female' | 'male'>('any');
  const [loading,     setLoading]     = useState(false);
  const [notFound,    setNotFound]    = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  // Close on Escape (unless a creation is in-flight)
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape' && !loading) onClose();
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [loading, onClose]);

  async function handleCreate() {
    if (!name.trim() || loading) return;
    setLoading(true);
    setError(null);
    setNotFound(false);

    let systemPrompt: string;
    let found = true;

    try {
      const res = await fetch('/api/enrich-character', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: name.trim(), description, speakingStyle: style }),
      });

      if (!res.ok) {
        // API error — fall back to client-built prompt
        systemPrompt = buildFallbackPrompt(name.trim(), description, style);
        found = false;
      } else {
        const data = await res.json() as { systemPrompt: string; notFound: boolean };
        systemPrompt = data.systemPrompt;
        found = !data.notFound;
      }
    } catch {
      // Network error — fall back to client-built prompt
      systemPrompt = buildFallbackPrompt(name.trim(), description, style);
      found = false;
    }

    if (!found) {
      // Show the friendly notice so the user understands why the character
      // might feel thinner, then let it close automatically after a beat.
      setNotFound(true);
      await new Promise((r) => setTimeout(r, 2200));
    }

    const char = buildCustomCharacter({
      name:         name.trim(),
      description,
      speakingStyle: style,
      voiceGender:  gender,
      systemPrompt,
    });

    onCreate(char);
    setLoading(false);
  }

  // ── Input field style helpers ──────────────────────────────────────────
  const fieldBase: React.CSSProperties = {
    background:  'var(--elevated)',
    color:       'var(--text)',
    border:      '1px solid var(--border)',
    caretColor:  'var(--accent)',
    borderRadius: '8px',
  };
  function onFocus(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
    (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)';
  }
  function onBlur(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
    (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
  }

  return (
    // Backdrop — click outside to dismiss (unless loading)
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl shadow-2xl flex flex-col"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '90vh' }}
      >
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
              Create a Character
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
              Buddy will research the character and build their personality.
            </p>
          </div>
          {!loading && (
            <button onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
              style={{ color: 'var(--text-3)' }}
              onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.color = 'var(--text)'; b.style.background = 'var(--elevated)'; }}
              onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.color = 'var(--text-3)'; b.style.background = 'transparent'; }}
            >
              <XIcon className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* ── Form ──────────────────────────────────────────────────────── */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto">

          {/* Name */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>
              Character Name <span style={{ color: 'var(--accent)' }}>*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              placeholder='e.g. Sherlock Holmes, Yoda, Marie Curie...'
              disabled={loading}
              className="w-full px-3 py-2 text-sm disabled:opacity-50 focus:outline-none"
              style={fieldBase}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>
              Description <span className="font-normal" style={{ color: 'var(--text-3)' }}>(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Personality, backstory, quirks — any extra context..."
              disabled={loading}
              rows={3}
              className="w-full px-3 py-2 text-sm resize-none disabled:opacity-50 focus:outline-none"
              style={fieldBase}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          </div>

          {/* Speaking style */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>
              Speaking Style <span className="font-normal" style={{ color: 'var(--text-3)' }}>(optional)</span>
            </label>
            <input
              type="text"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              placeholder='"speaks in riddles", "very formal", "uses 1800s slang"...'
              disabled={loading}
              className="w-full px-3 py-2 text-sm disabled:opacity-50 focus:outline-none"
              style={fieldBase}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          </div>

          {/* Voice gender */}
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-2)' }}>
              Voice
            </label>
            <div className="flex gap-2">
              {(['any', 'female', 'male'] as const).map((g) => (
                <button key={g}
                  onClick={() => !loading && setGender(g)}
                  className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    background:  gender === g ? 'var(--accent-soft)' : 'var(--elevated)',
                    color:       gender === g ? 'var(--accent)'      : 'var(--text-2)',
                    border:      '1px solid',
                    borderColor: gender === g ? 'var(--accent)'      : 'var(--border)',
                  }}
                >
                  {g === 'any' ? 'Neutral' : g.charAt(0).toUpperCase() + g.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* "Not found" notice */}
          {notFound && (
            <div className="rounded-lg px-3 py-2.5 text-xs"
              style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', color: '#fbbf24' }}
            >
              I couldn't find much about "{name}" in my knowledge — creating from your description instead. The character will do their best!
            </div>
          )}

          {/* Error notice */}
          {error && (
            <div className="rounded-lg px-3 py-2.5 text-xs"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}
            >
              {error}
            </div>
          )}
        </div>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <div className="flex justify-end gap-2 px-6 pb-5 pt-3 shrink-0"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <button onClick={onClose} disabled={loading}
            className="h-9 px-4 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
            style={{ background: 'var(--elevated)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
          >
            Cancel
          </button>
          <button onClick={handleCreate} disabled={!name.trim() || loading}
            className="h-9 px-5 rounded-lg text-sm font-medium transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            {loading ? (
              <>
                <SpinnerIcon className="w-3.5 h-3.5" />
                {notFound ? 'Almost there…' : 'Building character…'}
              </>
            ) : (
              <>
                <EditIcon className="w-3.5 h-3.5" />
                Create
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */

export default function ChatPage() {
  // ── Chat state ────────────────────────────────────────────────────────────
  const [messages,         setMessages]         = useState<Message[]>([]);
  const [input,            setInput]            = useState('');
  const [loading,          setLoading]          = useState(false);
  const [isStreaming,      setIsStreaming]       = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [voiceEnabled,     setVoiceEnabled]     = useState(false);
  const [selectedCharId,   setSelectedCharId]   = useState('buddy');

  // ── Sidebar / modal state ─────────────────────────────────────────────────
  const [sidebarOpen,  setSidebarOpen]  = useState(false);
  const [creatorOpen,  setCreatorOpen]  = useState(false);

  // ── Active conversation ───────────────────────────────────────────────────
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const activeConvRef               = useRef<Conversation | null>(null);
  useEffect(() => { activeConvRef.current = activeConv; }, [activeConv]);

  // ── Persistent data ───────────────────────────────────────────────────────
  const { conversations, upsert: upsertConversation, remove: removeConversation } = useConversations();
  const { customCharacters, add: addCustomCharacter, remove: removeCustomCharacter } = useCustomCharacters();

  const { theme, toggle: toggleTheme } = useTheme();
  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useAutoResize(input);

  // Bridge ref: stable voice callback always calls the latest sendMessage
  const sendMessageRef = useRef<((text?: string) => Promise<void>) | null>(null);
  const handleVoiceTranscript = useCallback((text: string) => {
    sendMessageRef.current?.(text);
  }, []);

  const {
    micState, isSpeaking, micError,
    startListening, stopListening, speak, cancelSpeech,
    micSupported, synthSupported,
  } = useVoice(handleVoiceTranscript, voiceEnabled);

  const isListening  = micState === 'recording';
  const isProcessing = micState === 'processing';

  // Drive the GeminiWave — speaking takes priority if somehow both are true
  const waveMode: 'speaking' | 'listening' | null =
    isSpeaking  ? 'speaking'  :
    isListening ? 'listening' :
    null;

  // Resolve the full character object for whichever id is selected
  const activeChar = selectedCharId.startsWith('custom-')
    ? (customCharacters.find((c) => c.id === selectedCharId) ?? CHARACTERS[0])
    : getCharacter(selectedCharId);

  // ── Scroll to bottom ───────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: isStreaming ? 'auto' : 'smooth' });
  }, [messages, loading, streamingContent, isStreaming]);

  // ── Conversation handlers ──────────────────────────────────────────────────

  const handleNewChat = useCallback(() => {
    cancelSpeech();
    setMessages([]);
    setInput('');
    setActiveConv(null);
    setSidebarOpen(false);
  }, [cancelSpeech]);

  const handleSelectConversation = useCallback((id: string) => {
    const conv = conversations.find((c) => c.id === id);
    if (!conv) return;
    cancelSpeech();
    setMessages(conv.messages);
    setSelectedCharId(conv.characterId);
    setActiveConv(conv);
    setInput('');
    setSidebarOpen(false);
  }, [conversations, cancelSpeech]);

  const handleDeleteConversation = useCallback((id: string) => {
    removeConversation(id);
    if (activeConvRef.current?.id === id) {
      setMessages([]);
      setInput('');
      setActiveConv(null);
    }
  }, [removeConversation]);

  // ── Custom character handlers ──────────────────────────────────────────────

  /** Called when the creator modal finishes building a character. */
  const handleCharacterCreate = useCallback((char: CustomCharacter) => {
    addCustomCharacter(char);
    setSelectedCharId(char.id);
    setCreatorOpen(false);
    // Start a fresh chat with the new character
    cancelSpeech();
    setMessages([]);
    setInput('');
    setActiveConv(null);
  }, [addCustomCharacter, cancelSpeech]);

  /** Delete a custom character; revert to Buddy if it was active. */
  const handleDeleteCustomChar = useCallback((id: string) => {
    removeCustomCharacter(id);
    if (selectedCharId === id) {
      setSelectedCharId('buddy');
      cancelSpeech();
      setMessages([]);
      setActiveConv(null);
    }
  }, [removeCustomCharacter, selectedCharId, cancelSpeech]);

  // ── Core send ──────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (textOverride?: string) => {
    const text = (textOverride !== undefined ? textOverride : input).trim();
    if (!text || loading || isStreaming) return;

    const userMsg: Message = { role: 'user', content: text };
    const history          = [...messages, userMsg];

    setMessages(history);
    if (textOverride === undefined) setInput('');
    setLoading(true);
    setStreamingContent('');
    cancelSpeech();

    // Determine the character driving this message (custom chars send their
    // system prompt because they don't exist in the server-side character list)
    const isCustom       = selectedCharId.startsWith('custom-');
    const customChar     = isCustom
      ? customCharacters.find((c) => c.id === selectedCharId)
      : undefined;
    const customPrompt   = customChar?.systemPrompt;

    try {
      const res = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages:  history,
          character: selectedCharId,
          ...(customPrompt ? { customSystemPrompt: customPrompt } : {}),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error((errData as { error?: string }).error ?? 'API error');
      }
      if (!res.body) throw new Error('No response body');

      setLoading(false);
      setIsStreaming(true);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText  = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        setStreamingContent(fullText);
      }
      fullText += decoder.decode();

      const completedMessages: Message[] = [
        ...history,
        { role: 'assistant', content: fullText },
      ];

      setIsStreaming(false);
      setStreamingContent('');
      setMessages(completedMessages);

      // Auto-save conversation
      const now     = Date.now();
      const current = activeConvRef.current;
      if (current) {
        const updated: Conversation = { ...current, messages: completedMessages, characterId: selectedCharId, updatedAt: now };
        setActiveConv(updated);
        upsertConversation(updated);
      } else {
        const newConv: Conversation = {
          id:          generateId(),
          title:       generateTitle(userMsg.content),
          characterId: selectedCharId,
          messages:    completedMessages,
          createdAt:   now,
          updatedAt:   now,
        };
        setActiveConv(newConv);
        upsertConversation(newConv);
      }

      if (voiceEnabled) speak(fullText, activeChar);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setMessages([...history, { role: 'assistant', content: `Something went wrong — ${msg} Please try again.` }]);
    } finally {
      setLoading(false);
      setIsStreaming(false);
    }
  }, [input, loading, isStreaming, messages, selectedCharId, customCharacters, voiceEnabled, speak, cancelSpeech, upsertConversation, activeChar]);

  useEffect(() => { sendMessageRef.current = sendMessage; }, [sendMessage]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  /* ── Render ────────────────────────────────────────────────────────────── */
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)', color: 'var(--text)' }}>

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 md:hidden" style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={() => setSidebarOpen(false)} />
      )}

      {/* Character creator modal */}
      {creatorOpen && (
        <CharacterCreatorModal
          onClose={() => setCreatorOpen(false)}
          onCreate={handleCharacterCreate}
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <Sidebar
        conversations={conversations}
        activeId={activeConv?.id ?? null}
        isOpen={sidebarOpen}
        onNew={handleNewChat}
        onSelect={handleSelectConversation}
        onDelete={handleDeleteConversation}
      />

      {/* ── Chat column ─────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 h-full">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <header className="flex items-center justify-between px-4 h-14 shrink-0 border-b"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-3">
            {/* Hamburger — mobile only */}
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="w-8 h-8 md:hidden flex items-center justify-center rounded-lg transition-colors"
              aria-label="Toggle sidebar"
              style={{ color: 'var(--text-3)' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-3)'; }}
            >
              <HamburgerIcon className="w-4 h-4" />
            </button>

            {/* Avatar — pulses while speaking */}
            <div className="relative w-7 h-7 shrink-0">
              {isSpeaking && (
                <span className="absolute inset-0 rounded-full pointer-events-none"
                  style={{ background: 'var(--accent)', animation: 'ping-ring 1.2s ease-out infinite' }}
                />
              )}
              <div className="relative w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                {activeChar.name[0]}
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--text)' }}>Buddy</p>
              <div className="relative" style={{ height: 20 }}>
                {/* Static subtitle — fades out when wave is active */}
                <p className="text-xs absolute inset-0 flex items-center transition-opacity duration-300"
                  style={{ color: 'var(--text-3)', opacity: waveMode !== null ? 0 : 1, pointerEvents: 'none' }}
                >
                  {activeChar.name}
                </p>
                {/* Animated wave — canvas manages its own fade in/out */}
                <div className="absolute inset-0 flex items-center" style={{ pointerEvents: 'none' }}>
                  <GeminiWave mode={waveMode} />
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <CharacterDropdown
              selectedId={selectedCharId}
              onChange={setSelectedCharId}
              onSwitch={cancelSpeech}
              customCharacters={customCharacters}
              onDeleteCustom={handleDeleteCustomChar}
              onCreateNew={() => setCreatorOpen(true)}
            />

            {synthSupported && (
              <button
                onClick={() => { if (voiceEnabled) cancelSpeech(); setVoiceEnabled((v) => !v); }}
                aria-label={voiceEnabled ? 'Turn voice off' : 'Turn voice on'}
                title={voiceEnabled ? 'Turn voice off' : 'Turn voice on'}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                style={{
                  background:  voiceEnabled ? 'var(--accent-soft)' : 'transparent',
                  color:       voiceEnabled ? 'var(--accent)'      : 'var(--text-3)',
                  border:      '1px solid',
                  borderColor: voiceEnabled ? 'var(--accent)'      : 'var(--border)',
                }}
              >
                {voiceEnabled ? <SpeakerIcon className="w-3.5 h-3.5" /> : <SpeakerOffIcon className="w-3.5 h-3.5" />}
              </button>
            )}

            <ThemeToggle theme={theme} onToggle={toggleTheme} />

          </div>
        </header>

        {/* ── Messages ────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-4 py-8 space-y-3">

            {messages.length === 0 && !loading && !isStreaming && (
              <div className="flex flex-col items-center justify-center gap-5 py-20 select-none text-center">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                >
                  <ChatIcon className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-base" style={{ color: 'var(--text)' }}>
                    Start a conversation
                  </p>
                  <p className="text-sm" style={{ color: 'var(--text-3)' }}>
                    {micSupported
                      ? 'Type a message or click the mic to speak.'
                      : 'Type a message below to get started.'}
                  </p>
                </div>
              </div>
            )}

            {micError && (
              <div className="rounded-xl px-4 py-3 text-sm msg-enter"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}
              >
                {micError}
              </div>
            )}

            {messages.map((msg, i) => {
              const isUser = msg.role === 'user';
              return (
                <div key={i} className={`flex items-end gap-2.5 msg-enter ${isUser ? 'justify-end' : 'justify-start'}`}>
                  {!isUser && (
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 mb-0.5"
                      style={{ background: 'var(--accent)', color: '#fff' }}
                    >
                      {activeChar.name[0]}
                    </div>
                  )}
                  <div className="max-w-[75%] px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words"
                    style={{
                      background:   isUser ? 'var(--user-bg)'  : 'var(--buddy-bg)',
                      color:        isUser ? 'var(--user-text)' : 'var(--buddy-text)',
                      borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                    }}
                  >
                    {isUser ? msg.content : <MessageText content={msg.content} />}
                  </div>
                </div>
              );
            })}

            {/* Thinking dots */}
            {loading && (
              <div className="flex items-end gap-2.5 justify-start msg-enter">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 mb-0.5"
                  style={{ background: 'var(--accent)', color: '#fff' }}
                >
                  {activeChar.name[0]}
                </div>
                <div className="px-4 py-3 flex items-center gap-1"
                  style={{ background: 'var(--buddy-bg)', borderRadius: '18px 18px 18px 4px' }}
                >
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="w-1.5 h-1.5 rounded-full"
                      style={{ background: 'var(--text-3)', animation: 'audio-wave 1s ease-in-out infinite', animationDelay: `${i * 0.2}s`, display: 'inline-block' }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Live streaming bubble */}
            {isStreaming && streamingContent && (
              <div className="flex items-end gap-2.5 justify-start msg-enter">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 mb-0.5"
                  style={{ background: 'var(--accent)', color: '#fff' }}
                >
                  {activeChar.name[0]}
                </div>
                <div className="max-w-[75%] px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words"
                  style={{ background: 'var(--buddy-bg)', color: 'var(--buddy-text)', borderRadius: '18px 18px 18px 4px' }}
                >
                  <StreamingBubble content={streamingContent} />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </main>

        {/* ── Input bar ───────────────────────────────────────────────── */}
        <div className="shrink-0 px-4 py-3" style={{ background: 'var(--bg)' }}>
          <div className="flex items-end gap-2 max-w-2xl mx-auto rounded-2xl px-3 py-2"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 4px 24px var(--shadow)' }}
          >
            {micSupported && (
              <button
                onClick={() => { if (isProcessing) return; if (isListening) stopListening(); else startListening(); }}
                aria-label={isListening ? 'Stop recording' : isProcessing ? 'Transcribing…' : 'Start voice input'}
                disabled={isProcessing}
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors mb-0.5 disabled:cursor-not-allowed"
                style={{
                  background:  isListening  ? 'rgba(239,68,68,0.12)' : isProcessing ? 'var(--accent-soft)' : 'transparent',
                  color:       isListening  ? '#f87171'              : isProcessing ? 'var(--accent)'      : 'var(--text-3)',
                  border:      '1px solid',
                  borderColor: isListening  ? 'rgba(239,68,68,0.3)' : isProcessing ? 'var(--accent)'      : 'transparent',
                }}
              >
                {isListening ? <WaveformBars /> : isProcessing ? <SpinnerIcon className="w-4 h-4" /> : <MicIcon className="w-4 h-4" />}
              </button>
            )}

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                isListening  ? 'Recording… click mic to stop'  :
                isProcessing ? 'Transcribing your message…'    :
                isStreaming  ? `${activeChar.name} is typing…` :
                `Message ${activeChar.name}…`
              }
              rows={1}
              disabled={loading || isStreaming || isListening || isProcessing}
              className="flex-1 bg-transparent text-sm resize-none focus:outline-none leading-relaxed py-1.5 disabled:opacity-50"
              style={{ color: 'var(--text)', caretColor: 'var(--accent)' }}
            />

            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading || isStreaming || isListening || isProcessing}
              aria-label="Send message"
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all active:scale-95 mb-0.5 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ background: 'var(--accent)', color: '#fff' }}
              onMouseEnter={(e) => { if (!(e.currentTarget as HTMLButtonElement).disabled) (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-hover)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent)'; }}
            >
              <SendIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          <p className="text-center text-[11px] mt-2 select-none" style={{ color: 'var(--text-3)' }}>
            {micSupported
              ? 'Enter to send · Shift+Enter for new line · Click mic to speak'
              : 'Enter to send · Shift+Enter for new line'}
          </p>
        </div>

      </div>
    </div>
  );
}
