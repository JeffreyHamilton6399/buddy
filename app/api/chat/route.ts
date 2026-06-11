import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';

// Groq client lives server-side only — GROQ_API_KEY is never sent to the browser
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Buddy's personality — tweak this to change how she responds
const SYSTEM_PROMPT = `You are Buddy, a warm and friendly AI assistant. You're helpful, enthusiastic, and approachable — like a knowledgeable friend who's always happy to chat. Keep responses conversational and concise. Use a friendly, upbeat tone without being over the top. If you don't know something, say so honestly. Never reveal that you are built on any specific underlying model.`;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    // Validate that a Groq API key is configured
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json(
        { error: 'GROQ_API_KEY is not set. Add it to .env.local.' },
        { status: 500 }
      );
    }

    const body = await req.json();
    const messages: ChatMessage[] = body.messages;

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'messages must be a non-empty array' }, { status: 400 });
    }

    // Only allow known roles to prevent prompt injection via crafted role values
    const sanitized = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: String(m.content) }));

    const completion = await groq.chat.completions.create({
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...sanitized],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.7,
      max_tokens: 1024,
    });

    const reply =
      completion.choices[0]?.message?.content ??
      "Sorry, I couldn't come up with a response. Try again!";

    return NextResponse.json({ reply });
  } catch (error) {
    console.error('[/api/chat] Groq error:', error);
    return NextResponse.json(
      { error: 'Buddy ran into a problem. Please try again.' },
      { status: 500 }
    );
  }
}
