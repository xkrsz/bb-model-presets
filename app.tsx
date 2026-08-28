// bb-plugin-model-presets — frontend entry.
//
// Registers the "Preset" control in the built-in New thread composer, the
// keyboard shortcut that opens it, and a Presets section on the plugin's
// settings page.
import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { PresetAction } from "@/components/preset-menu";
import { PresetManager } from "@/components/preset-manager";
import { handleShortcutKeydown } from "@/lib/shortcut";

function SettingsPresets() {
  return <PresetManager />;
}

export default definePluginApp((app) => {
  app.composer.customize({
    id: "model-presets",
    scopes: ["new-thread"],
    actions: [{ id: "picker", component: PresetAction }],
  });

  // The shortcut only does something while a PresetAction is mounted (the
  // New thread screen); elsewhere the registry is empty and the key passes
  // through to bb untouched.
  app.contentScripts.register({
    id: "preset-shortcut",
    mount({ signal }) {
      document.addEventListener("keydown", handleShortcutKeydown, {
        capture: true,
        signal,
      });
      return () => {
        document.removeEventListener("keydown", handleShortcutKeydown, {
          capture: true,
        });
      };
    },
  });

  app.slots.settingsSection({
    id: "presets",
    title: "Presets",
    description:
      "Presets are applied from the New thread screen. Order sets their number keys; the shortcut below opens the menu.",
    component: SettingsPresets,
  });
});
