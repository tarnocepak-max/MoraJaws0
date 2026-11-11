import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { SoundSettings } from '../types';

export interface SoundContextType {
  soundSettings: SoundSettings;
  updateSoundSettings: (updates: Partial<SoundSettings>) => void;
  playLoadingSound: () => void;
  playReadySound: () => void;
  playReportSavedSound: () => void;
  playErrorSound: () => void;
  playSyncSound: () => void;
  previewSound: (type: 'loading' | 'ready' | 'report_saved' | 'error' | 'sync') => void;
}

const DEFAULT_SETTINGS: SoundSettings = {
  enabled: true,
  volume: 75,
  soundLoading: true,
  soundReady: true,
  soundReportSaved: true,
  soundError: true,
  soundSync: true
};

const SoundContext = createContext<SoundContextType | undefined>(undefined);

export const MoraJawsSoundProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [soundSettings, setSoundSettings] = useState<SoundSettings>(() => {
    try {
      const stored = localStorage.getItem('morajaws_sound_preferences');
      if (stored) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch {
      // Fallback
    }
    return DEFAULT_SETTINGS;
  });

  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastSoundTimeRef = useRef<Record<string, number>>({});

  // Save preferences to localStorage whenever changed
  const updateSoundSettings = useCallback((updates: Partial<SoundSettings>) => {
    setSoundSettings(prev => {
      const next = { ...prev, ...updates };
      try {
        localStorage.setItem('morajaws_sound_preferences', JSON.stringify(next));
      } catch {
        // Safe catch
      }
      return next;
    });
  }, []);

  // Initialize or get Web Audio Context safely
  const getAudioContext = useCallback((): AudioContext | null => {
    try {
      if (!audioCtxRef.current) {
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtxClass) {
          audioCtxRef.current = new AudioCtxClass();
        }
      }
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
      return audioCtxRef.current;
    } catch {
      return null;
    }
  }, []);

  // Auto-resume AudioContext on first user interaction (Android Autoplay restriction fix)
  useEffect(() => {
    const unlockAudio = () => {
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };

    window.addEventListener('click', unlockAudio, { passive: true });
    window.addEventListener('touchstart', unlockAudio, { passive: true });
    window.addEventListener('keydown', unlockAudio, { passive: true });

    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  // Deduplication check
  const canPlay = useCallback((soundKey: string, minIntervalMs = 350): boolean => {
    const now = Date.now();
    const last = lastSoundTimeRef.current[soundKey] || 0;
    if (now - last < minIntervalMs) {
      return false;
    }
    lastSoundTimeRef.current[soundKey] = now;
    return true;
  }, []);

  // Helper to get master gain node scaled to volume
  const createMasterGain = useCallback((ctx: AudioContext, customVol?: number) => {
    const volPercent = customVol !== undefined ? customVol : soundSettings.volume;
    const gainNode = ctx.createGain();
    // Exponential curve for human ear perception
    const normalizedVol = Math.max(0, Math.min(100, volPercent)) / 100;
    gainNode.gain.setValueAtTime(normalizedVol * 0.28, ctx.currentTime);
    gainNode.connect(ctx.destination);
    return gainNode;
  }, [soundSettings.volume]);

  // 1. APPLICATION LOADING SOUND
  // Futuristic soft digital intro with gentle swelling harmonic resonance
  const playLoadingSoundInternal = useCallback((force = false) => {
    if (!force && (!soundSettings.enabled || !soundSettings.soundLoading)) return;
    if (!force && !canPlay('loading', 800)) return;

    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const master = createMasterGain(ctx);

      // Low warm pad
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(220, now); // A3
      osc1.frequency.exponentialRampToValueAtTime(329.63, now + 0.35); // E4
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.3, now + 0.12);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
      osc1.connect(gain1);
      gain1.connect(master);
      osc1.start(now);
      osc1.stop(now + 0.7);

      // High digital shimmer
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(554.37, now + 0.08); // C#5
      osc2.frequency.exponentialRampToValueAtTime(880, now + 0.4); // A5
      gain2.gain.setValueAtTime(0, now);
      gain2.gain.setValueAtTime(0, now + 0.08);
      gain2.gain.linearRampToValueAtTime(0.2, now + 0.2);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc2.connect(gain2);
      gain2.connect(master);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.65);
    } catch {
      // Safe catch
    }
  }, [soundSettings.enabled, soundSettings.soundLoading, canPlay, getAudioContext, createMasterGain]);

  // 2. APPLICATION READY SOUND
  // Sparkling ascending futuristic chime (C5 -> E5 -> G5 -> C6)
  const playReadySoundInternal = useCallback((force = false) => {
    if (!force && (!soundSettings.enabled || !soundSettings.soundReady)) return;
    if (!force && !canPlay('ready', 800)) return;

    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const master = createMasterGain(ctx);

      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const noteStart = now + idx * 0.07;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, noteStart);

        gain.gain.setValueAtTime(0, noteStart);
        gain.gain.linearRampToValueAtTime(0.25, noteStart + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.45);

        osc.connect(gain);
        gain.connect(master);

        osc.start(noteStart);
        osc.stop(noteStart + 0.5);
      });
    } catch {
      // Safe catch
    }
  }, [soundSettings.enabled, soundSettings.soundReady, canPlay, getAudioContext, createMasterGain]);

  // 3. REPORT SAVED SOUND
  // Distinctive crystal confirmation chime (D5 -> A5 with lilac overtone resonance)
  const playReportSavedSoundInternal = useCallback((force = false) => {
    if (!force && (!soundSettings.enabled || !soundSettings.soundReportSaved)) return;
    if (!force && !canPlay('report_saved', 600)) return;

    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const master = createMasterGain(ctx);

      // First confirmation bell (D5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.35, now + 0.015);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc1.connect(gain1);
      gain1.connect(master);
      osc1.start(now);
      osc1.stop(now + 0.4);

      // Second harmonic crystal bell (A5)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.09);
      gain2.gain.setValueAtTime(0, now + 0.09);
      gain2.gain.linearRampToValueAtTime(0.4, now + 0.11);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
      osc2.connect(gain2);
      gain2.connect(master);
      osc2.start(now + 0.09);
      osc2.stop(now + 0.7);

      // Gentle sub-harmonic for fullness (D4)
      const osc3 = ctx.createOscillator();
      const gain3 = ctx.createGain();
      osc3.type = 'triangle';
      osc3.frequency.setValueAtTime(293.66, now + 0.09);
      gain3.gain.setValueAtTime(0, now + 0.09);
      gain3.gain.linearRampToValueAtTime(0.15, now + 0.12);
      gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc3.connect(gain3);
      gain3.connect(master);
      osc3.start(now + 0.09);
      osc3.stop(now + 0.5);
    } catch {
      // Safe catch
    }
  }, [soundSettings.enabled, soundSettings.soundReportSaved, canPlay, getAudioContext, createMasterGain]);

  // 4. ERROR SOUND
  // Discrete, polite futuristic error chord (minor third fall: 311Hz -> 233Hz)
  const playErrorSoundInternal = useCallback((force = false) => {
    if (!force && (!soundSettings.enabled || !soundSettings.soundError)) return;
    if (!force && !canPlay('error', 600)) return;

    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const master = createMasterGain(ctx);

      // Tone 1: Eb4
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(311.13, now);
      osc1.frequency.exponentialRampToValueAtTime(233.08, now + 0.22); // Bb3
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.2, now + 0.02);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      // Low pass filter to soften the sawtooth
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(900, now);

      osc1.connect(filter);
      filter.connect(gain1);
      gain1.connect(master);

      osc1.start(now);
      osc1.stop(now + 0.38);
    } catch {
      // Safe catch
    }
  }, [soundSettings.enabled, soundSettings.soundError, canPlay, getAudioContext, createMasterGain]);

  // 5. SYNC SOUND
  // Dual futuristic digital blip (600Hz -> 900Hz)
  const playSyncSoundInternal = useCallback((force = false) => {
    if (!force && (!soundSettings.enabled || !soundSettings.soundSync)) return;
    if (!force && !canPlay('sync', 500)) return;

    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const master = createMasterGain(ctx);

      // Pulse 1
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, now);
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.25, now + 0.015);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc1.connect(gain1);
      gain1.connect(master);
      osc1.start(now);
      osc1.stop(now + 0.16);

      // Pulse 2
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(987.77, now + 0.09);
      gain2.gain.setValueAtTime(0, now + 0.09);
      gain2.gain.linearRampToValueAtTime(0.28, now + 0.105);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc2.connect(gain2);
      gain2.connect(master);
      osc2.start(now + 0.09);
      osc2.stop(now + 0.32);
    } catch {
      // Safe catch
    }
  }, [soundSettings.enabled, soundSettings.soundSync, canPlay, getAudioContext, createMasterGain]);

  // Public triggers
  const playLoadingSound = useCallback(() => playLoadingSoundInternal(false), [playLoadingSoundInternal]);
  const playReadySound = useCallback(() => playReadySoundInternal(false), [playReadySoundInternal]);
  const playReportSavedSound = useCallback(() => playReportSavedSoundInternal(false), [playReportSavedSoundInternal]);
  const playErrorSound = useCallback(() => playErrorSoundInternal(false), [playErrorSoundInternal]);
  const playSyncSound = useCallback(() => playSyncSoundInternal(false), [playSyncSoundInternal]);

  // Sound Preview function (always plays regardless of toggle to allow user testing)
  const previewSound = useCallback((type: 'loading' | 'ready' | 'report_saved' | 'error' | 'sync') => {
    switch (type) {
      case 'loading':
        playLoadingSoundInternal(true);
        break;
      case 'ready':
        playReadySoundInternal(true);
        break;
      case 'report_saved':
        playReportSavedSoundInternal(true);
        break;
      case 'error':
        playErrorSoundInternal(true);
        break;
      case 'sync':
        playSyncSoundInternal(true);
        break;
    }
  }, [playLoadingSoundInternal, playReadySoundInternal, playReportSavedSoundInternal, playErrorSoundInternal, playSyncSoundInternal]);

  return (
    <SoundContext.Provider
      value={{
        soundSettings,
        updateSoundSettings,
        playLoadingSound,
        playReadySound,
        playReportSavedSound,
        playErrorSound,
        playSyncSound,
        previewSound
      }}
    >
      {children}
    </SoundContext.Provider>
  );
};

export const useMoraJawsSound = (): SoundContextType => {
  const context = useContext(SoundContext);
  if (!context) {
    throw new Error('useMoraJawsSound must be used within a MoraJawsSoundProvider');
  }
  return context;
};
