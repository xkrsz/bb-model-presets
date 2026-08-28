// Shared between server.ts and app.tsx. Keep this file free of Node and
// server-only imports: the frontend bundle includes it verbatim.

export const REASONING_LEVELS = [
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
  "ultracode",
  "max",
  "ultra",
] as const;
export type ReasoningLevel = (typeof REASONING_LEVELS)[number];

export const SERVICE_TIERS = ["default", "fast"] as const;
export type ServiceTier = (typeof SERVICE_TIERS)[number];

/** Realtime channel published after every preset write. */
export const PRESETS_CHANGED = "presets-changed";

/** Default shortcut that opens the preset menu on the New thread screen. */
export const DEFAULT_SHORTCUT = "mod+shift+l";

export const MAX_PRESETS = 9;
export const MAX_INSTRUCTIONS_LENGTH = 4000;
