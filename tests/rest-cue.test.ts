import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  REST_COMPLETE_VIBRATION,
  REST_CUE_SAMPLE_RATE,
  createRestCue,
  renderRestCompletePcm,
  restCompleteAudioSource,
  restCompleteWavBytes,
  restTimerShouldCue,
  scheduleRestCompleteTone,
  type RestCueAudio,
  type RestCueWebAudio,
} from '../lib/rest-cue';

void test('the cue fires once when rest reaches zero and not when it is skipped', () => {
  const now = 1_000_000;
  assert.equal(
    restTimerShouldCue({ until: now + 90_000, seconds: 90, alreadySignaled: false }),
    false,
  );
  assert.equal(
    restTimerShouldCue({ until: now + 1, seconds: 1, alreadySignaled: false }),
    false,
  );
  assert.equal(
    restTimerShouldCue({ until: now, seconds: 0, alreadySignaled: false }),
    true,
  );
  assert.equal(
    restTimerShouldCue({ until: now - 20, seconds: 0, alreadySignaled: false }),
    true,
  );
  assert.equal(
    restTimerShouldCue({ until: now - 20, seconds: 0, alreadySignaled: true }),
    false,
  );
  assert.equal(
    restTimerShouldCue({ until: 0, seconds: 0, alreadySignaled: false }),
    false,
  );
  assert.equal(
    restTimerShouldCue({ until: now + 30_000, seconds: 30, alreadySignaled: false }),
    false,
  );
});

void test('the alarm is a short loud beep pattern generated in the app', () => {
  const pcm = renderRestCompletePcm();
  const duration = pcm.length / REST_CUE_SAMPLE_RATE;
  assert.ok(duration >= 0.7 && duration <= 1.2, `duration ${duration}`);

  const at = (seconds: number) => pcm[Math.floor(seconds * REST_CUE_SAMPLE_RATE)] ?? 0;
  assert.ok(Math.abs(at(0.08)) > 20_000, 'first beep is loud');
  assert.ok(Math.abs(at(0.32)) > 20_000, 'second beep is loud');
  assert.ok(Math.abs(at(0.66)) > 20_000, 'final beep is loud');
  assert.ok(Math.abs(at(0.2)) < 200, 'beeps are separated by silence');

  const beepStart = Math.floor(0.04 * REST_CUE_SAMPLE_RATE);
  const beepEnd = Math.floor(0.12 * REST_CUE_SAMPLE_RATE);
  let extreme = 0;
  for (let index = beepStart; index < beepEnd; index++) {
    if (Math.abs(pcm[index] ?? 0) > 20_000) extreme++;
  }
  assert.ok(extreme / (beepEnd - beepStart) > 0.8, 'the tone is a square wave, not a soft sine');

  const bytes = restCompleteWavBytes();
  assert.equal(Buffer.from(bytes.subarray(0, 4)).toString('ascii'), 'RIFF');
  assert.equal(Buffer.from(bytes.subarray(8, 12)).toString('ascii'), 'WAVE');
  assert.ok(bytes.length > pcm.length);

  const captured: { blob: Blob | null } = { blob: null };
  const url = restCompleteAudioSource(bytes, (created) => {
    captured.blob = created;
    return 'blob:rest-complete';
  });
  assert.equal(url, 'blob:rest-complete');
  assert.equal(captured.blob?.type, 'audio/wav');
  assert.equal(url.startsWith('http'), false);

  const dataUrl = restCompleteAudioSource(bytes);
  assert.equal(dataUrl.startsWith('data:audio/wav;base64,'), true);
  assert.equal(dataUrl.includes('https://'), false);
});

class FakeAudio implements RestCueAudio {
  src: string;
  volume = 1;
  muted = false;
  currentTime = 0;
  paused = true;
  plays = 0;
  attributes = new Map<string, string>();
  playImpl: () => Promise<void> = async () => {
    this.paused = false;
  };

  constructor(src = '') {
    this.src = src;
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }

  play() {
    this.plays++;
    return this.playImpl();
  }

  pause() {
    this.paused = true;
  }
}

function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

void test('a logging gesture unlocks the alarm without sounding it', async () => {
  const audios: FakeAudio[] = [];
  const session = { type: 'auto' };
  let resumed = 0;
  const cue = createRestCue({
    createAudio() {
      const audio = new FakeAudio('blob:rest-complete');
      audios.push(audio);
      return audio;
    },
    audioSession: session,
    webAudio: () => ({
      currentTime: 0,
      destination: {},
      resume() {
        resumed++;
      },
      createOscillator: () => {
        throw new Error('unlock should not schedule the alarm');
      },
      createGain: () => {
        throw new Error('unlock should not schedule the alarm');
      },
    }),
  });

  cue.prime();
  cue.prime();
  assert.equal(
    session.type,
    'auto',
    'rest cues must not take over the playback audio session',
  );
  assert.equal(resumed, 2);
  assert.equal(audios.length, 1);
  assert.equal(audios[0]?.plays, 1);
  assert.equal(audios[0]?.muted, true);
  assert.equal(audios[0]?.volume, 0);
  assert.equal(audios[0]?.attributes.get('playsinline'), 'true');

  await Promise.resolve();
  await Promise.resolve();
  assert.equal(audios[0]?.paused, true);
  assert.equal(audios[0]?.currentTime, 0);
  assert.equal(audios[0]?.muted, false);
  assert.equal(audios[0]?.volume, 1);
});

