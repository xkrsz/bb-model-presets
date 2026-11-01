// Comparing a preset with the composer's live picker values.
import type { ComposerSelection } from "@get-bb/plugin-sdk/app";
import type { Preset } from "@/server";

type PresetModel = Pick<
  Preset,
  "providerId" | "model" | "reasoningLevel" | "serviceTier"
>;

export function selectionMatches(
  selection: ComposerSelection | null,
  preset: PresetModel,
): boolean {
  if (selection === null) return false;
  return (
    selection.providerId === preset.providerId &&
    selection.model === preset.model &&
    selection.reasoningLevel === preset.reasoningLevel &&
    // A preset with no tier matches whatever the composer holds: providers
    // without tiers report none.
    (preset.serviceTier === null ||
      selection.serviceTier === undefined ||
      selection.serviceTier === preset.serviceTier)
  );
}

/** The picker values a preset sets; project, environment and mode stay put. */
export function presetSelection(preset: PresetModel): ComposerSelection {
  return {
    providerId: preset.providerId,
    model: preset.model,
    reasoningLevel: preset.reasoningLevel,
    ...(preset.serviceTier === null ? {} : { serviceTier: preset.serviceTier }),
  };
}

/** The preset the composer currently matches, preferring the one last applied. */
export function currentPreset<T extends PresetModel & { id: string }>(
  presets: readonly T[],
  selection: ComposerSelection | null,
  activePresetId: string | null,
): T | null {
  const matching = presets.filter((preset) =>
    selectionMatches(selection, preset),
  );
  return (
    matching.find((preset) => preset.id === activePresetId) ??
    matching[0] ??
    null
  );
}
