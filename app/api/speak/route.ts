/**
 * POST /api/speak
 *
 * Converts text to speech via ElevenLabs and streams the audio back.
 * The ELEVENLABS_API_KEY never reaches the browser — all calls go server-side.
 *
 * Falls back gracefully: if ElevenLabs fails (quota, network, missing key),
 * it returns a 503 so the client can silently fall back to Web Speech API.
 *
 * Body: { text: string; voiceId: string }
 * Response: audio/mpeg stream
 */

import { NextRequest, NextResponse } from 'next/server';

// ElevenLabs voice IDs used by each character are defined in lib/characters.ts.
// This route just proxies the request — it does not validate voiceId against
// the character list, since the list is the single source of truth.

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';

export async function POST(req: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    // Signal the client to fall back — not a hard error
    return NextResponse.json({ error: 'ELEVENLABS_API_KEY not configured' }, { status: 503 });
  }

  try {
    const { text, voiceId } = await req.json();

    if (!text || !voiceId) {
      return NextResponse.json({ error: 'text and voiceId are required' }, { status: 400 });
    }

    // Call ElevenLabs text-to-speech endpoint
    const response = await fetch(
      `${ELEVENLABS_BASE}/text-to-speech/${voiceId}/stream`,
      {
        method: 'POST',
        headers: {
          'xi-api-key':   apiKey,
          'Content-Type': 'application/json',
          'Accept':       'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          // eleven_turbo_v2_5 is fast and high quality — good for real-time chat
          model_id: 'eleven_turbo_v2_5',
          voice_settings: {
            stability:        0.5,
            similarity_boost: 0.75,
            style:            0.0,
            use_speaker_boost: true,
          },
        }),
      },
    );

    if (!response.ok) {
      const err = await response.text().catch(() => 'Unknown error');
      console.error('[/api/speak] ElevenLabs error:', response.status, err);
      // 503 tells the client to fall back to Web Speech API
      return NextResponse.json({ error: 'ElevenLabs request failed' }, { status: 503 });
    }

    // Stream the audio directly back to the browser
    return new NextResponse(response.body, {
      headers: {
        'Content-Type':  'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[/api/speak] error:', error);
    return NextResponse.json({ error: 'Speech synthesis failed' }, { status: 503 });
  }
}
