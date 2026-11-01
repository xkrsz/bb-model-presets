// Shared between server.ts and app.tsx. Keep this file free of Node and
// server-only imports: the frontend bundle includes it verbatim.

/** Realtime channel published after every preset write. */
export const PRESETS_CHANGED = "presets-changed";

export const MAX_PRESETS = 9;
export const MAX_INSTRUCTIONS_LENGTH = 4000;
