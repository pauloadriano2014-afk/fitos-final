const cap = { html: null, shared: null };
module.exports = { __cap: cap, printToFileAsync: async ({ html }) => { cap.html = html; return { uri: 'file:///x.pdf' }; } };
