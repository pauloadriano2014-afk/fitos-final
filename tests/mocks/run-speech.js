globalThis.__spoken = globalThis.__spoken || []; globalThis.__spokenOpts = globalThis.__spokenOpts || [];
module.exports = { speak: (t, o) => { globalThis.__spoken.push(t); globalThis.__spokenOpts.push(o); }, stop: () => { globalThis.__speechStops = (globalThis.__speechStops || 0) + 1; } };
