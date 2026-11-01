import { describe, expect, it } from "vitest";
import { currentPreset, presetSelection, selectionMatches } from "./selection";

const deep = {
  id: "a",
  providerId: "claude-code",
  model: "claude-opus-5-5",
  reasoningLevel: "high",
  serviceTier: null,
};
const fast = {
  id: "b",
  providerId: "codex",
  model: "gpt-5.5",
  reasoningLevel: "low",
  serviceTier: "fast",
};

describe("selectionMatches", () => {
  it("ignores the tier when the preset has none", () => {
    expect(
      selectionMatches(
        { providerId: "claude-code", model: "claude-opus-5-5", reasoningLevel: "high", serviceTier: "default" },
        deep,
      ),
    ).toBe(true);
  });

  it("requires the preset's tier when the composer reports one", () => {
    const base = { providerId: "codex", model: "gpt-5.5", reasoningLevel: "low" };
    expect(selectionMatches({ ...base, serviceTier: "fast" }, fast)).toBe(true);
    expect(selectionMatches({ ...base, serviceTier: "default" }, fast)).toBe(false);
  });

  it("never matches a composer without pickers", () => {
    expect(selectionMatches(null, deep)).toBe(false);
  });
});

describe("presetSelection", () => {
  it("omits the tier for presets without one", () => {
    expect(presetSelection(deep)).not.toHaveProperty("serviceTier");
    expect(presetSelection(fast).serviceTier).toBe("fast");
  });
});

describe("currentPreset", () => {
  it("prefers the last applied preset when several match", () => {
    const twin = { ...deep, id: "c" };
    const selection = { providerId: "claude-code", model: "claude-opus-5-5", reasoningLevel: "high" };
    expect(currentPreset([deep, twin], selection, "c")?.id).toBe("c");
    expect(currentPreset([deep, twin], selection, null)?.id).toBe("a");
  });
});
