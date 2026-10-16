globalThis.__beeps = globalThis.__beeps || []; globalThis.__audioModes = globalThis.__audioModes || []; globalThis.__created = globalThis.__created || [];
const Audio = {
  setAudioModeAsync: async (m) => { globalThis.__audioModes.push(m); },
  Sound: { createAsync: async (src) => { globalThis.__created.push(typeof src === 'string' ? src.length : -1); return { sound: { size: typeof src === 'string' ? src.length : -1, replayAsync: async function () { globalThis.__beeps.push(this.size); }, unloadAsync: async () => { globalThis.__unloaded = (globalThis.__unloaded || 0) + 1; } } }; } },
};
module.exports = { Audio };
