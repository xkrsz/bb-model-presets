// bb-plugin-model-presets — backend entry.
//
// Owns the preset list (ordered, in bb.storage.kv), the "active" preset the
// user last applied from the new-thread composer, and the thread → preset
// links that let `bb.agents.configure` inject a preset's custom instructions
// into every thread created with it.
import { randomUUID } from "node:crypto";
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { parseShortcut, serializeShortcut } from "./lib/shortcut";
import {
  DEFAULT_SHORTCUT,
  MAX_INSTRUCTIONS_LENGTH,
  MAX_PRESETS,
  PRESETS_CHANGED,
  REASONING_LEVELS,
  SERVICE_TIERS,
} from "./shared/constants";

export const reasoningLevelSchema = z.enum(REASONING_LEVELS);
export const serviceTierSchema = z.enum(SERVICE_TIERS);

export const presetFieldsSchema = z.object({
  name: z.string().trim().min(1).max(80),
  providerId: z.string().trim().min(1),
  model: z.string().trim().min(1),
  reasoningLevel: reasoningLevelSchema,
  /** null when the provider has no service tiers (or the user left it alone). */
  serviceTier: serviceTierSchema.nullable(),
  /** Appended to the agent instructions of every thread started with this preset. */
  instructions: z.string().max(MAX_INSTRUCTIONS_LENGTH),
});
export const presetSchema = presetFieldsSchema.extend({
  id: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Preset = z.infer<typeof presetSchema>;
export type PresetFields = z.infer<typeof presetFieldsSchema>;

/**
 * "mod+shift+l" style combo. Must carry mod (⌘/Ctrl) or alt so a plain key
 * can never hijack typing in the composer.
 */
export const shortcutSchema = z
  .string()
  .trim()
  .max(40)
  .transform((value, ctx) => {
    const parsed = parseShortcut(value);
    if (parsed === null) {
      ctx.addIssue({ code: "custom", message: "Unrecognised shortcut." });
      return z.NEVER;
    }
    if (!parsed.mod && !parsed.alt) {
      ctx.addIssue({
        code: "custom",
        message: "Shortcut needs a ⌘/Ctrl or ⌥/Alt modifier.",
      });
      return z.NEVER;
    }
    return serializeShortcut(parsed);
  });

const presetListOutput = z.object({
  presets: z.array(presetSchema),
  activePresetId: z.string().nullable(),
  shortcut: z.string(),
});

export const rpcContract = defineRpcContract({
  presets_list: { input: z.null(), output: presetListOutput },
  presets_create: { input: presetFieldsSchema, output: presetSchema },
  presets_update: {
    input: presetFieldsSchema.extend({ id: z.string() }),
    output: presetSchema,
  },
  presets_delete: {
    input: z.object({ id: z.string() }),
    output: z.object({ removed: z.boolean() }),
  },
  presets_reorder: {
    input: z.object({ ids: z.array(z.string()) }),
    output: z.object({ presets: z.array(presetSchema) }),
  },
  presets_set_active: {
    input: z.object({ id: z.string().nullable() }),
    output: z.object({ activePresetId: z.string().nullable() }),
  },
  shortcut_set: {
    /** null restores the default. */
    input: z.object({ shortcut: shortcutSchema.nullable() }),
    output: z.object({ shortcut: z.string() }),
  },
});

const KV_PRESETS = "presets";
const KV_ACTIVE = "active-preset-id";
const KV_THREAD_LINKS = "thread-links";
const KV_SHORTCUT = "shortcut";

/** Threads must have been created this recently to auto-link to the active preset. */
const NEW_THREAD_WINDOW_MS = 10 * 60 * 1000;
const MAX_THREAD_LINKS = 1000;

interface ThreadPresetLink {
  presetId: string;
  at: number;
}

export function formatPresetInstructions(preset: Preset): string | null {
  const body = preset.instructions.trim();
  if (body === "") return null;
  return `Instructions from the "${preset.name}" model preset this thread was started with:\n\n${body}`;
}

export default async function plugin(bb: BbPluginApi) {
  // --- state -------------------------------------------------------------
  // `bb.agents.configure` is synchronous, so everything it needs lives in
  // memory and is written through to kv.
  let presets: Preset[] = parsePresets(
    await bb.storage.kv.get<unknown>(KV_PRESETS),
  );
  let activePresetId: string | null =
    (await bb.storage.kv.get<string | null>(KV_ACTIVE)) ?? null;
  let shortcut: string =
    shortcutSchema.safeParse(await bb.storage.kv.get<string>(KV_SHORTCUT))
      .data ?? DEFAULT_SHORTCUT;
  const threadLinks = new Map<string, ThreadPresetLink>(
    Object.entries(
      (await bb.storage.kv.get<Record<string, ThreadPresetLink>>(
        KV_THREAD_LINKS,
      )) ?? {},
    ),
  );
  /** Threads created since load, so `configure` can tell "new" from "resumed". */
  const recentlyCreated = new Map<string, number>();

  function parsePresets(raw: unknown): Preset[] {
    const parsed = z.array(presetSchema).safeParse(raw);
    if (!parsed.success) {
      if (raw !== undefined && raw !== null) {
        bb.log.warn(`stored presets failed validation; starting empty`);
      }
      return [];
    }
    return parsed.data;
  }

  async function persistPresets(): Promise<void> {
    await bb.storage.kv.set(KV_PRESETS, presets);
    bb.realtime.publish(PRESETS_CHANGED, { count: presets.length });
  }
  async function persistActive(): Promise<void> {
    await bb.storage.kv.set(KV_ACTIVE, activePresetId);
    bb.realtime.publish(PRESETS_CHANGED, { count: presets.length });
  }
  function persistThreadLinks(): void {
    if (threadLinks.size > MAX_THREAD_LINKS) {
      const oldest = [...threadLinks.entries()]
        .sort((a, b) => a[1].at - b[1].at)
        .slice(0, threadLinks.size - MAX_THREAD_LINKS);
      for (const [threadId] of oldest) threadLinks.delete(threadId);
    }
    bb.storage.kv
      .set(KV_THREAD_LINKS, Object.fromEntries(threadLinks))
      .catch((error: unknown) => {
        bb.log.warn(`failed to persist thread links: ${String(error)}`);
      });
  }

  function getPreset(id: string): Preset | undefined {
    return presets.find((preset) => preset.id === id);
  }
  function activePreset(): Preset | null {
    return activePresetId === null ? null : (getPreset(activePresetId) ?? null);
  }

  // --- mutations ---------------------------------------------------------
  async function createPreset(fields: PresetFields): Promise<Preset> {
    if (presets.length >= MAX_PRESETS) {
      throw new Error(
        `At most ${MAX_PRESETS} presets are supported (they map to the 1-${MAX_PRESETS} keys).`,
      );
    }
    const now = Date.now();
    const preset: Preset = {
      ...fields,
      id: randomUUID().slice(0, 8),
      createdAt: now,
      updatedAt: now,
    };
    presets = [...presets, preset];
    await persistPresets();
    return preset;
  }
  async function updatePreset(
    id: string,
    fields: PresetFields,
  ): Promise<Preset> {
    const existing = getPreset(id);
    if (existing === undefined) throw new Error(`No preset with id ${id}`);
    const next: Preset = { ...existing, ...fields, updatedAt: Date.now() };
    presets = presets.map((preset) => (preset.id === id ? next : preset));
    await persistPresets();
    return next;
  }
  async function deletePreset(id: string): Promise<boolean> {
    const remaining = presets.filter((preset) => preset.id !== id);
    if (remaining.length === presets.length) return false;
    presets = remaining;
    if (activePresetId === id) {
      activePresetId = null;
      await bb.storage.kv.set(KV_ACTIVE, null);
    }
    await persistPresets();
    return true;
  }
  async function reorderPresets(ids: string[]): Promise<Preset[]> {
    const byId = new Map(presets.map((preset) => [preset.id, preset]));
    const ordered: Preset[] = [];
    for (const id of ids) {
      const preset = byId.get(id);
      if (preset === undefined) continue;
      ordered.push(preset);
      byId.delete(id);
    }
    // Anything the caller left out keeps its relative order at the end.
    for (const preset of presets) {
      if (byId.has(preset.id)) ordered.push(preset);
    }
    presets = ordered;
    await persistPresets();
    return presets;
  }
  async function setShortcut(next: string | null): Promise<string> {
    shortcut = next ?? DEFAULT_SHORTCUT;
    await bb.storage.kv.set(KV_SHORTCUT, shortcut);
    bb.realtime.publish(PRESETS_CHANGED, { count: presets.length });
    return shortcut;
  }
  async function setActive(id: string | null): Promise<string | null> {
    if (id !== null && getPreset(id) === undefined) {
      throw new Error(`No preset with id ${id}`);
    }
    activePresetId = id;
    await persistActive();
    return activePresetId;
  }

  // --- rpc -----------------------------------------------------------------
  bb.rpc.register(rpcContract, {
    presets_list: () => ({ presets, activePresetId, shortcut }),
    presets_create: (fields) => createPreset(fields),
    presets_update: ({ id, ...fields }) => updatePreset(id, fields),
    presets_delete: async ({ id }) => ({ removed: await deletePreset(id) }),
    presets_reorder: async ({ ids }) => ({ presets: await reorderPresets(ids) }),
    presets_set_active: async ({ id }) => ({
      activePresetId: await setActive(id),
    }),
    shortcut_set: async ({ shortcut: next }) => ({
      shortcut: await setShortcut(next),
    }),
  });

  // --- thread linking ------------------------------------------------------
  bb.events.on("thread.created", ({ thread }) => {
    recentlyCreated.set(thread.id, Date.now());
    // Keep the map bounded; entries only matter for a few minutes.
    if (recentlyCreated.size > 200) {
      const cutoff = Date.now() - NEW_THREAD_WINDOW_MS;
      for (const [id, at] of recentlyCreated) {
        if (at < cutoff) recentlyCreated.delete(id);
      }
    }
  });
  bb.events.on("thread.deleted", ({ thread }) => {
    recentlyCreated.delete(thread.id);
    if (threadLinks.delete(thread.id)) persistThreadLinks();
  });

  bb.agents.configure((context) => {
    const preset = resolvePresetForThread(context);
    const instructions = preset === null ? null : formatPresetInstructions(preset);
    return {
      tools: [],
      skills: [],
      ...(instructions === null ? {} : { instructions }),
    };
  });

  function resolvePresetForThread(context: {
    thread: { id: string };
    provider: { id: string; model: string };
    origin: { kind: "fork" | null };
  }): Preset | null {
    const linked = threadLinks.get(context.thread.id);
    if (linked !== undefined) return getPreset(linked.presetId) ?? null;
    if (context.origin.kind === "fork") return null;
    const active = activePreset();
    if (active === null) return null;
    const createdAt = recentlyCreated.get(context.thread.id);
    if (createdAt === undefined || Date.now() - createdAt > NEW_THREAD_WINDOW_MS) {
      return null;
    }
    // The composer may have been changed by hand after the preset was applied;
    // only link when the thread actually runs the preset's provider + model.
    if (
      context.provider.id !== active.providerId ||
      context.provider.model !== active.model
    ) {
      return null;
    }
    threadLinks.set(context.thread.id, { presetId: active.id, at: Date.now() });
    recentlyCreated.delete(context.thread.id);
    persistThreadLinks();
    return active;
  }

  // --- cli -----------------------------------------------------------------
  const usage = [
    "Usage:",
    "  bb model-presets list [--json]",
    "  bb model-presets show <id|name> [--json]",
    "  bb model-presets thread [<thread-id>] [--json]",
    "  bb model-presets add --name <name> --provider <id> --model <model> [--effort <level>] [--speed default|fast] [--instructions <text>] [--json]",
    "  bb model-presets remove <id> [--json]",
    "",
    "Presets are applied from the New thread screen; the CLI only manages them.",
  ].join("\n");

  function formatPreset(preset: Preset, index: number): string {
    const tier = preset.serviceTier === null ? "" : ` · ${preset.serviceTier}`;
    const head = `${index + 1}. ${preset.name}  [${preset.id}]  ${preset.providerId} / ${preset.model} · ${preset.reasoningLevel}${tier}`;
    const body = preset.instructions.trim();
    return body === "" ? head : `${head}\n   ${body.replace(/\n/g, "\n   ")}`;
  }

  function parseFlags(args: string[]): {
    flags: Record<string, string>;
    positional: string[];
  } {
    const flags: Record<string, string> = {};
    const positional: string[] = [];
    for (let i = 0; i < args.length; i += 1) {
      const arg = args[i]!;
      if (arg.startsWith("--")) {
        const eq = arg.indexOf("=");
        if (eq !== -1) {
          flags[arg.slice(2, eq)] = arg.slice(eq + 1);
        } else {
          const value = args[i + 1];
          if (value === undefined || value.startsWith("--")) {
            flags[arg.slice(2)] = "";
          } else {
            flags[arg.slice(2)] = value;
            i += 1;
          }
        }
      } else {
        positional.push(arg);
      }
    }
    return { flags, positional };
  }

  bb.cli.register({
    name: "model-presets",
    summary: "Manage the model presets offered on the New thread screen",
    commands: [
      {
        name: "list",
        summary: "List presets in menu order",
        usage: "bb model-presets list [--json]",
      },
      {
        name: "show",
        summary: "Show one preset",
        usage: "bb model-presets show <id|name> [--json]",
      },
      {
        name: "thread",
        summary: "Show which preset a thread was started with",
        usage: "bb model-presets thread [<thread-id>] [--json]",
      },
      {
        name: "add",
        summary: "Create a preset",
        usage:
          "bb model-presets add --name <name> --provider <id> --model <model> [--effort <level>] [--speed default|fast] [--instructions <text>] [--json]",
      },
      {
        name: "remove",
        summary: "Delete a preset",
        usage: "bb model-presets remove <id> [--json]",
      },
    ],
    async run(argv, ctx) {
      const json = argv.includes("--json");
      const [command, ...rest] = argv.filter((arg) => arg !== "--json");
      const reply = (value: unknown, text: string) => ({
        exitCode: 0,
        stdout: json ? JSON.stringify(value, null, 2) : text,
      });
      switch (command) {
        case undefined:
        case "help":
        case "--help":
          return { exitCode: 0, stdout: usage };
        case "list":
          return reply(
            { presets, activePresetId, shortcut },
            presets.length === 0
              ? "No presets yet. Create one from the New thread screen."
              : presets.map(formatPreset).join("\n"),
          );
        case "show": {
          const query = rest.join(" ").trim();
          const index = presets.findIndex(
            (preset) =>
              preset.id === query ||
              preset.name.toLowerCase() === query.toLowerCase(),
          );
          if (index === -1) {
            return { exitCode: 1, stderr: `No preset matching "${query}".` };
          }
          return reply(presets[index], formatPreset(presets[index]!, index));
        }
        case "thread": {
          const threadId = rest[0] ?? ctx.threadId;
          if (threadId === undefined) {
            return {
              exitCode: 1,
              stderr: "Pass a thread id (none could be inferred).",
            };
          }
          const link = threadLinks.get(threadId);
          const preset = link === undefined ? null : (getPreset(link.presetId) ?? null);
          return reply(
            { threadId, preset },
            preset === null
              ? `Thread ${threadId} was not started with a preset.`
              : formatPreset(preset, presets.indexOf(preset)),
          );
        }
        case "add": {
          const { flags } = parseFlags(rest);
          const parsed = presetFieldsSchema.safeParse({
            name: flags.name ?? "",
            providerId: flags.provider ?? "",
            model: flags.model ?? "",
            reasoningLevel: flags.effort ?? "medium",
            serviceTier: flags.speed ?? null,
            instructions: flags.instructions ?? "",
          });
          if (!parsed.success) {
            return {
              exitCode: 1,
              stderr: parsed.error.issues
                .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
                .join("\n"),
            };
          }
          const preset = await createPreset(parsed.data);
          return reply(preset, `Added ${formatPreset(preset, presets.length - 1)}`);
        }
        case "remove": {
          const id = rest[0];
          if (id === undefined) break;
          if (!(await deletePreset(id))) {
            return { exitCode: 1, stderr: `No preset with id ${id}.` };
          }
          return reply({ removed: true, id }, `Removed ${id}`);
        }
      }
      return { exitCode: 1, stderr: usage };
    },
  });

  bb.log.info(`loaded with ${presets.length} preset(s)`);
}
