import { describe, expect, it } from "vitest";
import { ruleBodySchema } from "./rules";
import { suggestTemplateKey, TEMPLATES } from "./templates";

describe("starter templates", () => {
  it("covers the six activities with unique keys", () => {
    expect(TEMPLATES.map((t) => t.key).sort()).toEqual(
      ["cycling", "hiking", "kite-surfing", "laundry", "photography", "running"].sort(),
    );
  });

  it.each(TEMPLATES.map((t) => [t.key, t] as const))("%s passes the rule schema", (_key, t) => {
    const r = ruleBodySchema.safeParse(t.body);
    expect(r.success, r.success ? "" : JSON.stringify(r.error.issues)).toBe(true);
  });

  it.each(TEMPLATES.map((t) => [t.key, t] as const))("%s has a usable window, unique ids and fits propose-rule limits", (_key, t) => {
    const w = t.body.window;
    expect(w.endHour - w.startHour).toBeGreaterThanOrEqual(w.minHours);
    const ids = t.body.conditions.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(t.sourceText.length).toBeGreaterThanOrEqual(3);
    expect(t.sourceText.length).toBeLessThanOrEqual(600);
    expect(`Starter template: ${t.label}`.length).toBeLessThanOrEqual(300);
  });
});

describe("suggestTemplateKey", () => {
  it.each([
    ["Road cycling", "cycling"],
    ["Mountain biking", "cycling"],
    ["Trail running", "running"],
    ["Morning jog", "running"],
    ["Hiking", "hiking"],
    ["Kite surfing", "kite-surfing"],
    ["Kitesurf", "kite-surfing"],
    ["Landscape photography", "photography"],
    ["Laundry", "laundry"],
    ["Drying clothes", "laundry"],
  ])("%s suggests %s", (activity, key) => {
    expect(suggestTemplateKey(activity)).toBe(key);
  });

  it("returns null for an unknown activity", () => {
    expect(suggestTemplateKey("Chess")).toBeNull();
    expect(suggestTemplateKey("")).toBeNull();
  });
});
