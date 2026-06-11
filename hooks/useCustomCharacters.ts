'use client';

/**
 * useCustomCharacters
 *
 * Manages the list of user-created characters in React state, keeping it
 * in sync with localStorage via lib/customCharacters.ts.
 *
 * Only responsible for the list — which character is active lives in ChatPage.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  type CustomCharacter,
  loadCustomCharacters,
  saveCustomCharacter,
  deleteCustomCharacter,
} from '@/lib/customCharacters';

export type { CustomCharacter };

export function useCustomCharacters() {
  const [customCharacters, setCustomCharacters] = useState<CustomCharacter[]>([]);

  // Hydrate from localStorage on the client (SSR returns empty array)
  useEffect(() => {
    setCustomCharacters(loadCustomCharacters());
  }, []);

  const add = useCallback((char: CustomCharacter) => {
    saveCustomCharacter(char);
    setCustomCharacters((prev) => [...prev, char]);
  }, []);

  const remove = useCallback((id: string) => {
    deleteCustomCharacter(id);
    setCustomCharacters((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return { customCharacters, add, remove };
}
