const React = require('react');
exports.useSafeAreaInsets = () => ({ top: 0, bottom: 20, left: 0, right: 0 });
const SafeAreaView = ({ children, ...p }) => React.createElement('SafeAreaView', p, children);
exports.SafeAreaView = SafeAreaView; exports.SafeAreaProvider = ({ children }) => children;
