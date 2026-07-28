/**
 * The myB signature sound — the three-note chime that plays whenever something
 * lands: a job booked, a request accepted, verification passed.
 *
 * Two deliberate choices:
 *  - The player is created lazily and cached, so the first celebration of a
 *    session is the only one that pays for decoding.
 *  - Everything is wrapped in try/catch and the module is required, not
 *    imported. If audio is unavailable on a device the celebration still runs
 *    with its animation and haptic — a missing sound must never be able to
 *    break the moment during a live demo.
 */

interface ChimePlayer {
  play: () => void;
  seekTo: (seconds: number) => Promise<void> | void;
  volume: number;
}

let player: ChimePlayer | null = null;
let unavailable = false;

function getPlayer(): ChimePlayer | null {
  if (unavailable) return null;
  if (player) return player;
  try {
    // require, not import: a static import evaluates expo-audio's native
    // module at bundle time, which is the exact failure this survives.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const audio = require('expo-audio') as typeof import('expo-audio');
    // Play through the iOS silent switch — the demo phone is usually muted.
    void audio
      .setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' })
      .catch(() => {});
    player = audio.createAudioPlayer(
      require('../../assets/booked.wav'),
    ) as unknown as ChimePlayer;
    player.volume = 0.85;
    return player;
  } catch {
    unavailable = true;
    return null;
  }
}

/** Plays the confirmation chime from the top. Safe to call repeatedly. */
export function playChime() {
  try {
    const instance = getPlayer();
    if (!instance) return;
    void Promise.resolve(instance.seekTo(0))
      .then(() => instance.play())
      .catch(() => {});
  } catch {
    // Never let audio break a celebration.
  }
}

/**
 * Decodes the chime ahead of time so the first play is not late. Called once
 * when the app boots.
 */
export function warmChime() {
  getPlayer();
}
