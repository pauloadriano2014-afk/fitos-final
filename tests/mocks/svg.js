const React = require('react');
const mk = (n) => (p) => React.createElement(n, p, p.children);
module.exports = { __esModule: true, default: mk('Svg'), Svg: mk('Svg'), Polyline: mk('Polyline'), Line: mk('Line'), Ellipse: mk('Ellipse'), Rect: mk('Rect') };
