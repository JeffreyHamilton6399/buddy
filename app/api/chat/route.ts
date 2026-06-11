/**
 * POST /api/chat
 *
 * Streams the AI response token-by-token using Groq's streaming API.
 * The client reads the stream with a ReadableStream reader and renders
 * words as they arrive, giving a natural "typing" feel.
 *
 * Security:
 *  - GROQ_API_KEY stays server-side
 *  - Character ID → system prompt resolution is server-side only
 *  - Role values are sanitised before forwarding to Groq
 */

import { NextRequest } from 'next/server';
import Groq from 'groq-sdk';
import { getCharacter } from '@/lib/characters';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(req: NextRequest) {
  if (!process.env.GROQ_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'GROQ_API_KEY is not set.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  try {
    const groq  = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const body  = await req.json();
    const messages: ChatMessage[] = body.messages;
    const characterId: string     = body.character ?? 'buddy';

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'messages must be a non-empty array' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // customSystemPrompt is passed by the client for user-created characters.
    // Preset characters are resolved server-side; custom ones send their prompt
    // because they don't exist in lib/characters.ts.
    const customSystemPrompt: string | undefined = body.customSystemPrompt
      ? String(body.customSystemPrompt).slice(0, 6000) // max length guard
      : undefined;

    const character    = getCharacter(characterId);
    const systemPrompt = customSystemPrompt ?? character.systemPrompt;

    const sanitized = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m)   => ({ role: m.role, content: String(m.content) }));

    // Request a streaming completion from Groq
    const groqStream = await groq.chat.completions.create({
      messages:    [{ role: 'system', content: systemPrompt }, ...sanitized],
      model:       'llama-3.3-70b-versatile',
      temperature: characterId === 'spock' ? 0.4 : 0.8,
      max_tokens:  1024,
      stream:      true,
    });

    // Convert the Groq async iterable into a Web ReadableStream of plain text.
    // Each chunk is a raw text delta — the client concatenates them.
    const readable = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const chunk of groqStream) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) controller.enqueue(encoder.encode(delta));
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type':  'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        // Tell the browser this is a stream — important for mobile Safari
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('[/api/chat] error:', error);
    return new Response(
      JSON.stringify({ error: 'Something went wrong. Please try again.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
