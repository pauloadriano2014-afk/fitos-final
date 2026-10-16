// rn3 + o que as telas de venda/login precisam: Animated.parallel/Image/Text, Pressable, StatusBar, Easing; Platform.OS é mutável nos testes
const React = require('react');
const base = require('./rn3.js');
const mk = (name) => { const C = React.forwardRef(({ children, ...p }, ref) => React.createElement(name, p, typeof children === 'function' ? children({ pressed: false, hovered: false }) : children)); C.displayName = name; return C; };
function Value(v) { this.v = v; this.interpolate = () => 0; this.setValue = () => {}; this.stopAnimation = () => {}; this.addListener = () => 'l'; this.removeListener = () => {}; }
const fn = () => ({ start(cb) { cb && cb({ finished: true }); }, stop() {} });
module.exports = { ...base, Pressable: mk('Pressable'), StatusBar: () => null, Easing: { out: () => 0, in: () => 0, inOut: () => 0, cubic: 0, ease: 0, linear: 0, bezier: () => 0 },
  Animated: { ...base.Animated, Value, Image: mk('AnimatedImage'), Text: mk('AnimatedText'), parallel: fn, timing: fn, spring: fn, sequence: fn, loop: fn, delay: fn, createAnimatedComponent: (c) => c },
  RefreshControl: () => null, Share: { share: async () => {} } };
