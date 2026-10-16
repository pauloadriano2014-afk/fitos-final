// rn4 + PanResponder (o teste chama os handlers na mão), ImageBackground, StyleSheet.absoluteFill
const React = require('react');
const base = require('./rn4.js');
const mk = (name) => { const C = React.forwardRef(({ children, ...p }, ref) => React.createElement(name, p, children)); C.displayName = name; return C; };
module.exports = { ...base, ImageBackground: mk('ImageBackground'),
  PanResponder: { create: (cfg) => ({ panHandlers: { __cfg: cfg } }) },
  StyleSheet: { ...base.StyleSheet, absoluteFill: {}, absoluteFillObject: {}, hairlineWidth: 1 } };
