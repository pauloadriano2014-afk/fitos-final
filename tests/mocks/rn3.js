const React = require('react');
const base = require('./rn2.js');
const mk = (name) => { const C = React.forwardRef(({ children, ...p }, ref) => React.createElement(name, p, children)); C.displayName = name; return C; };
module.exports = { ...base, Switch: mk('Switch'), SectionList: mk('SectionList'), TouchableWithoutFeedback: ({ children }) => children, SafeAreaView: mk('SafeAreaView'), Keyboard: { addListener: () => ({ remove() {} }) },
  Animated: { View: mk('AnimatedView'), ScrollView: mk('AnimatedScrollView'), Value: function () {}, timing: () => ({ start() {} }), spring: () => ({ start() {} }), sequence: () => ({ start() {} }), loop: () => ({ start() {}, stop() {} }) },
  Alert: { alert(...a) { module.exports.__alerts.push(a); } }, __alerts: [],
  Linking: { openURL: async (u) => { module.exports.__opened.push(u); } }, __opened: [] };
