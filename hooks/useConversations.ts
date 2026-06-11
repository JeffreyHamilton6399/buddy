'use client';

/**
 * useConversations
 *
 * Manages the list of saved conversations in React state, kept in sync with
 * the storage layer in lib/conversations.ts.
 *
 * Responsibilities:
 *  - Hydrate conversations from localStorage on mount
 *  - Provide `upsert` and `remove` that update both storage and React state
 *
 * NOT responsible for:
 *  - Which conversation is currently active (that lives in ChatPage)
 *  - Message state (also in ChatPage)
 */

import { useState, useEffect, useCallback } from 'react';
import {
  type Conversation,
  loadConversations,
  upsertConversation as persist,
  removeConversation,
} from '@/lib/conversations';

export type { Conversation };

export interface UseConversationsReturn {
  conversations: Conversation[];
  /** Insert or update a conversation and sync React state. */
  upsert: (conv: Conversation) => void;
  /** Delete a conversation and sync React state. */
  remove: (id: string) => void;
}

export function useConversations(): UseConversationsReturn {
  const [conversations, setConversations] = useState<Conversation[]>([]);

  // Hydrate from localStorage once on the client (SSR returns empty array)
  useEffect(() => {
    setConversations(loadConversations());
  }, []);

  const upsert = useCallback((conv: Conversation) => {
    persist(conv);
    setConversations((prev) => {
      const without = prev.filter((c) => c.id !== conv.id);
      // Keep sorted newest-first after update
      return [conv, ...without].sort((a, b) => b.updatedAt - a.updatedAt);
    });
  }, []);

  const remove = useCallback((id: string) => {
    removeConversation(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return { conversations, upsert, remove };
}
