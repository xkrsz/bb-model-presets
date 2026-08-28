import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useComposer, useComposerView } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import type { Preset, PresetFields } from "@/server";
import { DEFAULT_SHORTCUT, MAX_PRESETS } from "@/shared/constants";
import { describePreset, usePresets, useProviderName } from "@/hooks/use-presets";
import {
  applyComposerSelection,
  readComposerSelection,
  selectionMatches,
  type ComposerSelection,
} from "@/lib/composer-preferences";
import {
  formatShortcut,
  parseShortcut,
  registerShortcutTarget,
  type ParsedShortcut,
} from "@/lib/shortcut";
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
import { PresetDialog } from "@/components/preset-dialog";
import { PresetManager } from "@/components/preset-manager";
import { cn } from "@/lib/utils";

const FALLBACK_SHORTCUT = parseShortcut(DEFAULT_SHORTCUT)!;

/**
 * The composer writes its own selection to localStorage without an in-tab
 * event, so poll cheaply (four string reads) while the action is mounted.
 */
function useComposerSelection(): ComposerSelection | null {
  const [selection, setSelection] = useState(readComposerSelection);
  useEffect(() => {
    const sync = () => {
      setSelection((current) => {
        const next = readComposerSelection();
        return JSON.stringify(current) === JSON.stringify(next) ? current : next;
      });
    };
    const timer = window.setInterval(sync, 1000);
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);
  return selection;
}

type DialogState = { kind: "create" } | { kind: "manage" } | null;

/** The "Preset" control rendered in the New thread composer's action row. */
export function PresetAction() {
  const composer = useComposer();
  const view = useComposerView();
  const { rpc, presets, activePresetId, refetch, shortcut: shortcutText } = usePresets();
  const providerName = useProviderName();
  const shortcut: ParsedShortcut = useMemo(
    () => parseShortcut(shortcutText) ?? FALLBACK_SHORTCUT,
    [shortcutText],
  );
  const selection = useComposerSelection();
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);

  const matching = useMemo(
    () => presets.find((preset) => selectionMatches(selection, preset)) ?? null,
    [presets, selection],
  );
  // Prefer the preset the user actually applied when several share a model.
  const current =
    matching !== null && activePresetId !== null
      ? (presets.find(
          (preset) =>
            preset.id === activePresetId && selectionMatches(selection, preset),
        ) ?? matching)
      : matching;

  useEffect(
    () =>
      registerShortcutTarget({
        shortcut,
        trigger: () => {
          if (dialog !== null) return false;
          setOpen((value) => !value);
          return true;
        },
      }),
    [shortcut, dialog],
  );

  const apply = (preset: Preset) => {
    applyComposerSelection(preset);
    setOpen(false);
    rpc.call("presets_set_active", { id: preset.id }).then(refetch, (cause: unknown) => {
      toast.error(cause instanceof Error ? cause.message : String(cause));
    });
    composer.focus();
  };

  const create = async (fields: PresetFields) => {
    const preset = await rpc.call("presets_create", fields);
    refetch();
    apply(preset);
  };

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (!/^[1-9]$/.test(event.key)) return;
    const preset = presets[Number(event.key) - 1];
    if (preset === undefined) return;
    event.preventDefault();
    apply(preset);
  };

  const label = current === null ? "Preset" : current.name;
  const shortcutLabel = formatShortcut(shortcut);

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={view.run.isSubmitting}
            aria-label={
              current === null
                ? `Model presets (${shortcutLabel})`
                : `Model preset: ${current.name} (${shortcutLabel})`
            }
            className={cn(
              COARSE_POINTER_PROMPT_ACTION_BUTTON_CLASS,
              "gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground data-[state=open]:bg-state-active data-[state=open]:text-foreground",
            )}
          >
            <Icon name="SlidersHorizontal" className="size-4 shrink-0" />
            <span className="max-w-[9rem] truncate">{label}</span>
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
            <span className="font-mono text-[10px]">{shortcutLabel}</span>
          </DropdownMenuLabel>
          {presets.length === 0 ? (
            <DropdownMenuItem disabled>No presets yet</DropdownMenuItem>
          ) : (
            presets.slice(0, MAX_PRESETS).map((preset, index) => {
              const isCurrent = current?.id === preset.id;
              return (
                <DropdownMenuItem
                  key={preset.id}
                  onSelect={() => apply(preset)}
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
                  {isCurrent ? (
                    <DropdownMenuShortcut>
                      <Icon name="Check" className="size-4" />
                    </DropdownMenuShortcut>
                  ) : null}
                </DropdownMenuItem>
              );
            })
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
      {dialog?.kind === "create" ? (
        <PresetDialog
          open
          onOpenChange={(next) => {
            if (!next) setDialog(null);
          }}
          editing={null}
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
            <PresetManager />
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
