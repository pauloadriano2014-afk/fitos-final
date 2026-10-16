// @react-native-picker/picker mínimo: <Picker><Picker.Item/></Picker> (só renderiza as opções como texto)
const React = require('react');
const { View, Text } = require('react-native');
const Picker = ({ children }) => React.createElement(View, null, children);
Picker.Item = ({ label }) => React.createElement(Text, null, label);
exports.Picker = Picker;
