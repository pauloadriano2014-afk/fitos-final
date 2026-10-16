const React = require('react');
const { View } = require('react-native');
module.exports = { __esModule: true, default: function SmartThumbnail(props) { return React.createElement(View, { testID: 'thumb', style: props.style, onPress: props.onPress, highRes: props.highRes }); } };
