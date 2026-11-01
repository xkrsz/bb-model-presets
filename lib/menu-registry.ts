// Lets the "Open model presets" composer command reach the menu of the
// composer that handles it. Each mounted PresetAction registers under its
// composer's draft key; the command looks the key up.

type MenuToggle = () => void;

const menus = new Map<string, MenuToggle>();

export function registerPresetMenu(
  composerKey: string,
  toggle: MenuToggle,
): () => void {
  menus.set(composerKey, toggle);
  return () => {
    if (menus.get(composerKey) === toggle) menus.delete(composerKey);
  };
}

/** False when no preset menu is mounted in that composer. */
export function togglePresetMenu(composerKey: string): boolean {
  const toggle = menus.get(composerKey);
  if (toggle === undefined) return false;
  toggle();
  return true;
}
