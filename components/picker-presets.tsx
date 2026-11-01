import {
  experimental_ProviderIcon as ProviderIcon,
  experimental_useProviders as useProviders,
} from "@get-bb/plugin-sdk/app";
import type { Preset } from "@/server";
import { MAX_PRESETS } from "@/shared/constants";
import { describePreset } from "@/hooks/use-presets";
import { Icon } from "@/components/ui/icon";

const ALT_LABEL =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
    ? "⌥"
    : "Alt+";

// Header and row classes copied from the picker's own Model list so the
// section reads as one of its sections.
const HEADER_CLASS =
  "flex items-center justify-between gap-3 px-2 pb-[0.3125rem] pt-2 text-xs font-medium text-muted-foreground max-md:pointer-coarse:pb-1.5";
const ROW_CLASS =
  "relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-[0.3125rem] text-left text-xs outline-none transition-none hover:bg-state-hover hover:text-foreground focus-visible:bg-state-hover focus-visible:text-foreground max-md:pointer-coarse:py-2";

/** The Presets section prepended to bb's model picker popover. */
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
  const { providers } = useProviders();

  return (
    <div className="pb-1">
      <div className={HEADER_CLASS}>
        <span>Presets</span>
        {canCreate ? (
          <button
            type="button"
            onClick={onCreate}
            className="-my-0.5 rounded-sm px-1 py-0.5 font-normal text-subtle-foreground outline-none hover:text-foreground focus-visible:bg-state-hover focus-visible:text-foreground"
          >
            Save current
          </button>
        ) : null}
      </div>
      <div className="px-1">
        {presets.length === 0 ? (
          <div className="px-2 py-[0.3125rem] text-xs text-subtle-foreground">
            Save the current model and effort to switch back in one click.
          </div>
        ) : null}
        {presets.slice(0, MAX_PRESETS).map((preset, index) => {
          const provider = providers.find(
            (candidate) => candidate.id === preset.providerId,
          ) ?? { id: preset.providerId };
          return (
            <button
              key={preset.id}
              type="button"
              title={`${providerName(preset.providerId)} · ${describePreset(preset)}`}
              onClick={() => onApply(preset)}
              className={ROW_CLASS}
            >
              <ProviderIcon
                providerKind="agent"
                provider={provider}
                aria-hidden
                className="size-3.5 shrink-0"
              />
              <span className="min-w-0 flex-1 truncate">{preset.name}</span>
              <span className="flex shrink-0 items-center gap-1.5 text-subtle-foreground">
                {preset.serviceTier === "fast" ? (
                  <Icon name="Zap" className="size-3 fill-current" />
                ) : null}
                <span className="font-mono text-[10px]">
                  {ALT_LABEL}
                  {index + 1}
                </span>
                {preset.id === currentId ? (
                  <Icon name="Check" className="size-3.5 text-foreground" />
                ) : (
                  <span className="size-3.5" />
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
