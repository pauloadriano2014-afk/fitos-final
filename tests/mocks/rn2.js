const React = require('react');
const mk = (name) => { const C = React.forwardRef(({ children, ...p }, ref) => React.createElement(name, ref ? { ...p, ref } : p, children)); C.displayName = name; return C; };
module.exports = {
  View: mk('View'), Text: mk('Text'), TouchableOpacity: mk('TouchableOpacity'), Modal: ({ visible, children }) => visible ? React.createElement('Modal', null, children) : null,
  ScrollView: mk('ScrollView'), TextInput: mk('TextInput'), ActivityIndicator: mk('ActivityIndicator'), KeyboardAvoidingView: mk('KeyboardAvoidingView'),
  FlatList: mk('FlatList'), Image: mk('Image'), Animated: { View: mk('AnimatedView'), Value: function () {} },
  StyleSheet: { create: (s) => s, flatten: (s) => s }, Platform: { OS: 'ios', select: (o) => o.ios ?? o.default }, Alert: { alert() {} }, Dimensions: { get: () => ({ width: 400, height: 800 }) },
  useWindowDimensions: () => ({ width: 400, height: 800 }), LayoutAnimation: { configureNext() {}, Presets: {} }, UIManager: {},
};
