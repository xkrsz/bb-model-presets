// Bridge into the built-in New thread composer's remembered selection.
//
// bb persists the root composer's provider/model/effort/speed choice in
// localStorage through jotai `atomWithStorage` atoms that subscribe to the
// window `storage` event. Writing those keys and dispatching a synthetic
// StorageEvent updates the live composer without touching its DOM.
//
// This is an internal contract of the bb app (see
// apps/app/src/hooks/thread-creation-options/persisted-selection-fields.ts in
// the bb repository), pinned here to storage version "1". If bb changes the
// layout, bump STORAGE_VERSION or adjust the key builders below.
import type { ReasoningLevel, ServiceTier } from "@/shared/constants";
import { REASONING_LEVELS, SERVICE_TIERS } from "@/shared/constants";

const PROVIDER_KEY = "bb.promptbox.provider";
const MODEL_KEY = "bb.promptbox.model";
const REASONING_KEY = "bb.promptbox.reasoning";
const SERVICE_TIER_KEY = "bb.promptbox.service-tier";
const STORAGE_VERSION = "1";

export interface ComposerSelection {
  providerId: string;
  model: string;
  reasoningLevel: ReasoningLevel;
  serviceTier: ServiceTier | null;
}

function providerScopedKey(base: string, providerId: string): string {
  return `${base}-${encodeURIComponent(providerId.trim())}-${STORAGE_VERSION}`;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  const store = storage();
  if (store === null) return;
  const oldValue = store.getItem(key);
  store.setItem(key, value);
  window.dispatchEvent(
    new StorageEvent("storage", {
      key,
      oldValue,
      newValue: value,
      storageArea: store,
      url: window.location.href,
    }),
  );
}

function isReasoningLevel(value: string): value is ReasoningLevel {
  return (REASONING_LEVELS as readonly string[]).includes(value);
}
function isServiceTier(value: string): value is ServiceTier {
  return (SERVICE_TIERS as readonly string[]).includes(value);
}

/** The composer's current remembered selection, or null when nothing is stored. */
export function readComposerSelection(): ComposerSelection | null {
  const store = storage();
  if (store === null) return null;
  const providerId = store.getItem(PROVIDER_KEY) ?? "";
  if (providerId === "") return null;
  const model = store.getItem(providerScopedKey(MODEL_KEY, providerId)) ?? "";
  const reasoning =
    store.getItem(providerScopedKey(REASONING_KEY, providerId)) ?? "";
  const tier = store.getItem(SERVICE_TIER_KEY) ?? "";
  return {
    providerId,
    model,
    reasoningLevel: isReasoningLevel(reasoning) ? reasoning : "medium",
    serviceTier: isServiceTier(tier) ? tier : null,
  };
}

function writeModelFields(selection: ComposerSelection): void {
  write(providerScopedKey(MODEL_KEY, selection.providerId), selection.model);
  write(
    providerScopedKey(REASONING_KEY, selection.providerId),
    selection.reasoningLevel,
  );
  write(SERVICE_TIER_KEY, selection.serviceTier ?? "");
}

/**
 * Point the New thread composer at `selection`.
 *
 * The per-provider model/effort atoms are only subscribed while that provider
 * is selected. Write them first (so a freshly created atom reads the new
 * value on init), switch the provider, then write them again once React has
 * mounted the provider's atoms so a previously mounted atom with a retained
 * stale value also picks the change up.
 */
export function applyComposerSelection(selection: ComposerSelection): void {
  writeModelFields(selection);
  write(PROVIDER_KEY, selection.providerId);
  const again = () => writeModelFields(selection);
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => requestAnimationFrame(again));
  }
  setTimeout(again, 120);
}

export function selectionMatches(
  selection: ComposerSelection | null,
  preset: Pick<ComposerSelection, "providerId" | "model" | "reasoningLevel" | "serviceTier">,
): boolean {
  if (selection === null) return false;
  return (
    selection.providerId === preset.providerId &&
    selection.model === preset.model &&
    selection.reasoningLevel === preset.reasoningLevel &&
    // A preset with no tier matches whatever the composer holds: the picker
    // drops the field for providers without tiers.
    (preset.serviceTier === null || selection.serviceTier === preset.serviceTier)
  );
}
