/**
 * Custom character storage layer.
 *
 * Mirrors the shape of lib/conversations.ts — all localStorage access lives
 * here so swapping the persistence layer later requires no UI changes.
 *
 * CustomCharacter extends Character from lib/characters.ts so it can be
 * used anywhere a preset Character is expected (voice playback, chat, etc.).
 */

import type { Character } from '@/lib/characters';
import { generateId } from '@/lib/conversations';

const STORAGE_KEY = 'buddy-custom-characters';

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * A user-created character. Extends the base Character interface so it is
 * structurally compatible with every consumer that expects a Character.
 */
export interface CustomCharacter extends Character {
  /** Discriminator — lets the UI distinguish custom from preset characters. */
  isCustom: true;
  /** User's original description (stored so it can be shown later). */
  description: string;
  /** User's speaking-style notes. */
  speakingStyle: string;
  /** Unix ms — creation time, used for ordering. */
  createdAt: number;
}

// ── Voice presets ──────────────────────────────────────────────────────────

// Maps a gender preference to a sensible ElevenLabs voice + Web Speech hints.
// Uses voices already present in characters.ts so no new API keys are needed.
type VoiceFields = Pick<
  Character,
  'elevenLabsVoiceId' | 'voiceHint' | 'voiceGender' | 'pitch' | 'rate' | 'volume'
>;

const VOICE_PRESETS: Record<'male' | 'female' | 'any', VoiceFields> = {
  female: {
    elevenLabsVoiceId: '9BWtsMINqrJLrRacOk9x', // Aria (Buddy's voice)
    voiceHint:  ['samantha', 'zira', 'karen', 'victoria', 'google us english'],
    voiceGender: 'female',
    pitch: 1.05, rate: 1.0, volume: 1,
  },
  male: {
    elevenLabsVoiceId: 'pqHfZKP75CvOlQylNhV4', // Bill (Iron Man's voice)
    voiceHint:  ['daniel', 'david', 'mark', 'alex', 'google us english'],
    voiceGender: 'male',
    pitch: 0.95, rate: 1.0, volume: 1,
  },
  any: {
    elevenLabsVoiceId: '9BWtsMINqrJLrRacOk9x', // Aria (neutral default)
    voiceHint:  ['samantha', 'daniel', 'google us english'],
    voiceGender: 'any',
    pitch: 1.0,  rate: 1.0, volume: 1,
  },
};

// ── Factory ────────────────────────────────────────────────────────────────

/** Assemble a complete CustomCharacter from form data + AI-generated system prompt. */
export function buildCustomCharacter({
  name,
  description,
  speakingStyle,
  voiceGender,
  systemPrompt,
}: {
  name: string;
  description: string;
  speakingStyle: string;
  voiceGender: 'male' | 'female' | 'any';
  systemPrompt: string;
}): CustomCharacter {
  return {
    id:          `custom-${generateId()}`,
    name:        name.trim(),
    emoji:       '⭐',
    description,
    speakingStyle,
    systemPrompt,
    isCustom:    true,
    createdAt:   Date.now(),
    ...VOICE_PRESETS[voiceGender],
  };
}

// ── Storage operations ─────────────────────────────────────────────────────

/** Load all custom characters from localStorage. Returns [] on SSR or error. */
export function loadCustomCharacters(): CustomCharacter[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as CustomCharacter[]) : [];
  } catch {
    return [];
  }
}

/** Insert or update a custom character (matched by id). */
export function saveCustomCharacter(char: CustomCharacter): void {
  if (typeof window === 'undefined') return;
  try {
    const all = loadCustomCharacters();
    const idx = all.findIndex((c) => c.id === char.id);
    if (idx >= 0) all[idx] = char; else all.push(char);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {}
}

/** Remove a custom character by id. */
export function deleteCustomCharacter(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    const filtered = loadCustomCharacters().filter((c) => c.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch {}
}
