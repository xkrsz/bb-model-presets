import { useCallback, useEffect, useRef, useState } from "react";
import {
  experimental_useProviders as useProviders,
  useRealtime,
  useRealtimeConnectionState,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import type { Preset, rpcContract } from "@/server";
import { DEFAULT_SHORTCUT, PRESETS_CHANGED } from "@/shared/constants";

interface PresetsState {
  presets: Preset[];
  activePresetId: string | null;
  shortcut: string;
}

/** The ordered preset list, kept current via the server's realtime signal. */
export function usePresets() {
  const rpc = useRpc<typeof rpcContract>();
  const [state, setState] = useState<PresetsState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refetch = useCallback(() => {
    rpc.call("presets_list").then(
      (result) => {
        setState(result);
        setError(null);
      },
      (cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      },
    );
  }, [rpc]);
  useEffect(() => {
    refetch();
  }, [refetch]);
  useRealtime(PRESETS_CHANGED, refetch);
  // Signals are not replayed across reconnects, so reconcile on reconnect.
  const connection = useRealtimeConnectionState();
  const seenConnected = useRef(false);
  useEffect(() => {
    if (connection !== "connected") return;
    if (seenConnected.current) refetch();
    seenConnected.current = true;
  }, [connection, refetch]);
  return {
    rpc,
    presets: state?.presets ?? [],
    activePresetId: state?.activePresetId ?? null,
    shortcut: state?.shortcut ?? DEFAULT_SHORTCUT,
    loaded: state !== null,
    error,
    refetch,
  };
}

/** Provider display names from the host roster (never vendor provider copy). */
export function useProviderName(): (providerId: string) => string {
  const { providers } = useProviders();
  return useCallback(
    (providerId: string) =>
      providers.find((provider) => provider.id === providerId)?.displayName ??
      providerId,
    [providers],
  );
}

export function describePreset(
  preset: Pick<Preset, "model" | "reasoningLevel" | "serviceTier">,
): string {
  const parts = [preset.model, preset.reasoningLevel];
  if (preset.serviceTier !== null) parts.push(preset.serviceTier);
  return parts.join(" · ");
}
