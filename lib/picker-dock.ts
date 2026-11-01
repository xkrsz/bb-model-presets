// Places the preset control beside bb's model picker.
//
// The bundled composer renders plugin actions in its right-hand group, next to
// voice and send, and the provider/model/effort controls in its left-hand
// group. There is no slot inside the left group, so the action keeps an anchor
// in its own slot, finds the left group through the composer's `data-promptbox-*`
// attributes, and portals its button into a node appended there. When the
// markup is not found (a different composer plugin, compact layout, a bb
// change) the hook returns null and the action renders in its own slot.
import { useEffect, useState, type RefObject } from "react";

const ACTION_ROW = "[data-promptbox-action-row]";
const PICKER_GROUP =
  ":scope > [data-promptbox-expanded-only][data-promptbox-standard-actions]";

function findPickerGroup(anchor: HTMLElement): HTMLElement | null {
  const row = anchor.closest<HTMLElement>(ACTION_ROW);
  if (row === null) return null;
  const group = row.querySelector<HTMLElement>(PICKER_GROUP);
  // The anchor itself lives in the right-hand group; never dock into that.
  return group !== null && !group.contains(anchor) ? group : null;
}

export interface PickerDock {
  /** Node at the end of the picker group to portal into. */
  host: HTMLElement;
  /** The picker group itself. */
  group: HTMLElement;
}

export function usePickerDock(
  anchorRef: RefObject<HTMLElement | null>,
): PickerDock | null {
  const [dock, setDock] = useState<PickerDock | null>(null);

  useEffect(() => {
    const anchor = anchorRef.current;
    if (anchor === null) return;
    const host = document.createElement("div");
    host.dataset.modelPresetsDock = "";
    host.className = "flex min-w-0 shrink items-center";
    let group: HTMLElement | null = null;

    // Keep the host attached as the group's last child: React appends
    // controls that mount later (after a provider loads) at the end.
    const groupObserver = new MutationObserver(() => {
      if (group !== null && group.lastElementChild !== host) {
        group.appendChild(host);
      }
    });

    const attach = () => {
      const next = findPickerGroup(anchor);
      if (next === group && (next === null || host.parentElement === next)) {
        return;
      }
      groupObserver.disconnect();
      group = next;
      if (group === null) {
        host.remove();
        setDock(null);
        return;
      }
      group.appendChild(host);
      groupObserver.observe(group, { childList: true });
      setDock({ host, group });
    };

    attach();
    // The left group unmounts in compact layout and remounts on expand.
    const row = anchor.closest<HTMLElement>(ACTION_ROW);
    const rowObserver = new MutationObserver(attach);
    if (row !== null) rowObserver.observe(row, { childList: true });

    return () => {
      rowObserver.disconnect();
      groupObserver.disconnect();
      host.remove();
      setDock(null);
    };
  }, [anchorRef]);

  return dock;
}
