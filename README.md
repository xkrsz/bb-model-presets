# bb-model-presets

Model presets for the bb **New thread** composer. A preset bundles:

- a name
- provider + model
- effort (reasoning level)
- speed (service tier, only for providers that support it)
- custom thread instructions added to every thread started with the preset
  (e.g. "keep saving relevant information from this thread to memory")

## Install

```
bb plugin install https://github.com/xkrsz/bb-model-presets
```

or from the `bb-community` marketplace once listed: `bb plugin install model-presets`.

## Using it

- A preset button sits right after the model and effort pickers in the New
  thread composer. It shows the preset that matches the current selection and
  opens a numbered menu of presets, plus "New preset from current selection…"
  and "Manage presets…" (reorder, edit, delete).
- Shortcut: `Mod+Shift+L` opens the menu from the New thread composer; press
  `1`–`9` to apply that preset (keys follow the menu order). It is a bb
  composer command, so you rebind it under Settings → Keyboard ("Open model
  presets"). If the default collides with another binding, bb leaves it
  unbound until you pick one.
- Applying a preset calls the composer's `setSelection`, the same path the
  native pickers use. If the composer can't offer the preset's provider or
  model (provider not installed, model gone), a toast says so and nothing is
  marked active.
- Thread instructions are injected by the server when the thread starts,
  provided the thread really runs the preset's provider + model (so changing
  the model by hand afterwards opts out).
- The plugin's settings page also lists and manages presets.

CLI (for you or agents):

```
bb model-presets list [--json]
bb model-presets show <id|name>
bb model-presets thread [<thread-id>]      # which preset a thread was started with
bb model-presets add --name "Deep review" --provider claude-code --model claude-opus-5-5 --effort high --speed fast --instructions "…"
bb model-presets remove <id>
```

## How it works

- `server.ts` stores presets (ordered) in `bb.storage.kv`, exposes them over
  plugin RPC, and uses `bb.agents.configure` to append a preset's instructions
  to new threads. `thread.created` marks a thread as new; the first
  configuration resolution links it to the active preset when provider + model
  match. The link goes into the thread's plugin metadata
  (`presetId`, `presetName`), which bb hands back to `configure` on later
  turns and keeps after restarts. Links written by 0.1.x to kv are still read.
- `components/preset-menu.tsx` reads and writes the selection through
  `useComposer()`. bb has no plugin slot inside the picker group, so
  `lib/picker-dock.ts` finds that group through the bundled composer's
  `data-promptbox-*` attributes and portals the button into it. When the
  markup isn't there (compact layout, another composer plugin, a bb change)
  the button stays in the regular plugin action slot next to send.
- `app.tsx` registers the "Open model presets" composer command; bb routes it
  to the focused composer and `lib/menu-registry.ts` opens that composer's
  menu.

## Development

```
git clone https://github.com/xkrsz/bb-model-presets ~/src/xkrsz/bb-model-presets
cd ~/src/xkrsz/bb-model-presets
npm install --include=dev
bb plugin install .        # run from this checkout
bb plugin dev              # rebuild + reload on save
npm run typecheck && npm test
```

Releases are `vX.Y.Z` tags; bb installs the highest tag a range allows.

## License

MIT
