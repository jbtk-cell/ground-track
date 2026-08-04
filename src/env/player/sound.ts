/**
 * Sound for the player rig.
 *
 * Footsteps and one switch click, and nothing else. The samples are third-party
 * CC0 recordings, not synthesis - see src/assets/audio/ATTRIBUTION.md for what
 * they are and where they came from. A footstep built out of filtered noise
 * always sounds like a footstep built out of filtered noise.
 *
 * Web Audio, decoded once into buffers and fired from a pool of one-shot source
 * nodes. No library: the whole job is "play this buffer at this rate and gain",
 * which is four lines, and an engine would only add a graph to fight with.
 *
 * Autoplay policy: browsers refuse an AudioContext until the user has gestured
 * at the page, and refuse it silently. The context is therefore created lazily
 * on the first real input and resumed on every gesture until it sticks, so the
 * room is never mute-but-apparently-fine. If audio never unlocks, everything
 * here degrades to doing nothing at all - it must never take the room with it.
 */

import SWITCH_URL from '../../assets/audio/ui/switch_002.ogg?url';
import LIMB_TICK_URL from '../../assets/audio/limb/tick_002.ogg?url';
import LIMB_SEAT_URL from '../../assets/audio/limb/close_001.ogg?url';

/** Footstep samples, in order. Vite turns each into a hashed asset URL. */
const FOOTSTEP_URLS = Object.values(
  import.meta.glob<string>('../../assets/audio/footstep/*.ogg', {
    eager: true,
    query: '?url',
    import: 'default',
  })
).sort();

export interface PlayOptions {
  /** Playback rate. 1 is the sample's own pitch. */
  readonly rate?: number;
  /** Linear gain, 0 to 1. */
  readonly gain?: number;
  /** Seconds from now. Scheduled on the audio clock, not with a timer. */
  readonly delay?: number;
}

export interface SoundHandle {
  /** True once the context is running and the buffers are decoded. */
  ready(): boolean;
  /** Call from any user gesture. Safe to call repeatedly. */
  unlock(): void;
  footstep(index: number, options?: PlayOptions): void;
  switchClick(options?: PlayOptions): void;
  /**
   * The limb's magnets letting go: a short run of ticks that spreads out.
   *
   * One tick per coupling, in the order they actually open, and the interval
   * between them WIDENS - which is not a flourish, it is the geometry made
   * audible. The gaps grow toward the wrist (GAP_WEIGHTS in arm.ts), so the
   * couplings nearest the shoulder part almost together and the wrist parts
   * last and furthest. A run at even spacing would be a buzz; the widening is
   * the whole character of the sound.
   */
  limbRelease(): void;
  /** The stack closing up again: one soft seat, no fanfare. */
  limbSeat(): void;
  /**
   * The door's motor, held at whatever the door is actually doing.
   *
   * `level` is 0 to 1 of full travel speed, pushed every frame. Synthesised for
   * the same reason the room tone is: it has to rise and fall WITH a two-metre
   * slab the player is watching move, and a canned loop cannot. It is the one
   * sound in the room that is a continuous function of a mechanism's state
   * rather than an event.
   */
  doorMotor(level: number): void;
  /** The lock letting go, and the slab landing. Two ends of the same travel. */
  doorClunk(kind: 'release' | 'seat'): void;
  /**
   * The room tone: forced ventilation, running continuously.
   *
   * `bladePassHz` is the fan's own blade-pass frequency, so the hum is pitched
   * to the impeller the player can watch turning behind the grille. Idempotent
   * - call it whenever, it starts once.
   */
  roomTone(bladePassHz: number): void;
  dispose(): void;
}

/**
 * Master levels.
 *
 * The room is quiet and the walk is not an event - it is the floor the room
 * sits on, and it should be felt at the edge of hearing rather than announced.
 * A footstep loud enough to notice as a sound is a footstep you notice instead
 * of the place you are walking through, and it stops being furniture within a
 * minute of walking. The switch sits well above it on purpose: that one IS an
 * event, and it is the only confirmation the press happened.
 */
const FOOTSTEP_GAIN = 0.19;
const SWITCH_GAIN = 0.5;

/**
 * The room tone, and why this one is synthesised when nothing else here is.
 *
 * Every other sound in this game is a third-party CC0 recording, on the
 * principle that hand-made effects come out sounding hand-made. A continuous
 * machine hum is the exception, and for a structural reason rather than a
 * preference: it has to be LOCKED to the impeller the player can see turning
 * behind the grille at 1.05 Hz. A canned loop cannot be, and a fan you watch
 * spinning at one rate while hearing another is two machines - the ear catches
 * it even when it cannot say why. Cabin ventilation is also, physically, exactly
 * this: broadband air noise with the blade-pass frequency and its harmonics
 * standing on top. Recording one would be recording a synthesiser's homework.
 *
 * Held quiet. This is the floor the room stands on, not an event: loud enough
 * that switching it off would be noticed, never loud enough to be listened to.
 */
