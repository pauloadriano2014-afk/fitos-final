// expo-av com Video controlável: globalThis.__video = { instances: [], calls: [] }
const React = require('react');
const st = () => (globalThis.__video = globalThis.__video || { instances: [], calls: [] });
const Video = React.forwardRef(function Video(props, ref) {
  React.useImperativeHandle(ref, () => ({
    setPositionAsync: async (ms) => { st().calls.push(['seek', ms]); },
    pauseAsync: async () => { st().calls.push(['pause']); },
    getStatusAsync: async () => st().status || { isLoaded: false },
    playAsync: async () => { st().calls.push(['play']); },
  }));
  st().instances.push(props);
  return React.createElement('Video', props);
});
const ResizeMode = { CONTAIN: 'contain', COVER: 'cover' };
const Audio = { setAudioModeAsync: async () => {}, Sound: { createAsync: async () => ({ sound: {} }) } };
module.exports = { Video, ResizeMode, Audio };
