import { describe, it, expect, vi, afterEach } from "vitest";
import { readWorld, saveWorld, worldById, worlds } from "../../apps/desktop/src/home/worlds";

const hex = /^#[0-9a-f]{6}$/i;

describe("scene worlds", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("has five distinct worlds with valid colours", () => {
    expect(worlds.map((world) => world.id)).toEqual([
      "office",
      "longhouse",
      "station",
      "ship",
      "frontier",
    ]);
    for (const world of worlds) {
      const colours = [
        ...world.floor.tones,
        world.floor.seam,
        ...world.wall,
        ...world.window,
        ...world.background,
        world.trim,
        ...world.rug,
        world.lamp,
        world.leaves,
      ];
      for (const colour of colours) expect(colour).toMatch(hex);
    }
  });
  it("falls back to the office for unknown or unavailable storage", () => {
    expect(worldById("nowhere").id).toBe("office");
    vi.stubGlobal("localStorage", { getItem: () => "station", setItem: vi.fn() });
    expect(readWorld()).toBe("station");
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readWorld()).toBe("office");
    expect(() => saveWorld("ship")).not.toThrow();
  });
});
