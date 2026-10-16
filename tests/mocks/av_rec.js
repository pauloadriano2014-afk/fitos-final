// expo-av com GRAVAÇÃO simulada: o teste controla permissão, URI e duração pelo globalThis.__REC
const Audio = {
  requestPermissionsAsync: async () => ({ granted: (globalThis.__REC || {}).denied ? false : true }),
  setAudioModeAsync: async (m) => { (globalThis.__audioModes = globalThis.__audioModes || []).push(m); },
  RecordingOptionsPresets: { HIGH_QUALITY: { web: {} } },
  Recording: { createAsync: async () => { const R = globalThis.__REC || {}; if (R.failStart) throw new Error('mic'); const started = Date.now(); return { recording: { stopAndUnloadAsync: async () => { globalThis.__recStopped = (globalThis.__recStopped || 0) + 1; }, getURI: () => (R.noUri ? null : 'file:///tmp/nota.m4a'), __started: started } }; } },
  Sound: { createAsync: async () => ({ sound: {} }) },
};
const Video = () => null; const ResizeMode = { CONTAIN: 'contain', COVER: 'cover' };
module.exports = { Audio, Video, ResizeMode };
