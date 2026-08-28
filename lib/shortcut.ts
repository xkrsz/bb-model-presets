// Shortcut parsing/matching plus a tiny registry shared between the content
// script (which owns the document keydown listener) and the composer action
// (which owns the menu). Both live in the same bundle.

export interface ParsedShortcut {
  /** Lower-case `KeyboardEvent.key` for single characters, else the named key. */
  key: string;
  mod: boolean;
  shift: boolean;
  alt: boolean;
}

const MOD_TOKENS = new Set(["mod", "cmd", "command", "ctrl", "control", "meta", "super", "win"]);
const SHIFT_TOKENS = new Set(["shift"]);
const ALT_TOKENS = new Set(["alt", "option", "opt"]);

export function parseShortcut(text: string | undefined | null): ParsedShortcut | null {
  if (typeof text !== "string") return null;
  const tokens = text
    .split("+")
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token !== "");
  if (tokens.length === 0) return null;
  const key = tokens[tokens.length - 1]!;
  const modifiers = tokens.slice(0, -1);
  const shortcut: ParsedShortcut = { key, mod: false, shift: false, alt: false };
  for (const token of modifiers) {
    if (MOD_TOKENS.has(token)) shortcut.mod = true;
    else if (SHIFT_TOKENS.has(token)) shortcut.shift = true;
    else if (ALT_TOKENS.has(token)) shortcut.alt = true;
    else return null;
  }
  if (MOD_TOKENS.has(key) || SHIFT_TOKENS.has(key) || ALT_TOKENS.has(key)) {
    return null;
  }
  return shortcut;
}

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform = navigator.platform || navigator.userAgent || "";
  return /mac|iphone|ipad|ipod/i.test(platform);
}

function eventKey(event: KeyboardEvent): string {
  // With Alt held, macOS reports the composed character in `key`; fall back
  // to the physical key from `code` for single letters/digits.
  const code = event.code;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  return event.key.length === 1 ? event.key.toLowerCase() : event.key;
}

export function matchesShortcut(event: KeyboardEvent, shortcut: ParsedShortcut): boolean {
  const mac = isMacPlatform();
  const mod = mac ? event.metaKey : event.ctrlKey;
  const otherMod = mac ? event.ctrlKey : event.metaKey;
  if (otherMod) return false;
  if (mod !== shortcut.mod) return false;
  if (event.shiftKey !== shortcut.shift) return false;
  if (event.altKey !== shortcut.alt) return false;
  const key = eventKey(event);
  return key.toLowerCase() === shortcut.key.toLowerCase();
}

const MODIFIER_KEY_NAMES = new Set(["Shift", "Control", "Alt", "Meta", "OS", "AltGraph"]);

/**
 * The combination a keydown represents, or null for a modifier-only press
 * (the recorder shows those as a preview while the user holds them).
 */
export function shortcutFromKeyboardEvent(event: KeyboardEvent | { key: string; code: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }): ParsedShortcut | null {
  if (MODIFIER_KEY_NAMES.has(event.key) || event.key === "Dead" || event.key === "Unidentified") {
    return null;
  }
  const mac = isMacPlatform();
  return {
    key: eventKey(event as KeyboardEvent),
    mod: mac ? event.metaKey : event.ctrlKey,
    shift: event.shiftKey,
    alt: event.altKey,
  };
}

/** Canonical "mod+alt+shift+key" text, the inverse of parseShortcut. */
export function serializeShortcut(shortcut: ParsedShortcut): string {
  const parts: string[] = [];
  if (shortcut.mod) parts.push("mod");
  if (shortcut.alt) parts.push("alt");
  if (shortcut.shift) parts.push("shift");
  parts.push(shortcut.key.toLowerCase());
  return parts.join("+");
}

