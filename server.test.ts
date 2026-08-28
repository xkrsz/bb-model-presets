import { describe, expect, it } from "vitest";
import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import plugin, { type Preset } from "./server";

const fields = {
  name: "Deep review",
  providerId: "claude-code",
  model: "claude-fable-5",
  reasoningLevel: "high" as const,
  serviceTier: null,
  instructions: "For reviewing your plans, spawn an Opus 5 subagent.",
};

function configureContext(threadId: string, model = fields.model) {
  return {
    thread: { id: threadId, title: null, parentThreadId: null, sourceThreadId: null },
    project: { id: "proj_1", kind: "standard" as const, name: "p", gitRemoteUrl: null },
    environment: {
      id: "env_1",
      name: null,
      path: null,
      workspaceProvisionType: "unmanaged" as const,
      branchName: null,
    },
    host: { id: "host_1", name: "mac" },
    provider: {
      id: "claude-code",
      model,
      capabilities: { supportsNativeUserQuestion: false },
    },
    origin: { kind: null, pluginId: null },
  };
}

async function load() {
  const { bb, harness } = createFakePluginHost({ pluginId: "model-presets" });
  await plugin(bb);
  return { bb, harness };
}

describe("presets rpc", () => {
  it("creates, reorders, and deletes presets", async () => {
    const { harness } = await load();
    const a = (await harness.behavior.callRpc("presets_create", fields)) as Preset;
    const b = (await harness.behavior.callRpc("presets_create", {
      ...fields,
      name: "Fast",
      serviceTier: "fast",
    })) as Preset;
    let list = (await harness.behavior.callRpc("presets_list", null)) as {
      presets: Preset[];
    };
    expect(list.presets.map((p) => p.id)).toEqual([a.id, b.id]);

    await harness.behavior.callRpc("presets_reorder", { ids: [b.id, a.id] });
    list = (await harness.behavior.callRpc("presets_list", null)) as {
      presets: Preset[];
    };
    expect(list.presets.map((p) => p.name)).toEqual(["Fast", "Deep review"]);

    await harness.behavior.callRpc("presets_set_active", { id: a.id });
    await harness.behavior.callRpc("presets_delete", { id: a.id });
    const after = (await harness.behavior.callRpc("presets_list", null)) as {
      presets: Preset[];
      activePresetId: string | null;
    };
    expect(after.presets).toHaveLength(1);
    expect(after.activePresetId).toBeNull();
    expect(harness.realtimeSignals.length).toBeGreaterThan(0);
  });
});

describe("instruction injection", () => {
  it("links a newly created thread to the active preset when provider+model match", async () => {
    const { harness } = await load();
    const preset = (await harness.behavior.callRpc("presets_create", fields)) as Preset;
    await harness.behavior.callRpc("presets_set_active", { id: preset.id });

    await harness.behavior.emitThreadEvent("thread.created", {
      thread: makeThreadResponse({ id: "th_new", providerId: "claude-code" }),
    });
    const config = await harness.behavior.resolveAgentConfiguration(
      configureContext("th_new"),
    );
    expect(config?.instructions).toContain("Deep review");
    expect(config?.instructions).toContain(fields.instructions);

    // Later resolutions keep the link even after the active preset changes.
    await harness.behavior.callRpc("presets_set_active", { id: null });
    const again = await harness.behavior.resolveAgentConfiguration(
      configureContext("th_new"),
    );
    expect(again?.instructions).toContain(fields.instructions);
  });

  it("skips threads whose model differs from the active preset", async () => {
    const { harness } = await load();
    const preset = (await harness.behavior.callRpc("presets_create", fields)) as Preset;
    await harness.behavior.callRpc("presets_set_active", { id: preset.id });
    await harness.behavior.emitThreadEvent("thread.created", {
      thread: makeThreadResponse({ id: "th_other", providerId: "claude-code" }),
    });
    const config = await harness.behavior.resolveAgentConfiguration(
      configureContext("th_other", "claude-sonnet-5"),
    );
    expect(config?.instructions ?? null).toBeNull();
  });

  it("skips threads that were not just created (resumed old threads)", async () => {
    const { harness } = await load();
    const preset = (await harness.behavior.callRpc("presets_create", fields)) as Preset;
    await harness.behavior.callRpc("presets_set_active", { id: preset.id });
    const config = await harness.behavior.resolveAgentConfiguration(
      configureContext("th_old"),
    );
    expect(config?.instructions ?? null).toBeNull();
  });

  it("survives a reload with links intact", async () => {
    const { harness } = await load();
    const preset = (await harness.behavior.callRpc("presets_create", fields)) as Preset;
    await harness.behavior.callRpc("presets_set_active", { id: preset.id });
    await harness.behavior.emitThreadEvent("thread.created", {
      thread: makeThreadResponse({ id: "th_r", providerId: "claude-code" }),
    });
    await harness.behavior.resolveAgentConfiguration(configureContext("th_r"));
    await harness.lifecycle.reload(plugin);
    const config = await harness.behavior.resolveAgentConfiguration(
      configureContext("th_r"),
    );
    expect(config?.instructions).toContain(fields.instructions);
  });
});

describe("cli", () => {
  it("adds and lists presets", async () => {
    const { harness } = await load();
    const added = await harness.behavior.runCli([
      "add",
      "--name",
      "Quick",
      "--provider",
      "codex",
      "--model",
      "gpt-5.5",
      "--effort",
      "low",
      "--speed",
      "fast",
    ]);
    expect(added.exitCode).toBe(0);
    const listed = await harness.behavior.runCli(["list"]);
    expect(listed.stdout).toContain("1. Quick");
    expect(listed.stdout).toContain("codex / gpt-5.5 · low · fast");
    const bad = await harness.behavior.runCli(["add", "--name", "x"]);
    expect(bad.exitCode).toBe(1);
  });
});

describe("shortcut", () => {
  it("stores a normalized combo and rejects modifier-less keys", async () => {
    const { harness } = await load();
    const initial = (await harness.behavior.callRpc("presets_list", null)) as {
      shortcut: string;
    };
    expect(initial.shortcut).toBe("mod+shift+l");
    const set = (await harness.behavior.callRpc("shortcut_set", {
      shortcut: "Shift+Alt+P",
    })) as { shortcut: string };
    expect(set.shortcut).toBe("alt+shift+p");
    await expect(
      harness.behavior.callRpc("shortcut_set", { shortcut: "l" }),
    ).rejects.toThrow();
    await expect(
      harness.behavior.callRpc("shortcut_set", { shortcut: "shift+l" }),
    ).rejects.toThrow();
    const reset = (await harness.behavior.callRpc("shortcut_set", {
      shortcut: null,
    })) as { shortcut: string };
    expect(reset.shortcut).toBe("mod+shift+l");
    await harness.behavior.callRpc("shortcut_set", { shortcut: "mod+alt+k" });
    await harness.lifecycle.reload(plugin);
    const after = (await harness.behavior.callRpc("presets_list", null)) as {
      shortcut: string;
    };
    expect(after.shortcut).toBe("mod+alt+k");
  });
});