/**
 * The limb. Both well under the switch, which is the room's one real event.
 *
 * The limb is the player's own body and it moves constantly; anything on it
 * that announces itself becomes the loudest thing in a quiet room within a
 * minute of walking. These are meant to be noticed the first few times and then
 * to become texture.
 */
const LIMB_TICK_GAIN = 0.17;
const LIMB_SEAT_GAIN = 0.28;
/** Couplings, and how the interval between their ticks grows. */
const LIMB_TICKS = 6;
const LIMB_FIRST_GAP_S = 0.017;
const LIMB_GAP_GROWTH = 1.42;

/** The door. Heavier than the limb, lighter than nothing else in the room. */
const DOOR_MOTOR_GAIN = 0.11;
const DOOR_CLUNK_GAIN = 0.42;
/** Seconds the motor takes to follow a change in speed. Machines have inertia. */
const DOOR_MOTOR_LAG_S = 0.12;

const TONE_GAIN = 0.06;
/** Seconds to fade in. Slow, so the room is never switched on. */
const TONE_FADE_S = 2.5;
/** Air noise above this is hiss, not ventilation. */
const TONE_CUTOFF_HZ = 420;
/** Seconds of noise in the loop. Long enough not to hear the seam. */
const TONE_LOOP_S = 4;

/** The audio layer has no business importing a render library for one clamp. */
function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function createSound(): SoundHandle {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let footsteps: (AudioBuffer | null)[] = [];
  let switchBuffer: AudioBuffer | null = null;
  let limbTick: AudioBuffer | null = null;
  let limbSeatBuffer: AudioBuffer | null = null;
  let loading = false;
  let dead = false;
  let tone: GainNode | null = null;
  let motor: GainNode | null = null;

  const load = async (): Promise<void> => {
    if (context === null || loading) return;
    loading = true;
    const fetchBuffer = async (url: string): Promise<AudioBuffer | null> => {
      try {
        const response = await fetch(url);
        const bytes = await response.arrayBuffer();
        return await context!.decodeAudioData(bytes);
      } catch {
        // A missing or undecodable sample silences one footstep, not the room.
        return null;
      }
    };
    const [steps, click, tick, seat] = await Promise.all([
      Promise.all(FOOTSTEP_URLS.map(fetchBuffer)),
      fetchBuffer(SWITCH_URL),
      fetchBuffer(LIMB_TICK_URL),
      fetchBuffer(LIMB_SEAT_URL),
    ]);
    footsteps = steps;
    switchBuffer = click;
    limbTick = tick;
    limbSeatBuffer = seat;
  };

  const play = (buffer: AudioBuffer | null, gain: number, options?: PlayOptions): void => {
    if (context === null || master === null || buffer === null) return;
    if (context.state !== 'running') return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = options?.rate ?? 1;
    const amp = context.createGain();
    amp.gain.value = gain * (options?.gain ?? 1);
    source.connect(amp).connect(master);
    // Scheduled on the audio clock rather than a setTimeout: a run of ticks
    // this tight would be audibly ragged if it were paced by the main thread.
    source.start(context.currentTime + Math.max(0, options?.delay ?? 0));
    // One-shots clean themselves up; nothing here holds a reference.
    source.onended = () => {
      source.disconnect();
      amp.disconnect();
    };
  };

  return {
    ready() {
      return context?.state === 'running' && footsteps.length > 0;
    },

    unlock() {
      if (dead) return;
      if (context === null) {
        const Ctor: typeof AudioContext | undefined =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctor === undefined) {
          // No Web Audio at all. Stay silent rather than throwing on every step.
          dead = true;
          return;
        }
        context = new Ctor();
        master = context.createGain();
        master.gain.value = 1;
        master.connect(context.destination);
        void load();
      }
      if (context.state === 'suspended') void context.resume();
    },

    footstep(index, options) {
      const buffer = footsteps[((index % footsteps.length) + footsteps.length) % footsteps.length];
      play(buffer ?? null, FOOTSTEP_GAIN, options);
    },

    switchClick(options) {
      play(switchBuffer, SWITCH_GAIN, options);
    },

    limbRelease() {
      let delay = 0;
      let gap = LIMB_FIRST_GAP_S;
      for (let i = 0; i < LIMB_TICKS; i += 1) {
        const across = i / (LIMB_TICKS - 1);
        play(limbTick, LIMB_TICK_GAIN, {
          delay,
          // Falling pitch down the limb: the couplings taper wrist-ward, and a
          // smaller part rings higher, so this runs the other way from the
          // spacing. Two things changing in opposite directions is what stops
          // six copies of one sample reading as six copies of one sample.
          rate: 1.62 - across * 0.42,
          gain: 1 - across * 0.35,
        });
        delay += gap;
        gap *= LIMB_GAP_GROWTH;
      }
    },

    limbSeat() {
      play(limbSeatBuffer, LIMB_SEAT_GAIN, { rate: 0.92 });
    },

    doorMotor(level) {
      if (dead || context === null || master === null) return;
      if (context.state !== 'running') return;
      if (motor === null) {
        const bed = context.createGain();
        bed.gain.value = 0;
        bed.connect(master);
        // A geared drive: a low sawtooth for the motor and a band of noise for
        // the slab in its channel. Both are always running; only the gain moves,
        // so there is never a start-up click at the top of a travel.
        const drive = context.createOscillator();
        drive.type = 'sawtooth';
        drive.frequency.value = 74;
        const shape = context.createBiquadFilter();
        shape.type = 'lowpass';
        shape.frequency.value = 340;
        shape.Q.value = 3.5;
        const driveGain = context.createGain();
        driveGain.gain.value = 0.55;
        drive.connect(shape).connect(driveGain).connect(bed);
        drive.start();

        const rumble = context.createOscillator();
        rumble.type = 'triangle';
        rumble.frequency.value = 37;
        const rumbleGain = context.createGain();
        rumbleGain.gain.value = 0.5;
        rumble.connect(rumbleGain).connect(bed);
        rumble.start();
        motor = bed;
      }
      const wanted = clamp01(level) * DOOR_MOTOR_GAIN;
      motor.gain.setTargetAtTime(wanted, context.currentTime, DOOR_MOTOR_LAG_S);
    },

    doorClunk(kind) {
      // Same sample both ends, pitched apart: a lock letting go is a lighter,
      // faster event than two metres of slab arriving on its sill.
      play(limbSeatBuffer, DOOR_CLUNK_GAIN, {
        rate: kind === 'release' ? 0.78 : 0.52,
        gain: kind === 'release' ? 0.72 : 1,
      });
    },

    roomTone(bladePassHz) {
      if (dead || context === null || master === null || tone !== null) return;
      if (context.state !== 'running') return;

      const bed = context.createGain();
      bed.gain.value = 0;
      bed.connect(master);

      // --- Air. Brown-ish noise: a running integral of white, which falls off
      // with frequency the way moving air does. White noise through a filter
      // still sounds like a hiss gate; this sounds like a duct.
      const frames = Math.floor(context.sampleRate * TONE_LOOP_S);
      const buffer = context.createBuffer(1, frames, context.sampleRate);
      const channel = buffer.getChannelData(0);
      // Fixed seed. Everything else in this room renders the same on every
      // machine; there is no reason for the air to be the exception.
      let seed = 0x1f2e3d >>> 0;
      let last = 0;
      for (let i = 0; i < frames; i += 1) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const white = (seed / 2147483648 - 1) * 0.5;
        last = (last + 0.02 * white) / 1.02;
        channel[i] = last * 12;
      }
      // Cross-fade the tail over the head so the loop point is not a click.
      const blend = Math.floor(context.sampleRate * 0.25);
      for (let i = 0; i < blend; i += 1) {
        const k = i / blend;
        const head = channel[i] ?? 0;
        const tail = channel[frames - blend + i] ?? 0;
        channel[i] = head * k + tail * (1 - k);
      }

      const air = context.createBufferSource();
      air.buffer = buffer;
      air.loop = true;
      const duct = context.createBiquadFilter();
      duct.type = 'lowpass';
      duct.frequency.value = TONE_CUTOFF_HZ;
      duct.Q.value = 0.7;
      const airGain = context.createGain();
      airGain.gain.value = 0.85;
      air.connect(duct).connect(airGain).connect(bed);
      air.start();

      // --- The fan itself. Blade pass and its second harmonic, both well under
      // the air so they are a colour on it rather than a note over it.
      const oscillators: OscillatorNode[] = [];
      for (const [multiple, level] of [
        [1, 0.1],
        [2, 0.045],
      ] as const) {
        const osc = context.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = bladePassHz * multiple;
        const gain = context.createGain();
        gain.gain.value = level;
        osc.connect(gain).connect(bed);
        osc.start();
        oscillators.push(osc);
      }

      bed.gain.setValueAtTime(0, context.currentTime);
      bed.gain.linearRampToValueAtTime(TONE_GAIN, context.currentTime + TONE_FADE_S);
      tone = bed;
    },

    dispose() {
      dead = true;
      tone?.disconnect();
      tone = null;
      motor?.disconnect();
      motor = null;
      master?.disconnect();
      void context?.close();
      context = null;
      master = null;
      footsteps = [];
      switchBuffer = null;
      limbTick = null;
      limbSeatBuffer = null;
    },
  };
}