function displayKey(key: string): string {
  if (key.length === 1) return key.toUpperCase();
  const named: Record<string, string> = {
    enter: "↩",
    escape: "Esc",
    backspace: "⌫",
    delete: "⌦",
    tab: "⇥",
    arrowup: "↑",
    arrowdown: "↓",
    arrowleft: "←",
    arrowright: "→",
    " ": "Space",
  };
  return named[key.toLowerCase()] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

/** Individual chips (modifiers then key) for rendering as <kbd> elements. */
export function shortcutChips(shortcut: ParsedShortcut): string[] {
  const mac = isMacPlatform();
  const chips: string[] = [];
  if (shortcut.mod) chips.push(mac ? "⌘" : "Ctrl");
  if (shortcut.alt) chips.push(mac ? "⌥" : "Alt");
  if (shortcut.shift) chips.push(mac ? "⇧" : "Shift");
  chips.push(displayKey(shortcut.key));
  return chips;
}

/** bb's default bindings (users can rebind them; this is only a heads-up). */
const BB_DEFAULT_BINDINGS: Record<string, string> = {
  "mod+shift+p": "Command palette",
  "mod+shift+o": "New thread",
  "mod+n": "New thread",
  "mod+k": "Search threads",
  "mod+,": "Settings",
  "mod+\\": "Toggle sidebar",
  "mod+shift+[": "Previous thread",
  "mod+shift+]": "Next thread",
  "mod+shift+e": "Maximize pane",
  "mod+shift+x": "Close pane",
  "mod+t": "New panel tab",
  "mod+w": "Close panel",
  "mod+j": "Toggle panel",
  "mod+p": "Quick open file",
  "mod+d": "Toggle diff",
  "mod+shift+enter": "Open terminal",
  "mod+shift+t": "Open terminal",
  "mod+shift+c": "Focus composer",
  "mod+shift+m": "Model picker",
  "mod+shift+n": "New window",
  "mod+o": "Open workspace",
  "mod+l": "Browser location",
  "mod+r": "Browser reload",
  "mod+f": "Browser find",
  "alt+m": "Cycle model",
  "alt+shift+m": "Cycle model backward",
  "alt+p": "Cycle provider",
  "alt+shift+p": "Cycle provider backward",
  "alt+t": "Cycle reasoning",
  "alt+shift+t": "Cycle reasoning backward",
};

/** Name of the bb command that uses this combo by default, if any. */
export function bbDefaultBindingFor(shortcut: ParsedShortcut): string | null {
  return BB_DEFAULT_BINDINGS[serializeShortcut(shortcut)] ?? null;
}

export function formatShortcut(shortcut: ParsedShortcut): string {
  const mac = isMacPlatform();
  const keyLabel = displayKey(shortcut.key);
  if (mac) {
    return `${shortcut.mod ? "⌘" : ""}${shortcut.alt ? "⌥" : ""}${shortcut.shift ? "⇧" : ""}${keyLabel}`;
  }
  const parts: string[] = [];
  if (shortcut.mod) parts.push("Ctrl");
  if (shortcut.alt) parts.push("Alt");
  if (shortcut.shift) parts.push("Shift");
  parts.push(keyLabel);
  return parts.join("+");
}

// --- registry ---------------------------------------------------------------

export interface ShortcutTarget {
  shortcut: ParsedShortcut;
  /** Return true when the event was consumed. */
  trigger: () => boolean;
}

const targets = new Set<ShortcutTarget>();
let suspended = false;

/** While true (a recorder is capturing keys) the global listener stays quiet. */
export function setShortcutsSuspended(value: boolean): void {
  suspended = value;
}

export function registerShortcutTarget(target: ShortcutTarget): () => void {
  targets.add(target);
  return () => {
    targets.delete(target);
  };
}

export function hasShortcutTargets(): boolean {
  return targets.size > 0;
}

/** Document keydown handler installed by the content script. */
export function handleShortcutKeydown(event: KeyboardEvent): void {
  if (suspended || event.defaultPrevented || event.isComposing) return;
  for (const target of targets) {
    if (!matchesShortcut(event, target.shortcut)) continue;
    if (target.trigger()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
  }
}
