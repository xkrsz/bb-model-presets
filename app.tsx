// bb-plugin-model-presets: frontend entry.
//
// Adds the preset control to the New thread composer (docked beside the model
// picker), a rebindable "Open model presets" composer command, and a Presets
// section on the plugin's settings page.
import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { PresetAction } from "@/components/preset-menu";
import { PresetManager } from "@/components/preset-manager";
import { togglePresetMenu } from "@/lib/menu-registry";

function SettingsPresets() {
  return <PresetManager />;
}

export default definePluginApp((app) => {
  app.composer.customize({
    id: "model-presets",
    scopes: ["new-thread"],
    actions: [{ id: "picker", component: PresetAction }],
  });

  // bb routes the shortcut to the composer holding the caret (or the focused
  // pane's composer) and lists the command under Settings → Keyboard, where
  // the user can rebind it. Outside the New thread composer no menu is
  // registered and the command does nothing.
  app.composer.experimental_registerCommand({
    id: "open-presets",
    title: "Open model presets",
    defaultShortcut: { key: "l", mod: true, shift: true },
    run({ composer }) {
      togglePresetMenu(composer.key);
    },
  });

  app.slots.settingsSection({
    id: "presets",
    title: "Presets",
    description:
      "Presets are applied from the New thread composer. Order sets their number keys in the menu.",
    component: SettingsPresets,
  });
});
