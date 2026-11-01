import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useComposer } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import type { Preset, PresetFields } from "@/server";
import { MAX_PRESETS } from "@/shared/constants";
import { describePreset, usePresets, useProviderName } from "@/hooks/use-presets";
import { registerPresetMenu } from "@/lib/menu-registry";
import { usePickerDock } from "@/lib/picker-dock";
import { usePickerPopover, whenDetached } from "@/lib/picker-popover";
import {
  currentPreset,
  presetSelection,
  selectionMatches,
} from "@/lib/selection";
import { Button } from "@/components/ui/button";
import { COARSE_POINTER_PROMPT_ACTION_BUTTON_CLASS } from "@/components/ui/coarse-pointer-sizing";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { PickerPresets } from "@/components/picker-presets";
import { PresetDialog } from "@/components/preset-dialog";
import { PresetManager } from "@/components/preset-manager";
import { cn } from "@/lib/utils";

type DialogState = { kind: "create" } | { kind: "manage" } | null;

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** The preset control in the New thread composer, docked beside the model picker. */
export function PresetAction() {
  const composer = useComposer();
  const { rpc, presets, activePresetId, refetch } = usePresets();
  const providerName = useProviderName();
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const dock = usePickerDock(anchorRef);

  const { selection } = composer;
  const current = currentPreset(presets, selection, activePresetId);

  const dialogOpen = dialog !== null;
  useEffect(
    () =>
      registerPresetMenu(composer.key, () => {
        if (!dialogOpen) setOpen((value) => !value);
      }),
    [composer.key, dialogOpen],
  );

  // Resolves once whatever was open when the preset was picked has gone, so
  // its focus return doesn't pull the caret back out of the composer.
  const apply = useCallback(
    async (preset: Preset, closed?: Promise<void>) => {
      setOpen(false);
      try {
        const settled = await composer.setSelection(presetSelection(preset));
        if (!selectionMatches(settled, preset)) {
          toast.warning(
            `"${preset.name}" needs ${providerName(preset.providerId)} / ${preset.model}, which this composer doesn't offer right now.`,
          );
          return;
        }
        await rpc.call("presets_set_active", { id: preset.id });
        refetch();
      } catch (cause) {
        toast.error(errorMessage(cause));
      } finally {
        if (closed !== undefined) await closed;
        composer.focus();
      }
    },
    [composer, providerName, rpc, refetch],
  );

  const picker = usePickerPopover(dock?.group ?? null, !dialogOpen);
  const applyFromPicker = useCallback(
    (preset: Preset) => {
      if (picker === null) return;
      const closed = whenDetached(picker.content);
      picker.close();
      void apply(preset, closed);
    },
    [picker, apply],
  );

  // ⌥1–⌥9 while the picker is open; plain digits belong to its search box.
  useEffect(() => {
    if (picker === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) {
        return;
      }
      const digit = /^Digit([1-9])$/.exec(event.code);
      const preset = digit === null ? undefined : presets[Number(digit[1]) - 1];
      if (preset === undefined) return;
      event.preventDefault();
      event.stopPropagation();
      applyFromPicker(preset);
    };
    picker.content.addEventListener("keydown", onKeyDown, true);
    return () => picker.content.removeEventListener("keydown", onKeyDown, true);
  }, [picker, presets, applyFromPicker]);

  const create = async (fields: PresetFields) => {
    const preset = await rpc.call("presets_create", fields);
    refetch();
    void apply(preset);
  };

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (!/^[1-9]$/.test(event.key)) return;
    const preset = presets[Number(event.key) - 1];
    if (preset === undefined) return;
    event.preventDefault();
    void apply(preset);
  };

  const button = (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={composer.isSubmitting}
          aria-label={
            current === null
              ? "Model presets"
              : `Model preset: ${current.name}`
          }
          className={cn(
            COARSE_POINTER_PROMPT_ACTION_BUTTON_CLASS,
            "h-7 gap-1.5 px-2 text-xs font-normal text-muted-foreground hover:text-foreground data-[state=open]:bg-state-active data-[state=open]:text-foreground",
          )}
        >
          <Icon name="SlidersHorizontal" className="size-3.5 shrink-0" />
          {current === null ? null : (
            <span className="max-w-[9rem] truncate">{current.name}</span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="top"
        sideOffset={6}
        mobileTitle="Model presets"
        className="w-72"
        onKeyDown={onMenuKeyDown}
      >
        <DropdownMenuLabel className="flex items-center justify-between text-muted-foreground">
          <span>Model presets</span>
          {presets.length === 0 ? null : (
            <span className="text-[10px] font-normal">
              1–{Math.min(presets.length, MAX_PRESETS)} to apply
            </span>
          )}
        </DropdownMenuLabel>
        {presets.length === 0 ? (
          <DropdownMenuItem disabled>No presets yet</DropdownMenuItem>
        ) : (
          presets.slice(0, MAX_PRESETS).map((preset, index) => (
            <DropdownMenuItem
              key={preset.id}
              onSelect={() => void apply(preset)}
              className="items-start gap-2"
            >
              <span className="mt-0.5 w-4 shrink-0 text-center font-mono text-xs text-muted-foreground">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{preset.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {providerName(preset.providerId)} · {describePreset(preset)}
                </span>
              </span>
              {current?.id === preset.id ? (
                <DropdownMenuShortcut>
                  <Icon name="Check" className="size-4" />
                </DropdownMenuShortcut>
              ) : null}
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={presets.length >= MAX_PRESETS}
          onSelect={() => setDialog({ kind: "create" })}
        >
          <Icon name="Plus" className="size-4" />
          New preset from current selection…
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setDialog({ kind: "manage" })}>
          <Icon name="Settings" className="size-4" />
          Manage presets…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <>
      <span ref={anchorRef} className={dock === null ? "contents" : "hidden"}>
        {dock === null ? button : null}
      </span>
      {dock === null ? null : createPortal(button, dock.host)}
      {picker === null
        ? null
        : createPortal(
            <PickerPresets
              presets={presets}
              currentId={current?.id ?? null}
              canCreate={presets.length < MAX_PRESETS}
              providerName={providerName}
              onApply={applyFromPicker}
              onCreate={() => {
                picker.close();
                setDialog({ kind: "create" });
              }}
            />,
            picker.host,
          )}
      {dialog?.kind === "create" ? (
        <PresetDialog
          open
          onOpenChange={(next) => {
            if (!next) setDialog(null);
          }}
          editing={null}
          seed={selection}
          onSave={create}
        />
      ) : null}
      {dialog?.kind === "manage" ? (
        <Dialog
          open
          onOpenChange={(next) => {
            if (!next) setDialog(null);
          }}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Manage presets</DialogTitle>
              <DialogDescription>
                Reorder, edit, or delete the presets offered in the New thread
                composer.
              </DialogDescription>
            </DialogHeader>
            <PresetManager seed={selection} />
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
