// rn6 + FlatList que de fato renderiza os itens (renderItem / ListEmptyComponent) + Alert que o teste observa
const React = require('react');
const base = require('./rn6.js');
const FlatList = ({ data, renderItem, keyExtractor, ListEmptyComponent, ListHeaderComponent }) => React.createElement('FlatList', null,
  ListHeaderComponent || null, (data && data.length) ? data.map((item, i) => React.createElement(React.Fragment, { key: keyExtractor ? keyExtractor(item, i) : i }, renderItem({ item, index: i }))) : (typeof ListEmptyComponent === 'function' ? React.createElement(ListEmptyComponent) : ListEmptyComponent || null));
module.exports = { ...base, FlatList, Alert: { alert: (...a) => { (globalThis.__alerts = globalThis.__alerts || []).push(a); } } };