void test('rest completion vibrates where it can and plays the alarm aloud', async () => {
  const patterns: number[][] = [];
  const audios: FakeAudio[] = [];
  const cue = createRestCue({
    createAudio() {
      const audio = new FakeAudio('blob:rest-complete');
      audios.push(audio);
      return audio;
    },
    vibrate(pattern) {
      patterns.push([...pattern]);
    },
  });

  cue.prime();
  await Promise.resolve();
  cue.playComplete();

  assert.deepEqual(patterns, [[...REST_COMPLETE_VIBRATION]]);
  assert.equal(REST_COMPLETE_VIBRATION.length, 5);
  assert.ok(Math.max(...REST_COMPLETE_VIBRATION) >= 300);
  assert.equal(audios[0]?.muted, false);
  assert.equal(audios[0]?.volume, 1);
  assert.equal(audios[0]?.paused, false);
  assert.equal(audios[0]?.plays, 2);
});

void test('vibration is optional and a blocked element falls back to the generated tone', async () => {
  const audios: FakeAudio[] = [];
  const tones: number[] = [];
  const webAudio = fakeWebAudio(() => {
    tones.push(1);
  });
  const cue = createRestCue({
    createAudio() {
      const audio = new FakeAudio();
      audio.playImpl = () => Promise.reject(new Error('blocked'));
      audios.push(audio);
      return audio;
    },
    vibrate() {
      throw new Error('unsupported');
    },
    webAudio: () => webAudio,
  });

  assert.doesNotThrow(() => cue.playComplete());
  await Promise.resolve();
  assert.equal(audios[0]?.plays, 1);
  assert.equal(audios[0]?.volume, 1);
  assert.equal(tones.length, 3);
  assert.equal(webAudio.oscillators.length, 3);
  assert.ok(webAudio.oscillators.every((osc) => osc.type === 'square'));
  assert.ok(webAudio.gains.some((value) => value >= 0.7));
});

void test('a late unlock does not pause an alarm that already started', async () => {
  const gate = deferred();
  const audios: FakeAudio[] = [];
  const cue = createRestCue({
    createAudio() {
      const audio = new FakeAudio();
      audio.playImpl = () => {
        audio.paused = false;
        return audio.plays === 1 ? gate.promise : Promise.resolve();
      };
      audios.push(audio);
      return audio;
    },
  });

  cue.prime();
  cue.playComplete();
  assert.equal(audios[0]?.volume, 1);
  assert.equal(audios[0]?.muted, false);
  gate.resolve();
  await gate.promise;
  await Promise.resolve();
  assert.equal(audios[0]?.paused, false);
  assert.equal(audios[0]?.volume, 1);
  assert.equal(audios[0]?.muted, false);
});

void test('the fallback tone is three strong square beeps', () => {
  const webAudio = fakeWebAudio();
  scheduleRestCompleteTone(webAudio);
  assert.equal(webAudio.oscillators.length, 3);
  assert.deepEqual(
    webAudio.oscillators.map((osc) => osc.type),
    ['square', 'square', 'square'],
  );
  assert.ok(webAudio.oscillators.every((osc) => osc.stop - osc.start >= 0.14));
  assert.equal(webAudio.oscillators[0]?.start, webAudio.currentTime);
  assert.ok(webAudio.oscillators[2]!.stop - webAudio.oscillators[1]!.stop >= 0.1);
  assert.ok(webAudio.gains.some((value) => value >= 0.7));
});

function fakeWebAudio(onSchedule?: () => void): RestCueWebAudio & {
  oscillators: { type: string; hz: number; start: number; stop: number }[];
  gains: number[];
} {
  const oscillators: { type: string; hz: number; start: number; stop: number }[] = [];
  const gains: number[] = [];
  const webAudio = {
    currentTime: 4,
    destination: {},
    oscillators,
    gains,
    resume() {},
    createOscillator() {
      const osc = {
        type: 'sine',
        frequency: { value: 0 },
        connect() {},
        start(when: number) {
          onSchedule?.();
          oscillators.push({
            type: osc.type,
            hz: osc.frequency.value,
            start: when,
            stop: when,
          });
        },
        stop(when: number) {
          const latest = oscillators.at(-1);
          if (latest) latest.stop = when;
        },
      };
      return osc;
    },
    createGain() {
      return {
        gain: {
          setValueAtTime(value: number) {
            gains.push(value);
          },
          exponentialRampToValueAtTime(value: number) {
            gains.push(value);
          },
        },
        connect() {},
      };
    },
  };
  return webAudio;
}
