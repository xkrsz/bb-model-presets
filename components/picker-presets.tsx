import type { Preset } from "@/server";
import { MAX_PRESETS } from "@/shared/constants";
import { describePreset } from "@/hooks/use-presets";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

const ALT_LABEL =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
    ? "⌥"
    : "Alt+";

/** The preset list rendered at the top of bb's model picker popover. */
export function PickerPresets({
  presets,
  currentId,
  canCreate,
  providerName,
  onApply,
  onCreate,
}: {
  presets: Preset[];
  currentId: string | null;
  canCreate: boolean;
  providerName: (providerId: string) => string;
  onApply: (preset: Preset) => void;
  onCreate: () => void;
}) {
  return (
    <div className="px-1.5 py-1">
      <div className="flex items-center justify-between px-1.5 pb-0.5 text-[11px] text-subtle-foreground">
        <span>Presets</span>
        {canCreate ? (
          <button
            type="button"
            onClick={onCreate}
            className="rounded-sm px-1 hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
          >
            Save current…
          </button>
        ) : null}
      </div>
      {presets.slice(0, MAX_PRESETS).map((preset, index) => {
        const active = preset.id === currentId;
        return (
          <button
            key={preset.id}
            type="button"
            title={`${providerName(preset.providerId)} · ${describePreset(preset)}`}
            onClick={() => onApply(preset)}
            className={cn(
              "flex h-7 w-full items-center gap-2 rounded-sm px-1.5 text-left text-xs hover:bg-state-hover focus-visible:bg-state-hover focus-visible:outline-none",
              active ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <span className="min-w-0 shrink truncate text-foreground">
              {preset.name}
            </span>
            <span className="min-w-0 flex-1 truncate text-subtle-foreground">
              {describePreset(preset)}
            </span>
            {active ? (
              <Icon name="Check" className="size-3.5 shrink-0" />
            ) : (
              <span className="shrink-0 font-mono text-[10px] text-subtle-foreground">
                {ALT_LABEL}
                {index + 1}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
