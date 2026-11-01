// Finds bb's open "Provider, model and reasoning" popover so the preset list
// can render at its top.
//
// The picker takes no extra content, so this goes through the DOM: the
// trigger is a Radix popover trigger inside the composer's picker group, and
// while it is expanded its `aria-controls` names the popover content (portaled
// to <body>). A host node is prepended there; React keeps managing the
// picker's own children around it. On the mobile drawer, or if the markup
// changes, nothing is found and the picker stays untouched.
import { useEffect, useState } from "react";

const PICKER_TRIGGER =
  'button[aria-haspopup="dialog"][aria-label^="Provider, model and reasoning"]';

export interface PickerPopover {
  /** Node at the top of the popover to portal into. */
  host: HTMLElement;
  /** The popover content element. */
  content: HTMLElement;
  /** Close the popover the way a second click on its trigger would. */
  close(): void;
}

export function usePickerPopover(
  group: HTMLElement | null,
  enabled: boolean,
): PickerPopover | null {
  const [popover, setPopover] = useState<PickerPopover | null>(null);

  useEffect(() => {
    if (group === null || !enabled) return;
    const host = document.createElement("div");
    host.dataset.modelPresetsPicker = "";
    host.className = "shrink-0 border-b border-border";
    let content: HTMLElement | null = null;

    const sync = () => {
      const trigger = group.querySelector<HTMLButtonElement>(PICKER_TRIGGER);
      const id =
        trigger?.getAttribute("aria-expanded") === "true"
          ? trigger.getAttribute("aria-controls")
          : null;
      const next = id === null ? null : document.getElementById(id);
      if (next === content && (next === null || host.parentElement === next)) {
        return;
      }
      content = next;
      if (next === null || trigger === null) {
        host.remove();
        setPopover(null);
        return;
      }
      next.prepend(host);
      setPopover({
        host,
        content: next,
        close() {
          if (trigger.getAttribute("aria-expanded") === "true") trigger.click();
        },
      });
    };

    sync();
    // The trigger flips aria-expanded (and can be replaced when providers
    // load); the content mounts as a new child of <body>.
    const groupObserver = new MutationObserver(sync);
    groupObserver.observe(group, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-expanded", "aria-controls"],
    });
    const bodyObserver = new MutationObserver(sync);
    bodyObserver.observe(document.body, { childList: true });

    return () => {
      groupObserver.disconnect();
      bodyObserver.disconnect();
      host.remove();
      setPopover(null);
    };
  }, [group, enabled]);

  return popover;
}

/** Resolves once `element` leaves the document (or after `timeoutMs`). */
export function whenDetached(
  element: HTMLElement,
  timeoutMs = 1000,
): Promise<void> {
  return new Promise((resolve) => {
    if (!element.isConnected) return resolve();
    const done = () => {
      observer.disconnect();
      clearTimeout(timer);
      resolve();
    };
    const observer = new MutationObserver(() => {
      if (!element.isConnected) done();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = setTimeout(done, timeoutMs);
  });
}
