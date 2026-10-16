// rn5 + AppState e Vibration (o cronômetro de descanso do cartão do exercício usa os dois ao montar)
const base = require('./rn5.js');
module.exports = { ...base, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) }, Vibration: { vibrate() {}, cancel() {} }, useWindowDimensions: () => globalThis.__win || { width: 400, height: 800, scale: 1, fontScale: 1 } };
