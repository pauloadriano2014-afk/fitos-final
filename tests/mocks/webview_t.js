// react-native-webview de teste: vira um elemento 'WebView' com todas as props, para o teste olhar source, handlers etc.
const React = require('react');
const WebView = React.forwardRef((p, ref) => React.createElement('WebView', p));
WebView.displayName = 'WebView';
module.exports = { WebView, default: WebView };
