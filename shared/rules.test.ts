import { describe, expect, it } from "vitest";
import { conditionSchema, ruleBodySchema, windowSchema } from "./rules";

const validCondition = {
  id: "c1",
  metric: "wind_speed",
  op: "<",
  value: 20,
  scope: { kind: "window" },
  agg: "max",
  severity: "hard",
};

describe("conditionSchema", () => {
  it("accepts a plain threshold condition", () => {
    expect(conditionSchema.safeParse(validCondition).success).toBe(true);
  });

  it("accepts a lookback scope with hours", () => {
    const r = conditionSchema.safeParse({
      ...validCondition,
      metric: "precipitation",
      scope: { kind: "lookback", hours: 24 },
      agg: "sum",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an unknown metric", () => {
    expect(conditionSchema.safeParse({ ...validCondition, metric: "snow_depth" }).success).toBe(false);
  });

  it("rejects a lookback with no hours or too many hours", () => {
    expect(conditionSchema.safeParse({ ...validCondition, scope: { kind: "lookback" } }).success).toBe(false);
    expect(
      conditionSchema.safeParse({ ...validCondition, scope: { kind: "lookback", hours: 200 } }).success,
    ).toBe(false);
  });

  it("requires a [min, max] pair for between", () => {
    expect(conditionSchema.safeParse({ ...validCondition, op: "between", value: 20 }).success).toBe(false);
    expect(conditionSchema.safeParse({ ...validCondition, op: "between", value: [12, 30] }).success).toBe(true);
  });

  it("rejects a range with min above max", () => {
    expect(conditionSchema.safeParse({ ...validCondition, op: "between", value: [30, 12] }).success).toBe(false);
  });

  it("rejects a range on a non-between operator", () => {
    expect(conditionSchema.safeParse({ ...validCondition, op: "<", value: [1, 2] }).success).toBe(false);
  });

  it("rejects a tuple of the wrong length", () => {
    expect(conditionSchema.safeParse({ ...validCondition, op: "between", value: [1, 2, 3] }).success).toBe(false);
  });
});

describe("windowSchema", () => {
  it("accepts a normal morning window", () => {
    expect(windowSchema.safeParse({ startHour: 6, endHour: 10, minHours: 2 }).success).toBe(true);
  });

  it("rejects a window shorter than minHours", () => {
    expect(windowSchema.safeParse({ startHour: 6, endHour: 7, minHours: 2 }).success).toBe(false);
  });

  it("allows endHour 24 but not startHour 24", () => {
    expect(windowSchema.safeParse({ startHour: 20, endHour: 24, minHours: 2 }).success).toBe(true);
    expect(windowSchema.safeParse({ startHour: 24, endHour: 24, minHours: 1 }).success).toBe(false);
  });
});

describe("ruleBodySchema", () => {
  const window = { startHour: 6, endHour: 10, minHours: 2 };

  it("accepts a rule with a weekday filter", () => {
    const r = ruleBodySchema.safeParse({ window, days: [0, 6], conditions: [validCondition] });
    expect(r.success).toBe(true);
  });

  it("rejects a rule with no conditions", () => {
    expect(ruleBodySchema.safeParse({ window, conditions: [] }).success).toBe(false);
  });

  it("rejects more than 12 conditions", () => {
    const conditions = Array.from({ length: 13 }, (_, i) => ({ ...validCondition, id: `c${i}` }));
    expect(ruleBodySchema.safeParse({ window, conditions }).success).toBe(false);
  });

  it("rejects weekdays outside 0-6", () => {
    expect(ruleBodySchema.safeParse({ window, days: [7], conditions: [validCondition] }).success).toBe(false);
  });
});
