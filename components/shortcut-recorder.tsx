import { useEffect, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { DEFAULT_SHORTCUT } from "@/shared/constants";
import {
  bbDefaultBindingFor,
  parseShortcut,
  serializeShortcut,
  setShortcutsSuspended,
  shortcutChips,
  shortcutFromKeyboardEvent,
  type ParsedShortcut,
} from "@/lib/shortcut";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

const FALLBACK = parseShortcut(DEFAULT_SHORTCUT)!;

function Chips({ shortcut, muted }: { shortcut: ParsedShortcut; muted?: boolean }) {
  return (
    <span className="flex items-center gap-1">
      {shortcutChips(shortcut).map((chip, index) => (
        <kbd
          key={`${chip}-${index}`}
          className={cn(
            "inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1 font-sans text-[11px] font-medium",
            muted ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {chip}
        </kbd>
      ))}
    </span>
  );
}

/**
 * Click, press the combination, done. Escape cancels; the reset button
 * restores the default. While recording, the plugin's global shortcut
 * listener is suspended so the current combo can be re-recorded safely.
 */
export function ShortcutRecorder({
  value,
  onChange,
  className,
}: {
  /** Serialized shortcut, e.g. "mod+shift+l". */
  value: string;
  /** null restores the default. */
  onChange: (next: string | null) => Promise<void>;
  className?: string;
}) {
  const current = parseShortcut(value) ?? FALLBACK;
  const [recording, setRecording] = useState(false);
  const [held, setHeld] = useState<ParsedShortcut | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<
    { tone: "error" | "info"; text: string } | null
  >(null);

  useEffect(() => {
    setShortcutsSuspended(recording);
    return () => setShortcutsSuspended(false);
  }, [recording]);

  const stop = () => {
    setRecording(false);
    setHeld(null);
  };

  const commit = async (next: ParsedShortcut | null) => {
    setSaving(true);
    setMessage(null);
    try {
      await onChange(next === null ? null : serializeShortcut(next));
      const conflict = next === null ? null : bbDefaultBindingFor(next);
      setMessage(
        conflict === null
          ? null
          : { tone: "info", text: `Heads-up: bb uses this for "${conflict}" by default.` },
      );
      stop();
    } catch (cause) {
      setMessage({
        tone: "error",
        text: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!recording) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      stop();
      return;
    }
    const next = shortcutFromKeyboardEvent(event.nativeEvent);
    if (next === null) {
      // Modifier-only press: preview what is held so far.
      setHeld({
        key: "",
        mod: shortcutFromKeyboardEvent({ ...event.nativeEvent, key: "x", code: "KeyX" })?.mod ?? false,
        shift: event.shiftKey,
        alt: event.altKey,
      });
      return;
    }
    if (!next.mod && !next.alt) {
      setMessage({
        tone: "error",
        text: "Add ⌘/Ctrl or ⌥/Alt so the shortcut can't hijack typing.",
      });
      setHeld(null);
      return;
    }
    void commit(next);
  };

  const heldChips =
    held === null
      ? null
      : shortcutChips({ ...held, key: "…" }).filter((chip) => chip !== "…");

  return (
    <div className={cn("flex flex-col items-end gap-1", className)}>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label={
            recording
              ? "Recording shortcut. Press a key combination, or Escape to cancel."
              : `Shortcut: ${shortcutChips(current).join(" ")}. Click to change.`
          }
          aria-pressed={recording}
          disabled={saving}
          onClick={() => {
            if (!recording) {
              setMessage(null);
              setRecording(true);
            }
          }}
          onBlur={stop}
          onKeyDown={onKeyDown}
          onKeyUp={() => {
            if (recording) setHeld(null);
          }}
          className={cn(
            "flex h-8 min-w-40 items-center justify-between gap-3 rounded-md border px-2 text-xs transition-colors",
            recording
              ? "border-ring bg-background ring-2 ring-ring/30"
              : "border-input bg-transparent hover:bg-state-hover",
            saving && "opacity-60",
          )}
        >
          {recording ? (
            heldChips !== null && heldChips.length > 0 ? (
              <span className="flex items-center gap-1 text-muted-foreground">
                {heldChips.map((chip, index) => (
                  <kbd
                    key={`${chip}-${index}`}
                    className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1 font-sans text-[11px] font-medium"
                  >
                    {chip}
                  </kbd>
                ))}
                <span>…</span>
              </span>
            ) : (
              <span className="text-muted-foreground">Press a combination…</span>
            )
          ) : (
            <Chips shortcut={current} />
          )}
          <span className="text-muted-foreground">
            {recording ? "Esc" : <Icon name="Edit" className="size-3.5" />}
          </span>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-foreground"
          aria-label="Reset shortcut to default"
          disabled={saving || value === DEFAULT_SHORTCUT}
          onClick={() => void commit(null)}
        >
          <Icon name="RotateCcw" className="size-4" />
        </Button>
      </div>
      {message === null ? null : (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={cn(
            "max-w-72 text-right text-xs",
            message.tone === "error" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
