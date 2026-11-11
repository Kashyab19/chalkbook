/**
 * Cue when the rest timer reaches zero.
 *
 * iOS Safari, including an installed PWA, does not implement `navigator.vibrate`.
 * The checkbox-switch haptic only runs for a real tap, and since iOS 26.5 a
 * timer cannot trigger it. The foreground alarm is a generated sine chime played
 * on an audio element: no network fetch, and the media channel stays audible
 * when the ringer switch is on silent. That element has to be started during a
 * user gesture (logging a set). Web Audio is only the fallback if that element
 * is blocked. The cue leaves `audioSession.type` alone: `playback` would
 * interrupt the user's music and might not hand it back, while a media element
 * already stays audible with the hardware silent switch on.
 *
 * This file is the foreground cue only. A locked or backgrounded iOS PWA
 * suspends the timer and this audio, so the background alert is a Web Push
 * scheduled with the server. See `lib/rest-alarm.ts`.
 */

export const REST_CUE_SAMPLE_RATE = 44100;

/**
 * Three short taps. The Vibration API has no intensity control, so a shorter
 * pattern is what makes this feel softer than a long buzz. iOS still ignores it.
 */
export const REST_COMPLETE_VIBRATION = [50, 80, 50, 80, 90] as const;

/** A rising C-E-G chime. Sine tones stay audible without the buzz of a square wave. */
const REST_COMPLETE_BEEPS = [
  { offsetSec: 0, durationSec: 0.18, hz: 523.25 },
  { offsetSec: 0.32, durationSec: 0.18, hz: 659.25 },
  { offsetSec: 0.64, durationSec: 0.26, hz: 783.99 },
] as const;

/** Half-scale sine is firm on a phone speaker. The old square wave at 0.85 was harsh. */
export const REST_CUE_GAIN = 0.6;

const TONE_GAIN = REST_CUE_GAIN;

export function restTimerShouldCue(input: {
  until: number;
  seconds: number;
  alreadySignaled: boolean;
}): boolean {
  return input.until > 0 && input.seconds === 0 && !input.alreadySignaled;
}

export function renderRestCompletePcm(): Int16Array {
  const last = REST_COMPLETE_BEEPS[REST_COMPLETE_BEEPS.length - 1];
  if (!last) return new Int16Array(0);
  const total = Math.ceil((last.offsetSec + last.durationSec) * REST_CUE_SAMPLE_RATE);
  const pcm = new Int16Array(total);
  const amplitude = Math.round(TONE_GAIN * 32767);
  const fadeSamples = Math.floor(0.018 * REST_CUE_SAMPLE_RATE);
  for (const beep of REST_COMPLETE_BEEPS) {
    const start = Math.floor(beep.offsetSec * REST_CUE_SAMPLE_RATE);
    const end = Math.min(
      total,
      Math.floor((beep.offsetSec + beep.durationSec) * REST_CUE_SAMPLE_RATE),
    );
    const period = REST_CUE_SAMPLE_RATE / beep.hz;
    for (let index = start; index < end; index++) {
      const into = index - start;
      const remaining = end - 1 - index;
      let envelope = 1;
      if (into < fadeSamples) envelope = into / fadeSamples;
      else if (remaining < fadeSamples) envelope = remaining / fadeSamples;
      const sine = Math.sin((2 * Math.PI * into) / period);
      pcm[index] = Math.round(sine * amplitude * envelope);
    }
  }
  return pcm;
}

export function restCompleteWavBytes(): Uint8Array {
  const pcm = renderRestCompletePcm();
  const dataSize = pcm.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, REST_CUE_SAMPLE_RATE, true);
  view.setUint32(28, REST_CUE_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (const sample of pcm) {
    view.setInt16(offset, sample, true);
    offset += 2;
  }
  return new Uint8Array(buffer);
}

export function restCompleteAudioSource(
  bytes: Uint8Array,
  createObjectURL?: (blob: Blob) => string,
): string {
  if (createObjectURL) {
    const copy = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(copy).set(bytes);
    return createObjectURL(new Blob([copy], { type: 'audio/wav' }));
  }
  return `data:audio/wav;base64,${bytesToBase64(bytes)}`;
}

export type RestCueAudio = {
  src: string;
  volume: number;
  muted: boolean;
  currentTime: number;
  paused: boolean;
  setAttribute: (name: string, value: string) => void;
  play: () => Promise<void>;
  pause: () => void;
};

export type RestCueWebAudio = {
  currentTime: number;
  sampleRate?: number;
  destination: object;
  resume: () => void | Promise<void>;
  createBuffer?: (channels: number, length: number, sampleRate: number) => object;
  createBufferSource?: () => {
    buffer: object | null;
    connect: (node: object) => void;
    start: (when?: number) => void;
  };
  createOscillator: () => {
    type: string;
    frequency: { value: number };
    connect: (node: object) => void;
    start: (when: number) => void;
    stop: (when: number) => void;
  };
  createGain: () => {
    gain: {
      setValueAtTime: (value: number, time: number) => void;
      exponentialRampToValueAtTime: (value: number, time: number) => void;
    };
    connect: (node: object) => void;
  };
};

export type RestCueHost = {
  createAudio: () => RestCueAudio;
  vibrate?: (pattern: readonly number[]) => void;
  audioSession?: { type: string } | null;
  webAudio?: () => RestCueWebAudio | null;
};

