'use client';

/**
 * useVoice — Web Speech Recognition (input) + Web Speech Synthesis (output).
 *
 * KEY FIX: A SpeechRecognition instance cannot be restarted after `onend`
 * fires — attempting to do so silently fails in Chrome and Safari. We now
 * create a *fresh* instance on every `startListening()` call, which is the
 * correct pattern per the spec.
 *
 * @param onFinalTranscript  Called with trimmed, final-result text.
 * @param voiceEnabled       Gates speak() — false = silent.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type { Character } from '@/lib/characters';

// webkit-prefixed Recognition types live in types/speech.d.ts

export interface UseVoiceReturn {
  isListening: boolean;
  isSpeaking: boolean;
  interimTranscript: string;
  /** Set when microphone permission is denied or another hard error occurs. */
  micError: string | null;
  startListening: () => void;
  stopListening: () => void;
  speak: (text: string, character: Character) => void;
  cancelSpeech: () => void;
  speechInputSupported: boolean;
  speechOutputSupported: boolean;
}

export function useVoice(
  onFinalTranscript: (text: string) => void,
  voiceEnabled: boolean,
): UseVoiceReturn {
  const [isListening,       setIsListening]       = useState(false);
  const [isSpeaking,        setIsSpeaking]        = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [micError,          setMicError]          = useState<string | null>(null);

  // API support is detected client-side to avoid SSR mismatches
  const [speechInputSupported,  setSpeechInputSupported]  = useState(false);
  const [speechOutputSupported, setSpeechOutputSupported] = useState(false);

  useEffect(() => {
    setSpeechInputSupported(
      typeof window !== 'undefined' &&
      ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window),
    );
    setSpeechOutputSupported(
      typeof window !== 'undefined' && 'speechSynthesis' in window,
    );
  }, []);

  // Refs keep latest values accessible inside event handlers without
  // requiring those handlers to be torn down and re-created on every render.
  const onFinalRef      = useRef(onFinalTranscript);
  const voiceEnabledRef = useRef(voiceEnabled);
  useEffect(() => { onFinalRef.current      = onFinalTranscript; }, [onFinalTranscript]);
  useEffect(() => { voiceEnabledRef.current = voiceEnabled;      }, [voiceEnabled]);

  // Holds whichever recognition session is currently active
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Abort any live session on unmount
  useEffect(() => () => { recognitionRef.current?.abort(); }, []);

  // ── Speech input ─────────────────────────────────────────────────────────

  const startListening = useCallback(() => {
    if (!speechInputSupported || isListening) return;

    // Auto-stop Buddy speaking the moment the user starts talking
    if (speechOutputSupported) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }

    // Fresh instance every time — this is the critical fix.
    // Reusing an ended SpeechRecognition causes silent failures in Chrome/Safari.
    const SpeechRec = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    const rec = new SpeechRec();

    rec.continuous     = false; // Stop automatically after the first pause
    rec.interimResults = true;  // Stream partial results for live display
    rec.lang           = 'en-US';

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let final   = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) final   += chunk;
        else                          interim += chunk;
      }

      setInterimTranscript(interim);

      if (final) {
        setInterimTranscript('');
        onFinalRef.current(final.trim());
      }
    };

    rec.onend = () => {
      setIsListening(false);
      setInterimTranscript('');
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      setIsListening(false);
      setInterimTranscript('');

      if (event.error === 'not-allowed') {
        // Permanent permission denial — surface a friendly message
        setMicError(
          'Microphone access was denied. To fix this, click the lock icon in your browser address bar and allow the microphone, then refresh the page.',
        );
      } else if (event.error === 'no-speech') {
        // User didn't say anything — not an error
      } else if (event.error !== 'aborted') {
        console.error('[useVoice] recognition error:', event.error);
      }
    };

    recognitionRef.current = rec;

    try {
      rec.start();
      setIsListening(true);
      setMicError(null); // Clear any previous error on a successful start
    } catch (err) {
      // Can throw if called in rapid succession — log and recover cleanly
      console.error('[useVoice] start() threw:', err);
      setIsListening(false);
    }
  }, [speechInputSupported, speechOutputSupported, isListening]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  // ── Speech output ─────────────────────────────────────────────────────────

  /**
   * Read `text` in the given character's voice.
   * Chrome loads voices asynchronously on first call, so we listen for
   * `voiceschanged` when the list is empty.
   */
  const speak = useCallback((text: string, character: Character) => {
    if (!speechOutputSupported || !voiceEnabledRef.current) return;

    window.speechSynthesis.cancel();

    const utterance    = new SpeechSynthesisUtterance(text);
    utterance.pitch    = character.pitch;
    utterance.rate     = character.rate;
    utterance.volume   = character.volume;
    utterance.onstart  = () => setIsSpeaking(true);
    utterance.onend    = () => setIsSpeaking(false);
    utterance.onerror  = () => setIsSpeaking(false);

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

    // Voices may not be available yet on first call (Chrome quirk)
    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.addEventListener('voiceschanged', trySpeak, { once: true });
    } else {
      trySpeak();
    }
  }, [speechOutputSupported]);

  const cancelSpeech = useCallback(() => {
    if (!speechOutputSupported) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [speechOutputSupported]);

  return {
    isListening, isSpeaking, interimTranscript, micError,
    startListening, stopListening, speak, cancelSpeech,
    speechInputSupported, speechOutputSupported,
  };
}
