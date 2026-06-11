/**
 * Conversation storage layer.
 *
 * All persistence is handled here. Swapping localStorage for a database later
 * only requires updating this file — the React hook and all UI components
 * stay unchanged.
 *
 * Design contract:
 *  - Every exported function is safe to call during SSR (guards with typeof window).
 *  - Errors are swallowed silently; the UI always keeps working even if storage fails.
 */

// ── Types ──────────────────────────────────────────────────────────────────

/** A single chat message (same shape as the /api/chat payload). */
export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

/** A saved conversation entry. */
export interface Conversation {
  /** Stable unique identifier. */
  id: string;
  /** Auto-generated from the first user message (≤ 30 chars). */
  title: string;
  /** ID of the character active when the conversation started. */
  characterId: string;
  /** Full message history in chronological order. */
  messages: Message[];
  /** Unix ms — creation time. */
  createdAt: number;
  /** Unix ms — last activity; used for sort order. */
  updatedAt: number;
}

// ── Constants ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'buddy-conversations';

// ── ID & title helpers ─────────────────────────────────────────────────────

/** Compact unique ID — no library needed. */
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/** Trim the first user message to a readable conversation title (≤ 30 chars). */
export function generateTitle(firstMessage: string): string {
  const clean = firstMessage.trim().replace(/\s+/g, ' ');
  return clean.length > 30 ? `${clean.slice(0, 30).trimEnd()}…` : clean;
}

/**
 * Human-readable relative time for sidebar timestamps.
 * e.g. "just now", "5m ago", "3h ago", "2d ago", "Jun 3"
 */
export function formatRelativeTime(timestamp: number): string {
  const diff    = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  const hours   = Math.floor(diff / 3_600_000);
  const days    = Math.floor(diff / 86_400_000);

  if (minutes < 1)  return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours   < 24) return `${hours}h ago`;
  if (days    < 7)  return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ── Storage operations ─────────────────────────────────────────────────────

/** Load all conversations from localStorage, sorted newest-first. */
export function loadConversations(): Conversation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as Conversation[]).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

/** Insert or update a conversation (matched by id). Silently ignores quota errors. */
export function upsertConversation(conv: Conversation): void {
  if (typeof window === 'undefined') return;
  try {
    const all = loadConversations();
    const idx = all.findIndex((c) => c.id === conv.id);
    if (idx >= 0) all[idx] = conv; else all.push(conv);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // QuotaExceededError — silently ignore; chat still works, just not persisted
  }
}

/** Remove a conversation by id. No-op if the id doesn't exist. */
export function removeConversation(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    const all = loadConversations().filter((c) => c.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {}
}
