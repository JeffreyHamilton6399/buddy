/**
 * POST /api/transcribe
 *
 * Receives a raw audio blob (webm/mp4/ogg) from the MediaRecorder on the
 * client and returns the transcribed text via Groq's Whisper API.
 *
 * Using Groq Whisper instead of the Web Speech API gives us:
 *  - Reliable cross-browser support (Chrome, Firefox, Safari, mobile)
 *  - No dependency on Google's speech service
 *  - Consistent accuracy
 */

import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';

export async function POST(req: NextRequest) {
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: 'GROQ_API_KEY not set.' }, { status: 500 });
  }

  try {
    const groq     = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const formData = await req.formData();
    const audio    = formData.get('audio');

    if (!audio || !(audio instanceof File)) {
      return NextResponse.json({ error: 'No audio file in request.' }, { status: 400 });
    }

    // Sanity-check size (Groq Whisper cap is 25 MB)
    if (audio.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: 'Audio too large (max 25 MB).' }, { status: 413 });
    }

    // whisper-large-v3-turbo: fast, accurate, cheap
    const result = await groq.audio.transcriptions.create({
      file:            audio,
      model:           'whisper-large-v3-turbo',
      response_format: 'json',
      language:        'en',
    });

    return NextResponse.json({ text: result.text ?? '' });
  } catch (error) {
    console.error('[/api/transcribe] error:', error);
    return NextResponse.json({ error: 'Transcription failed. Please try again.' }, { status: 500 });
  }
}
