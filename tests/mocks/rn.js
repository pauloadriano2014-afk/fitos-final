const React = require('react');
const mk = (name) => { const C = ({ children, ...p }) => React.createElement(name, p, children); C.displayName = name; return C; };
module.exports = {
  View: mk('View'), Text: mk('Text'), TouchableOpacity: mk('TouchableOpacity'), Modal: ({ visible, children }) => visible ? React.createElement('Modal', null, children) : null,
  ScrollView: mk('ScrollView'), TextInput: mk('TextInput'), ActivityIndicator: mk('ActivityIndicator'), KeyboardAvoidingView: mk('KeyboardAvoidingView'),
  StyleSheet: { create: (s) => s }, Platform: { OS: 'ios' },
};
