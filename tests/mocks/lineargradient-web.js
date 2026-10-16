const React = require('react');
exports.LinearGradient = ({ colors = [], locations, style, children }) => React.createElement('div', { style: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: `linear-gradient(180deg, ${colors.map((c, i) => c + (locations ? ' ' + Math.round(locations[i] * 100) + '%' : '')).join(',')})` } }, children);
