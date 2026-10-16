// expo-notifications / expo-av / expo-speech: o que o cartão do exercício chama ao carregar ou ao descansar vira "não faz nada"
const noop = async () => ({ status: 'granted' });
module.exports = {
  setNotificationHandler() {}, requestPermissionsAsync: noop, getPermissionsAsync: noop, scheduleNotificationAsync: async () => 'n1', cancelScheduledNotificationAsync: noop, cancelAllScheduledNotificationsAsync: noop,
  Audio: { setAudioModeAsync: noop, Sound: { createAsync: async () => ({ sound: { playAsync: noop, unloadAsync: noop, setOnPlaybackStatusUpdate() {} } }) } },
  Video: 'Video', ResizeMode: { CONTAIN: 'contain', COVER: 'cover' }, speak() {}, stop() {},
};
