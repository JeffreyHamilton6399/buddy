import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { getCharacter } from '@/lib/characters';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json(
        { error: 'GROQ_API_KEY is not set. Add it to .env.local.' },
        { status: 500 },
      );
    }

    // Instantiate inside the handler so the build never runs this at compile time
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const body = await req.json();
    const messages: ChatMessage[] = body.messages;

    // The client sends a character ID; the server resolves the system prompt.
    // This means clients can never inject arbitrary system prompts.
    const characterId: string = body.character ?? 'buddy';

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: 'messages must be a non-empty array' },
        { status: 400 },
      );
    }

    // Look up the server-side personality for this character
    const character = getCharacter(characterId);

    // Sanitize: strip any messages with unknown roles to prevent prompt injection
    const sanitized = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: String(m.content) }));

    const completion = await groq.chat.completions.create({
      messages: [{ role: 'system', content: character.systemPrompt }, ...sanitized],
      model: 'llama-3.3-70b-versatile',
      // Slightly higher temperature for personality characters feels more natural
      temperature: characterId === 'spock' ? 0.4 : 0.8,
      max_tokens: 1024,
    });

    const reply =
      completion.choices[0]?.message?.content ??
      "Sorry, I couldn't come up with a response!";

    return NextResponse.json({ reply });
  } catch (error) {
    console.error('[/api/chat] error:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 },
    );
  }
}