export function scheduleRestCompleteTone(ctx: RestCueWebAudio): void {
  const origin = ctx.currentTime;
  for (const beep of REST_COMPLETE_BEEPS) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = beep.hz;
    const at = origin + beep.offsetSec;
    const end = at + beep.durationSec;
    gain.gain.setValueAtTime(0.001, at);
    gain.gain.exponentialRampToValueAtTime(TONE_GAIN, at + 0.01);
    gain.gain.setValueAtTime(TONE_GAIN, Math.max(at + 0.01, end - 0.02));
    gain.gain.exponentialRampToValueAtTime(0.001, end);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(at);
    osc.stop(end);
  }
}

type CuePhase = 'idle' | 'unlocking' | 'ready' | 'playing';

export function createRestCue(host: RestCueHost): {
  prime: () => void;
  playComplete: () => void;
} {
  let audio: RestCueAudio | null = null;
  let phase: CuePhase = 'idle';
  const element = () => {
    audio ??= host.createAudio();
    return audio;
  };
  const openWebAudio = () => {
    const ctx = host.webAudio?.() ?? null;
    if (!ctx) return null;
    try {
      void ctx.resume();
    } catch {
      // Resuming outside a gesture can throw. The element is the primary cue.
    }
    return ctx;
  };

  return {
    prime() {
      const ctx = openWebAudio();
      if (ctx) startSilentBuffer(ctx);
      if (phase !== 'idle') return;
      const current = element();
      current.muted = true;
      current.volume = 0;
      current.setAttribute('playsinline', 'true');
      phase = 'unlocking';
      void current.play().then(
        () => {
          current.muted = false;
          current.volume = 1;
          if (phase === 'playing') return;
          current.pause();
          current.currentTime = 0;
          phase = 'ready';
        },
        () => {
          if (phase === 'unlocking') phase = 'idle';
        },
      );
    },
    playComplete() {
      if (host.vibrate) {
        try {
          host.vibrate(REST_COMPLETE_VIBRATION);
        } catch {
          // Platforms without a vibration motor still get the alarm.
        }
      }
      const current = element();
      phase = 'playing';
      current.muted = false;
      current.volume = 1;
      try {
        current.currentTime = 0;
      } catch {
        // Seeking can fail before the generated clip has loaded.
      }
      void current.play().catch(() => {
        if (phase === 'playing') phase = 'idle';
        const ctx = openWebAudio();
        if (!ctx) return;
        const start = () => {
          try {
            scheduleRestCompleteTone(ctx);
          } catch {
            // Neither speaker path is available.
          }
        };
        try {
          const pending = ctx.resume();
          if (pending && typeof pending.then === 'function') {
            void pending.then(start, start);
            return;
          }
        } catch {
          // Schedule anyway when resume is refused outside a gesture.
        }
        start();
      });
    },
  };
}

let browserCue: ReturnType<typeof createRestCue> | null = null;
let browserContext: AudioContext | null = null;

export function primeRestCue(): void {
  ensureBrowserCue()?.prime();
}

export function playRestCompleteCue(): void {
  ensureBrowserCue()?.playComplete();
}

function ensureBrowserCue(): ReturnType<typeof createRestCue> | null {
  if (browserCue) return browserCue;
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
  const source = browserAlarmSource(restCompleteWavBytes());
  browserCue = createRestCue({
    createAudio() {
      const element = new Audio(source);
      element.preload = 'auto';
      element.setAttribute('playsinline', 'true');
      element.setAttribute('aria-hidden', 'true');
      if (typeof document !== 'undefined' && document.body) {
        element.tabIndex = -1;
        element.style.display = 'none';
        document.body.appendChild(element);
      }
      return element;
    },
    vibrate(pattern) {
      if (typeof navigator.vibrate !== 'function') return;
      navigator.vibrate([...pattern]);
    },
    webAudio: () => browserWebAudio(),
  });
  return browserCue;
}

function browserWebAudio(): RestCueWebAudio | null {
  if (browserContext) return browserContext as unknown as RestCueWebAudio;
  const ctor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!ctor) return null;
  try {
    browserContext = new ctor();
    return browserContext as unknown as RestCueWebAudio;
  } catch {
    return null;
  }
}

function browserAlarmSource(bytes: Uint8Array): string {
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    try {
      return restCompleteAudioSource(bytes, (blob) => URL.createObjectURL(blob));
    } catch {
      // A data URI still keeps the clip inside the app.
    }
  }
  return restCompleteAudioSource(bytes);
}

function startSilentBuffer(ctx: RestCueWebAudio): void {
  if (!ctx.createBuffer || !ctx.createBufferSource) return;
  try {
    const buffer = ctx.createBuffer(1, 1, ctx.sampleRate ?? 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  } catch {
    // The silent buffer only unlocks older Web Audio. The alarm does not depend on it.
  }
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let index = 0; index < text.length; index++) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

// Build the clip when the workout screen loads, so the logging tap only has to
// start playback. Generating it inside that tap can spend the iOS user-gesture
// budget before play() runs.
if (typeof window !== 'undefined') {
  try {
    ensureBrowserCue();
  } catch {
    // The next tap prepares the clip again.
  }
}
