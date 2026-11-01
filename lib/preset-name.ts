// Default name for a new preset: the model and effort as bb's picker shows
// them, e.g. "Opus 5.5 High".
import { useEffect, useState } from "react";
import { useSdk } from "@get-bb/plugin-sdk/app";

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function usePresetLabel(
  providerId: string,
  model: string,
  reasoningLevel: string,
  projectId?: string,
): string | null {
  const sdk = useSdk();
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (providerId === "" || model === "") {
      setLabel(null);
      return;
    }
    let cancelled = false;
    // Raw ids until the catalog answers.
    setLabel(`${model} ${titleCase(reasoningLevel)}`);
    sdk.system
      .executionOptions({
        providerId,
        selectedModel: model,
        ...(projectId === undefined ? {} : { projectId }),
      })
      .then((options) => {
        if (cancelled) return;
        const entry = [...options.models, ...(options.selectedOnlyModels ?? [])].find(
          (candidate) => candidate.model === model || candidate.id === model,
        );
        const effort =
          entry?.supportedReasoningEfforts.find(
            (candidate) => candidate.reasoningEffort === reasoningLevel,
          )?.label ??
          options.providers
            .find((provider) => provider.id === providerId)
            ?.reasoningLevels?.find((level) => level.id === reasoningLevel)
            ?.label ??
          titleCase(reasoningLevel);
        setLabel(`${entry?.displayName ?? model} ${effort}`);
      })
      .catch(() => {
        // Keep the raw-id label.
      });
    return () => {
      cancelled = true;
    };
  }, [sdk, providerId, model, reasoningLevel, projectId]);

  return label;
}
