import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  experimental_ProviderModelPicker as ProviderModelPicker,
  type ComposerSelection,
  type ExperimentalProviderModelPickerValue,
} from "@get-bb/plugin-sdk/app";
import type { Preset, PresetFields } from "@/server";
import { MAX_INSTRUCTIONS_LENGTH } from "@/shared/constants";
import { usePresetLabel } from "@/lib/preset-name";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function emptyDraft(seed: ComposerSelection | null): PresetFields {
  return {
    name: "",
    providerId: seed?.providerId ?? "",
    model: seed?.model ?? "",
    reasoningLevel: seed?.reasoningLevel ?? "medium",
    serviceTier: seed?.serviceTier ?? null,
    instructions: "",
  };
}

function draftFromPreset(preset: Preset): PresetFields {
  return {
    name: preset.name,
    providerId: preset.providerId,
    model: preset.model,
    reasoningLevel: preset.reasoningLevel,
    serviceTier: preset.serviceTier,
    instructions: preset.instructions,
  };
}

export function PresetDialog({
  open,
  onOpenChange,
  editing,
  seed = null,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null creates a new preset seeded from the composer's current selection. */
  editing: Preset | null;
  /** Composer picker values a new preset starts from. */
  seed?: ComposerSelection | null;
  onSave: (fields: PresetFields) => Promise<void>;
}) {
  const [draft, setDraft] = useState<PresetFields>(() =>
    editing === null ? emptyDraft(seed) : draftFromPreset(editing),
  );
  // New presets take the model + effort label until the user types a name.
  const [nameEdited, setNameEdited] = useState(editing !== null);
  const nameRef = useRef<HTMLInputElement>(null);
  const autoName = usePresetLabel(
    draft.providerId,
    draft.model,
    draft.reasoningLevel,
    seed?.projectId ?? undefined,
  );
  useEffect(() => {
    if (!nameEdited && autoName !== null) {
      setDraft((current) => ({ ...current, name: autoName }));
      // Keep the suggestion selected so typing replaces it.
      requestAnimationFrame(() => {
        if (document.activeElement === nameRef.current) nameRef.current?.select();
      });
    }
  }, [autoName, nameEdited]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const pickerValue: ExperimentalProviderModelPickerValue = {
    providerId: draft.providerId,
    model: draft.model,
    reasoningLevel: draft.reasoningLevel,
    ...(draft.serviceTier === null ? {} : { serviceTier: draft.serviceTier }),
  };
  const canSubmit =
    draft.name.trim() !== "" &&
    draft.providerId.trim() !== "" &&
    draft.model.trim() !== "" &&
    !submitting;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSave({
        ...draft,
        name: draft.name.trim(),
        instructions: draft.instructions.trim(),
      });
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit preset" : "New preset"}</DialogTitle>
            <DialogDescription>
              A preset sets the provider, model, effort, and speed of the New
              thread composer, and adds its instructions to every thread you
              start with it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="model-preset-name">Name</Label>
              <Input
                id="model-preset-name"
                ref={nameRef}
                autoFocus
                value={draft.name}
                maxLength={80}
                placeholder="e.g. Deep review"
                onChange={(event) => {
                  const name = event.target.value;
                  setNameEdited(true);
                  setDraft((current) => ({ ...current, name }));
                }}
                className="h-8"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Provider, model, effort, and speed</Label>
              <div>
                <ProviderModelPicker
                value={pickerValue}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    providerId: value.providerId,
                    model: value.model,
                    reasoningLevel: value.reasoningLevel,
                    serviceTier: value.serviceTier ?? null,
                  }))
                }
                  className="h-8 max-w-full"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Speed is offered only for providers that support it.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="model-preset-instructions">
                Thread instructions
              </Label>
              <Textarea
                id="model-preset-instructions"
                value={draft.instructions}
                maxLength={MAX_INSTRUCTIONS_LENGTH}
                rows={5}
                placeholder={
                  "Added to every new thread started with this preset, e.g.\n" +
                  "Keep saving relevant information from this thread to memory."
                }
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    instructions: event.target.value,
                  }))
                }
                className="min-h-24 text-sm"
              />
            </div>
            {error === null ? null : (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!canSubmit}>
              {editing ? "Save preset" : "Create preset"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
