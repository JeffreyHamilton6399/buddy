'use client';

/**
 * useVoice
 *
 * Voice INPUT:   MediaRecorder → /api/transcribe (Groq Whisper)
 * Voice OUTPUT:  ElevenLabs via /api/speak (primary)
 *                → Web Speech Synthesis (silent fallback on 503 / no key)
 *
 * ElevenLabs route streams audio/mpeg; we decode it with an AudioContext for
 * low-latency playback. If /api/speak returns 503 (key missing, quota hit,
 * network error) we silently fall back to the browser's built-in TTS so the
 * user never sees an error.
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
  speak: (text: string, character: Character) => Promise<void>;
  cancelSpeech: () => void;
  micSupported: boolean;
  synthSupported: boolean;
}

export function useVoice(
  onTranscript: (text: string) => void,
  voiceEnabled: boolean,
): UseVoiceReturn {
  const [micState,   setMicState]   = useState<MicState>('idle');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [micError,   setMicError]   = useState<string | null>(null);

  const [micSupported,   setMicSupported]   = useState(false);
  const [synthSupported, setSynthSupported] = useState(false);

  useEffect(() => {
    setMicSupported(
      typeof navigator !== 'undefined' &&
      'mediaDevices' in navigator &&
      typeof MediaRecorder !== 'undefined',
    );
    setSynthSupported(
      typeof window !== 'undefined' && 'speechSynthesis' in window,
    );
  }, []);

  const onTranscriptRef = useRef(onTranscript);
  const voiceEnabledRef = useRef(voiceEnabled);
  useEffect(() => { onTranscriptRef.current = onTranscript;  }, [onTranscript]);
  useEffect(() => { voiceEnabledRef.current = voiceEnabled;  }, [voiceEnabled]);

  const recorderRef   = useRef<MediaRecorder | null>(null);
  const chunksRef     = useRef<BlobPart[]>([]);
  const autoStopRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // AudioContext for ElevenLabs streaming playback
  const audioCtxRef   = useRef<AudioContext | null>(null);
  const audioSrcRef   = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => () => {
    if (autoStopRef.current) clearTimeout(autoStopRef.current);
    recorderRef.current?.stop();
    audioSrcRef.current?.stop();
    audioCtxRef.current?.close();
  }, []);

  // ── Voice INPUT ──────────────────────────────────────────────────────────

  const startListening = useCallback(async () => {
    if (micState !== 'idle') return;

    // Stop any playing speech before listening
    audioSrcRef.current?.stop();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicError(null);
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setMicError("Microphone access denied. Click the lock icon in your browser's address bar, allow the microphone, then refresh.");
      } else if (name === 'NotFoundError') {
        setMicError('No microphone found. Please connect one and try again.');
      } else {
        setMicError('Could not access your microphone. Check your browser settings.');
      }
      return;
    }

    const mimeType =
      MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' :
      MediaRecorder.isTypeSupported('audio/mp4')              ? 'audio/mp4'              :
                                                                'audio/ogg;codecs=opus';

    const recorder   = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;
    chunksRef.current   = [];

    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };

    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: mimeType });

      if (blob.size < 1000) { setMicState('idle'); return; }

      setMicState('processing');
      try {
        const ext      = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm';
        const fd       = new FormData();
        fd.append('audio', new File([blob], `rec.${ext}`, { type: mimeType }));

        const res  = await fetch('/api/transcribe', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Transcription failed');

        const text = (data.text as string).trim();
        if (text) onTranscriptRef.current(text);
      } catch (err) {
        setMicError(err instanceof Error ? err.message : 'Transcription error');
      } finally {
        setMicState('idle');
      }
    };

    recorder.onerror = () => {
      stream.getTracks().forEach((t) => t.stop());
      setMicState('idle');
      setMicError('Recording failed. Please try again.');
    };

    autoStopRef.current = setTimeout(() => recorder.stop(), 30_000);
    recorder.start();
    setMicState('recording');
  }, [micState]);

  const stopListening = useCallback(() => {
    if (autoStopRef.current) { clearTimeout(autoStopRef.current); autoStopRef.current = null; }
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }, []);

  // ── Voice OUTPUT ─────────────────────────────────────────────────────────

  /** Try ElevenLabs first; fall back to Web Speech on 503 or any error. */
  const speak = useCallback(async (text: string, character: Character) => {
    if (!voiceEnabledRef.current) return;

    // Cancel whatever is currently playing
    audioSrcRef.current?.stop();
    if (synthSupported) window.speechSynthesis.cancel();
    setIsSpeaking(false);

    // ── Attempt ElevenLabs ─────────────────────────────────────────────────
    try {
      const res = await fetch('/api/speak', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text, voiceId: character.elevenLabsVoiceId }),
      });

      if (res.status === 503) {
        // ElevenLabs not configured / quota hit — fall through to Web Speech
        throw new Error('elevenlabs_unavailable');
      }

      if (!res.ok) throw new Error('elevenlabs_error');

      // Decode the MP3 stream with Web Audio API for low-latency playback
      const arrayBuffer = await res.arrayBuffer();

      // Lazily create AudioContext (browsers require user gesture first)
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') await ctx.resume();

      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      const source      = ctx.createBufferSource();
      source.buffer     = audioBuffer;
      source.connect(ctx.destination);

      source.onended = () => setIsSpeaking(false);
      audioSrcRef.current = source;

      setIsSpeaking(true);
      source.start(0);
      return; // success — skip fallback
    } catch (err) {
      // Any error (network, quota, not configured) → silent fallback
      const msg = err instanceof Error ? err.message : '';
      if (msg !== 'elevenlabs_unavailable' && msg !== 'elevenlabs_error') {
        console.warn('[useVoice] ElevenLabs failed, falling back to Web Speech:', msg);
      }
    }

    // ── Web Speech fallback ────────────────────────────────────────────────
    if (!synthSupported) return;

    const utterance    = new SpeechSynthesisUtterance(text);
    utterance.pitch    = character.pitch;
    utterance.rate     = character.rate;
    utterance.volume   = character.volume;
    utterance.onstart  = () => setIsSpeaking(true);
    utterance.onend    = () => setIsSpeaking(false);
    utterance.onerror  = () => setIsSpeaking(false);

    const doSpeak = () => {
      const voices  = window.speechSynthesis.getVoices();
      const FEMALE  = /samantha|zira|victoria|karen|lisa|susan|fiona|moira|kate|hazel|female|woman/i;
      const MALE    = /david|alex|daniel|mark|george|fred|bruce|tom|james|male|man/i;

      // 1. Hint match, 2. Gender match, 3. Any English, 4. First available
      const voice =
        voices.find((v) => character.voiceHint.some((h) => v.name.toLowerCase().includes(h.toLowerCase()))) ??
        (character.voiceGender === 'female' ? voices.find((v) => v.lang.startsWith('en') && FEMALE.test(v.name)) : undefined) ??
        (character.voiceGender === 'male'   ? voices.find((v) => v.lang.startsWith('en') && MALE.test(v.name))   : undefined) ??
        voices.find((v) => v.lang.startsWith('en')) ??
        voices[0];

      if (voice) utterance.voice = voice;
      window.speechSynthesis.speak(utterance);
    };

    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.addEventListener('voiceschanged', doSpeak, { once: true });
    } else {
      doSpeak();
    }
  }, [synthSupported]);

  const cancelSpeech = useCallback(() => {
    audioSrcRef.current?.stop();
    if (synthSupported) window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [synthSupported]);

  return {
    micState, isSpeaking, micError,
    startListening, stopListening, speak, cancelSpeech,
    micSupported, synthSupported,
  };
}
