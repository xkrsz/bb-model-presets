---
name: model-presets
description: Manage bb model presets (provider, model, effort, speed, thread instructions) with `bb model-presets`, or check which preset a thread was started with. Use when the user asks to list, add, remove, or inspect model presets.
---

# Model presets

Presets live in the Model Presets plugin. The user applies them from the
New thread composer (the button after the model picker, or `Mod+Shift+L`
then `1`–`9`). Agents can't apply a preset to a composer. The CLI only
manages the list and reads thread links.

```
bb model-presets list [--json]
bb model-presets show <id|name> [--json]
bb model-presets thread [<thread-id>] [--json]
bb model-presets add --name <name> --provider <id> --model <model> \
  [--effort <level>] [--speed <tier>] [--instructions <text>] [--json]
bb model-presets remove <id> [--json]
```

- `thread` with no id uses the calling thread. It reports the preset the
  thread started with, read from the thread's plugin metadata.
- `--provider` takes a bb provider id (`bb provider list`), `--model` an exact
  model id from `bb provider models <provider-id>`. Check both before adding.
- `--effort` defaults to `medium`. `--speed` is the service tier and only
  matters for providers that offer one; omit it otherwise.
- At most 9 presets; menu order sets their number keys. Reorder in the
  plugin's settings page.
- Instructions (max 4000 chars) are appended to a new thread's system prompt
  only when the thread runs the preset's provider and model. Editing a preset
  changes instructions for threads already linked to it.
