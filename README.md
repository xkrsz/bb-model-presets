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

- A **Preset** button sits in the New thread composer's action row. It opens a
  numbered menu of presets, plus "New preset from current selection…" and
  "Manage presets…" (reorder, edit, delete).
- **Shortcut:** `Mod+Shift+L` by default opens the menu on the New thread
  screen; press `1`–`9` to apply that preset (keys follow the menu order). Change
  it from the plugin's Settings page or the Manage presets dialog: click the
  shortcut control, press the new combination, done (Esc cancels, the arrow
  button resets). Combos need ⌘/Ctrl or ⌥/Alt; the control warns when a combo
  is one of bb's defaults.
- Applying a preset sets the composer's provider/model/effort/speed, exactly as
  if you had picked them in the native picker. Thread instructions are injected
  by the server when the thread starts, provided the thread really runs the
  preset's provider + model (so changing the model by hand afterwards opts out).
- The plugin's settings page also lists and manages presets.

CLI (for you or agents):

```
bb model-presets list [--json]
bb model-presets show <id|name>
bb model-presets thread [<thread-id>]      # which preset a thread was started with
bb model-presets add --name "Deep review" --provider claude-code --model claude-fable-5 --effort high --speed fast --instructions "…"
bb model-presets remove <id>
```

## How it works

- `server.ts` stores presets (ordered) in `bb.storage.kv`, exposes them over
  plugin RPC, and uses `bb.agents.configure` to append a preset's instructions to
  new threads. `thread.created` marks a thread as new; the first configuration
  resolution links it to the active preset when provider + model match, and the
  link persists so later turns keep the same instructions.
- `lib/composer-preferences.ts` drives the built-in composer by writing bb's own
  remembered-selection localStorage keys (`bb.promptbox.*`) and dispatching
  `storage` events, which the composer's jotai atoms subscribe to. This is an
  internal bb contract (storage version `1`); if the composer changes how it
  persists selections, update that file.
- `lib/shortcut.ts` + a content script own the global keydown listener; the
  composer action registers itself as the shortcut target while mounted.

## Development

```
git clone https://github.com/xkrsz/bb-model-presets ~/src/bb-model-presets
cd ~/src/bb-model-presets
npm install --include=dev
bb plugin install .        # run from this checkout
bb plugin dev              # rebuild + reload on save
npm run typecheck && npm test
```

Releases are `vX.Y.Z` tags; bb installs the highest tag a range allows.

## License

MIT
