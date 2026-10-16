const React = require('react');
const { View } = require('react-native');
exports.Shadow = ({ children, containerStyle, style }) => React.createElement(View, { style: [containerStyle, style] }, children);
