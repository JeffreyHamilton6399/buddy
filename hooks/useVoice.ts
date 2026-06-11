'use client';

/**
 * useVoice — combines Web Speech Recognition (mic input) and Web Speech
 * Synthesis (text-to-speech output) into one hook for the Buddy voice feature.
 *
 * Neither API requires an API key — they run entirely in the browser.
 * Recognition uses the device microphone; synthesis uses built-in OS voices.
 *
 * Usage:
 *   const voice = useVoice(onFinalTranscript, voiceEnabled);
 *
 * @param onFinalTranscript  Called with trimmed text when the user stops speaking.
 * @param voiceEnabled       When false, speak() is a no-op.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type { Character } from '@/lib/characters';

// webkit-prefixed types (Chrome/Safari) are declared in types/speech.d.ts

export interface UseVoiceReturn {
  isListening: boolean;
  isSpeaking: boolean;
  /** Live partial transcript while the user is speaking — show this in the UI. */
  interimTranscript: string;
  startListening: () => void;
  stopListening: () => void;
  /** Speak `text` in the given character's voice. No-op when voiceEnabled is false. */
  speak: (text: string, character: Character) => void;
  cancelSpeech: () => void;
  /** True if SpeechRecognition is available in this browser. */
  speechInputSupported: boolean;
  /** True if SpeechSynthesis is available in this browser. */
  speechOutputSupported: boolean;
}

export function useVoice(
  onFinalTranscript: (text: string) => void,
  voiceEnabled: boolean,
): UseVoiceReturn {
  const [isListening, setIsListening]             = useState(false);
  const [isSpeaking, setIsSpeaking]               = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');

  // Support flags — evaluated client-side only (avoids SSR mismatch)
  const [speechInputSupported, setSpeechInputSupported]   = useState(false);
  const [speechOutputSupported, setSpeechOutputSupported] = useState(false);

  useEffect(() => {
    setSpeechInputSupported(
      'SpeechRecognition' in window || 'webkitSpeechRecognition' in window,
    );
    setSpeechOutputSupported('speechSynthesis' in window);
  }, []);

  // ── Refs ──────────────────────────────────────────────────────────────────
  // Keep latest callback + flag in refs so recognition event handlers always
  // see current values without needing to be torn down and re-created.

  const onFinalRef      = useRef(onFinalTranscript);
  const voiceEnabledRef = useRef(voiceEnabled);
  useEffect(() => { onFinalRef.current = onFinalTranscript; }, [onFinalTranscript]);
  useEffect(() => { voiceEnabledRef.current = voiceEnabled; }, [voiceEnabled]);

  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // ── Speech Recognition setup ──────────────────────────────────────────────
  useEffect(() => {
    if (!speechInputSupported) return;

    const SpeechRec = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    const rec = new SpeechRec();

    rec.continuous     = false; // Stops automatically after a pause
    rec.interimResults = true;  // Deliver partial results for live feedback
    rec.lang           = 'en-US';

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let interim  = '';
      let finished = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finished += chunk;
        } else {
          interim += chunk;
        }
      }

      // Show partial text in real-time so the user can see what's being heard
      setInterimTranscript(interim);

      // When the browser signals a final result, hand it off and clear interim
      if (finished) {
        setInterimTranscript('');
        onFinalRef.current(finished.trim());
      }
    };

    rec.onend = () => {
      setIsListening(false);
      setInterimTranscript('');
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      // 'no-speech' fires when the user was silent; 'aborted' fires on manual stop.
      // Both are expected — only log genuinely unexpected errors.
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.error('[useVoice] recognition error:', event.error);
      }
      setIsListening(false);
      setInterimTranscript('');
    };

    recognitionRef.current = rec;

    return () => { rec.abort(); }; // Clean up on unmount
  }, [speechInputSupported]);

  // ── Public API ────────────────────────────────────────────────────────────

  /** Start the microphone. Cancels any ongoing Buddy speech first. */
  const startListening = useCallback(() => {
    if (!recognitionRef.current || isListening) return;

    // Auto-stop Buddy speaking when the user starts talking
    if (speechOutputSupported) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }

    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch {
      // Thrown if recognition was already started — harmless, ignore
    }
  }, [isListening, speechOutputSupported]);

  /** Stop listening early (e.g. button release for push-to-talk). */
  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  /**
   * Speak `text` in the character's voice.
   *
   * Chrome loads voices asynchronously on first call, so we listen for the
   * `voiceschanged` event when the voice list is initially empty.
   */
  const speak = useCallback((text: string, character: Character) => {
    if (!speechOutputSupported || !voiceEnabledRef.current) return;

    // Cancel whatever is currently playing before queuing a new utterance
    window.speechSynthesis.cancel();

    const utterance    = new SpeechSynthesisUtterance(text);
    utterance.pitch    = character.pitch;
    utterance.rate     = character.rate;
    utterance.volume   = character.volume;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend   = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    /** Try to find a preferred voice and then speak. */
    const trySpeak = () => {
      const voices  = window.speechSynthesis.getVoices();
      const matched = voices.find((v) =>
        character.voiceHint.some((hint) =>
          v.name.toLowerCase().includes(hint.toLowerCase()),
        ),
      );
      if (matched) utterance.voice = matched;
      window.speechSynthesis.speak(utterance);
    };

    // Voices may not be loaded yet on first call (Chrome quirk)
    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.addEventListener('voiceschanged', trySpeak, { once: true });
    } else {
      trySpeak();
    }
  }, [speechOutputSupported]);

  /** Immediately stop Buddy speaking. */
  const cancelSpeech = useCallback(() => {
    if (!speechOutputSupported) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [speechOutputSupported]);

  return {
    isListening,
    isSpeaking,
    interimTranscript,
    startListening,
    stopListening,
    speak,
    cancelSpeech,
    speechInputSupported,
    speechOutputSupported,
  };
}
