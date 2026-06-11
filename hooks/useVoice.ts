'use client';

/**
 * useVoice
 *
 * Voice INPUT:  MediaRecorder API → /api/transcribe (Groq Whisper)
 *   - Works in Chrome, Firefox, Safari, and mobile browsers
 *   - No dependency on the Web Speech API, which silently fails in many
 *     environments and isn't supported at all in Firefox
 *   - Three mic states: idle → recording → processing (transcribing)
 *
 * Voice OUTPUT: Web Speech Synthesis API
 *   - Distinct pitch/rate per character
 *   - Smart voice matching: prefers male/female voices per character,
 *     with multiple fallback tiers before giving up
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type { Character } from '@/lib/characters';

export type MicState = 'idle' | 'recording' | 'processing';

export interface UseVoiceReturn {
  micState: MicState;
  isSpeaking: boolean;
  micError: string | null;
  startListening: () => Promise<void>;
  stopListening: () => void;
  speak: (text: string, character: Character) => void;
  cancelSpeech: () => void;
  micSupported: boolean;
  synthSupported: boolean;
}

export function useVoice(
  onTranscript: (text: string) => void,
  voiceEnabled: boolean,
): UseVoiceReturn {
  const [micState,  setMicState]  = useState<MicState>('idle');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [micError,   setMicError]   = useState<string | null>(null);

  // Feature detection — done client-side to avoid SSR mismatch
  const [micSupported,   setMicSupported]   = useState(false);
  const [synthSupported, setSynthSupported] = useState(false);

  useEffect(() => {
    setMicSupported(
      typeof window !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      'mediaDevices' in navigator &&
      typeof MediaRecorder !== 'undefined',
    );
    setSynthSupported(
      typeof window !== 'undefined' && 'speechSynthesis' in window,
    );
  }, []);

  // Refs keep latest values visible inside async callbacks
  const onTranscriptRef  = useRef(onTranscript);
  const voiceEnabledRef  = useRef(voiceEnabled);
  useEffect(() => { onTranscriptRef.current  = onTranscript;  }, [onTranscript]);
  useEffect(() => { voiceEnabledRef.current  = voiceEnabled;  }, [voiceEnabled]);

  const recorderRef    = useRef<MediaRecorder | null>(null);
  const chunksRef      = useRef<BlobPart[]>([]);
  const autoStopRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cancel auto-stop timer and recorder on unmount
  useEffect(() => () => {
    if (autoStopRef.current) clearTimeout(autoStopRef.current);
    recorderRef.current?.stop();
  }, []);

  // ── Voice INPUT ──────────────────────────────────────────────────────────

  const startListening = useCallback(async () => {
    if (micState !== 'idle') return;

    // Stop Buddy speaking if active
    if (synthSupported) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicError(null);
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setMicError(
          'Microphone access denied. Click the lock icon in your browser\'s address bar, allow the microphone, then refresh.',
        );
      } else if (name === 'NotFoundError') {
        setMicError('No microphone found. Please connect one and try again.');
      } else {
        setMicError('Could not access your microphone. Please check your browser settings.');
      }
      return;
    }

    // Pick the best supported MIME type (Groq Whisper accepts all three)
    const mimeType =
      MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' :
      MediaRecorder.isTypeSupported('audio/mp4')              ? 'audio/mp4'              :
                                                                'audio/ogg;codecs=opus';

    const recorder    = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;
    chunksRef.current   = [];

    // Collect audio chunks as they arrive
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      // Stop all microphone tracks so the browser indicator turns off
      stream.getTracks().forEach((t) => t.stop());

      const blob = new Blob(chunksRef.current, { type: mimeType });

      // Ignore recordings under ~200 ms (accidental taps with no speech)
      if (blob.size < 1000) {
        setMicState('idle');
        return;
      }

      setMicState('processing');

      try {
        const ext      = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm';
        const formData = new FormData();
        formData.append('audio', new File([blob], `recording.${ext}`, { type: mimeType }));

        const res  = await fetch('/api/transcribe', { method: 'POST', body: formData });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error ?? 'Transcription failed');

        const text = (data.text as string).trim();
        if (text) onTranscriptRef.current(text);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Transcription error';
        setMicError(msg);
      } finally {
        setMicState('idle');
      }
    };

    recorder.onerror = () => {
      stream.getTracks().forEach((t) => t.stop());
      setMicState('idle');
      setMicError('Recording failed. Please try again.');
    };

    // Auto-stop after 30 s to prevent runaway recordings
    autoStopRef.current = setTimeout(() => recorder.stop(), 30_000);

    recorder.start();
    setMicState('recording');
  }, [micState, synthSupported]);

  const stopListening = useCallback(() => {
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop(); // triggers onstop → processing flow
    }
  }, []);

  // ── Voice OUTPUT ─────────────────────────────────────────────────────────

  /**
   * Pick the best available voice for a character.
   *
   * Priority:
   *  1. Exact hint match (e.g. "samantha" in voice name)
   *  2. Gender preference ("male" / "female" string in voice name)
   *  3. Any English voice
   *  4. First available voice (last resort)
   */
  function pickVoice(character: Character): SpeechSynthesisVoice | null {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) return null;

    // 1. Hint match
    const hinted = voices.find((v) =>
      character.voiceHint.some((h) => v.name.toLowerCase().includes(h.toLowerCase())),
    );
    if (hinted) return hinted;

    // 2. Gender preference (looks for common gendered voice names)
    const FEMALE_PATTERNS = /samantha|zira|victoria|karen|lisa|susan|fiona|moira|kate|hazel|female|woman/i;
    const MALE_PATTERNS   = /david|alex|daniel|mark|george|fred|bruce|tom|james|male|man/i;

    if (character.voiceGender === 'female') {
      const f = voices.find((v) => v.lang.startsWith('en') && FEMALE_PATTERNS.test(v.name));
      if (f) return f;
    } else if (character.voiceGender === 'male') {
      const m = voices.find((v) => v.lang.startsWith('en') && MALE_PATTERNS.test(v.name));
      if (m) return m;
    }

    // 3. Any English voice
    const eng = voices.find((v) => v.lang.startsWith('en'));
    if (eng) return eng;

    // 4. Whatever is available
    return voices[0] ?? null;
  }

  const speak = useCallback((text: string, character: Character) => {
    if (!synthSupported || !voiceEnabledRef.current) return;

    window.speechSynthesis.cancel();

    const utterance    = new SpeechSynthesisUtterance(text);
    utterance.pitch    = character.pitch;
    utterance.rate     = character.rate;
    utterance.volume   = character.volume;
    utterance.onstart  = () => setIsSpeaking(true);
    utterance.onend    = () => setIsSpeaking(false);
    utterance.onerror  = () => setIsSpeaking(false);

    const doSpeak = () => {
      const voice = pickVoice(character);
      if (voice) utterance.voice = voice;
      window.speechSynthesis.speak(utterance);
    };

    // Chrome loads voices asynchronously on first call
    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.addEventListener('voiceschanged', doSpeak, { once: true });
    } else {
      doSpeak();
    }
  }, [synthSupported]);

  const cancelSpeech = useCallback(() => {
    if (!synthSupported) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [synthSupported]);

  return {
    micState, isSpeaking, micError,
    startListening, stopListening, speak, cancelSpeech,
    micSupported, synthSupported,
  };
}
