const React = require('react');
Object.defineProperty(exports, '__esModule', { value: true });
// react-native-view-shot controlável: globalThis.__vs = { failSized, failAll, calls, refCalls }
const st = () => (globalThis.__vs = globalThis.__vs || { failSized: false, failAll: false, calls: [], refCalls: [] });
const ViewShot = React.forwardRef(({ children, options }, ref) => {
  React.useImperativeHandle(ref, () => ({ capture: async () => { const s = st(); s.calls.push(options); if (s.failAll || (s.failSized && options && options.width)) throw new Error('captura falhou'); return 'file:///shot-' + (options && options.width ? 'story' : 'card') + '.png'; } }));
  return React.createElement('ViewShot', { options }, children);
});
exports.default = ViewShot;
exports.captureRef = async (ref, opts) => { const s = st(); s.refCalls.push(opts); if (s.failAll) throw new Error('captura falhou'); return 'file:///shot-ref.png'; };
