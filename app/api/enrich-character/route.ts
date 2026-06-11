/**
 * POST /api/enrich-character
 *
 * Called once during custom character creation. Uses the Groq LLM to research
 * the named character and generate a rich, personality-driven system prompt.
 * The result is saved to localStorage client-side — this endpoint is NOT
 * called on every chat message.
 *
 * Body:     { name: string, description?: string, speakingStyle?: string }
 * Response: { systemPrompt: string, notFound: boolean }
 *
 * notFound: true means the LLM had no knowledge of the character and relied
 * entirely on the user's description. The client shows a friendly notice.
 */

import { NextRequest } from 'next/server';
import Groq from 'groq-sdk';

export async function POST(req: NextRequest) {
  if (!process.env.GROQ_API_KEY) {
    return Response.json({ error: 'GROQ_API_KEY not set' }, { status: 500 });
  }

  try {
    const body = await req.json() as {
      name?: string;
      description?: string;
      speakingStyle?: string;
    };

    const name         = (body.name ?? '').trim();
    const description  = (body.description ?? '').trim();
    const speakingStyle = (body.speakingStyle ?? '').trim();

    if (!name) {
      return Response.json({ error: 'name is required' }, { status: 400 });
    }

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    // Ask the LLM to write a system prompt for the character.
    // If it knows nothing AND the user gave no description, it outputs "UNKNOWN"
    // so the client can show a helpful fallback message.
    const completion = await groq.chat.completions.create({
      model:       'llama-3.3-70b-versatile',
      temperature: 0.75,
      max_tokens:  600,
      messages: [
        {
          role: 'system',
          content: `You are an expert at writing AI character personas.
You write vivid, specific system prompts — never generic — that include authentic speech patterns, catchphrases, worldview, and things the character would never say.
Always write in second person ("You are...", "You speak...", "You believe...").
If you have ZERO knowledge of a character AND no user description was given, output exactly the single word: UNKNOWN`,
        },
        {
          role: 'user',
          content: `Write a system prompt for a character named "${name}".

User description: ${description || '(none)'}
User speaking-style notes: ${speakingStyle || '(none)'}

If "${name}" is a recognisable character (fiction, history, pop culture, mythology, etc.):
— Include their real personality traits, speech quirks, and catchphrases
— Note specific things they'd say AND things they'd never say
— Describe their emotional register and worldview
— Blend your knowledge with the user's description (user notes take priority)

Write 200–350 words, starting with "You are ${name}..."
No preamble, no headers — just the system prompt itself.`,
        },
      ],
    });

    const raw = (completion.choices[0]?.message?.content ?? '').trim();

    if (!raw || raw === 'UNKNOWN') {
      // LLM knows nothing — build a basic prompt from the user's own words
      return Response.json({
        systemPrompt: buildFallback(name, description, speakingStyle),
        notFound: true,
      });
    }

    return Response.json({ systemPrompt: raw, notFound: false });
  } catch (error) {
    console.error('[/api/enrich-character]', error);
    return Response.json({ error: 'Failed to create character' }, { status: 500 });
  }
}

/** Minimal system prompt constructed entirely from user-provided text. */
function buildFallback(name: string, description: string, speakingStyle: string): string {
  const parts = [`You are ${name}, a character with a distinct and consistent personality.`];
  if (description)   parts.push(description);
  if (speakingStyle) parts.push(`Your speaking style: ${speakingStyle}.`);
  parts.push('Stay in character at all times. Be engaging, consistent, and true to your personality as described.');
  return parts.join('\n\n');
}
