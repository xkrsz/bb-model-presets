import { useState } from "react";
import { useComposers, type ComposerSelection } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import type { Preset, PresetFields } from "@/server";
import { MAX_PRESETS } from "@/shared/constants";
import { describePreset, usePresets, useProviderName } from "@/hooks/use-presets";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PresetDialog } from "@/components/preset-dialog";
import { cn } from "@/lib/utils";

type DialogState = { kind: "create" } | { kind: "edit"; preset: Preset } | null;

function reportError(cause: unknown) {
  toast.error(cause instanceof Error ? cause.message : String(cause));
}

/** Ordered preset list with create, edit, delete, and reorder controls. */
export function PresetManager({
  className,
  seed,
}: {
  className?: string;
  /** Picker values new presets start from; defaults to the New thread composer's. */
  seed?: ComposerSelection | null;
}) {
  const { rpc, presets, loaded, error, refetch } = usePresets();
  const composers = useComposers();
  const newThreadSelection =
    composers.find((composer) => composer.scope.kind === "new-thread")
      ?.selection ?? null;
  const providerName = useProviderName();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const save = async (fields: PresetFields) => {
    if (dialog?.kind === "edit") {
      await rpc.call("presets_update", { id: dialog.preset.id, ...fields });
    } else {
      await rpc.call("presets_create", fields);
    }
    refetch();
  };

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= presets.length) return;
    const ids = presets.map((preset) => preset.id);
    const [id] = ids.splice(index, 1);
    ids.splice(target, 0, id!);
    rpc.call("presets_reorder", { ids }).then(refetch, reportError);
  };

  const remove = (id: string) => {
    setConfirmDeleteId(null);
    rpc.call("presets_delete", { id }).then(refetch, reportError);
  };

  return (
    <div className={cn("space-y-3", className)}>
      {error === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!loaded ? (
        <p className="text-sm text-muted-foreground">Loading presets…</p>
      ) : presets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No presets yet.
        </div>
      ) : (
        <ol className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {presets.map((preset, index) => (
            <li
              key={preset.id}
              className="flex items-center gap-3 px-3 py-2 text-sm"
            >
              <span className="w-4 shrink-0 text-center font-mono text-xs text-muted-foreground">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-foreground">
                  {preset.name}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {providerName(preset.providerId)} · {describePreset(preset)}
                  {preset.instructions.trim() === "" ? "" : " · has instructions"}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground hover:text-foreground"
                  aria-label={`Move "${preset.name}" up`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <Icon name="ArrowUp" className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground hover:text-foreground"
                  aria-label={`Move "${preset.name}" down`}
                  disabled={index === presets.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <Icon name="ArrowDown" className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground hover:text-foreground"
                  aria-label={`Edit "${preset.name}"`}
                  onClick={() => setDialog({ kind: "edit", preset })}
                >
                  <Icon name="Edit" className="size-4" />
                </Button>
                {confirmDeleteId === preset.id ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => remove(preset.id)}
                    onBlur={() => setConfirmDeleteId(null)}
                  >
                    Delete?
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-destructive"
                    aria-label={`Delete "${preset.name}"`}
                    onClick={() => setConfirmDeleteId(preset.id)}
                  >
                    <Icon name="Trash2" className="size-4" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Order sets the 1–{MAX_PRESETS} keys in the preset menu.
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={presets.length >= MAX_PRESETS}
          onClick={() => setDialog({ kind: "create" })}
        >
          <Icon name="Plus" className="size-4" />
          New preset
        </Button>
      </div>
      <p className="border-t border-border pt-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Open model presets</span>{" "}
        (⌘⇧L / Ctrl+Shift+L by default) opens the menu from the New thread
        composer. Rebind it under Settings → Keyboard.
      </p>
      {dialog === null ? null : (
        <PresetDialog
          key={dialog.kind === "edit" ? dialog.preset.id : "create"}
          open
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
          editing={dialog.kind === "edit" ? dialog.preset : null}
          seed={seed ?? newThreadSelection}
          onSave={save}
        />
      )}
    </div>
  );
}
