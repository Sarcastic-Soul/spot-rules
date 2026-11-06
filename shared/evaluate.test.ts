import { describe, expect, it } from "vitest";
import { addDays, evaluateDay, evaluateRange, formatCondition } from "./evaluate";
import { METRICS, type Condition, type HourlyWeather, type Metric, type RuleBody } from "./rules";

// 2026-06-01 is a Monday.
const D0 = "2026-06-01";
const D1 = "2026-06-02";

const DEFAULTS: Record<Metric, number> = {
  temperature: 20,
  apparent_temperature: 20,
  precipitation: 0,
  precipitation_probability: 0,
  wind_speed: 10,
  wind_gusts: 20,
  cloud_cover: 20,
  relative_humidity: 50,
  uv_index: 3,
  visibility: 20000,
};

/** 3 days of hourly data starting at D0 (72 hours). */
function makeWeather(
  override?: (date: string, hour: number) => Partial<Record<Metric, number | null>>,
  startDate = D0,
  days = 3,
): HourlyWeather {
  const w = { time: [] } as unknown as HourlyWeather;
  for (const m of METRICS) w[m] = [];
  for (let d = 0; d < days; d++) {
    const date = addDays(startDate, d);
    for (let h = 0; h < 24; h++) {
      w.time.push(`${date}T${String(h).padStart(2, "0")}:00`);
      const o = override?.(date, h) ?? {};
      for (const m of METRICS) {
        w[m].push(m in o ? (o[m] as number | null) : DEFAULTS[m]);
      }
    }
  }
  return w;
}

function cond(p: Partial<Condition> & Pick<Condition, "id" | "metric" | "op" | "value">): Condition {
  return {
    scope: { kind: "window" },
    agg: "max",
    severity: "hard",
    ...p,
  } as Condition;
}

const window = { startHour: 6, endHour: 10, minHours: 2 };

describe("addDays", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("formatCondition", () => {
  it("formats the main shapes", () => {
    expect(
      formatCondition(cond({ id: "a", metric: "wind_gusts", op: "<", value: 35 })),
    ).toBe("Gusts < 35 km/h");
    expect(
      formatCondition(
        cond({
          id: "b",
          metric: "precipitation",
          op: "<=",
          value: 0,
          agg: "sum",
          scope: { kind: "lookback", hours: 24 },
        }),
      ),
    ).toBe("Rain, past 24 h = 0 mm");
    expect(
      formatCondition(cond({ id: "c", metric: "temperature", op: "between", value: [12, 28] })),
    ).toBe("Temp 12–28 °C");
    expect(formatCondition(cond({ id: "d", metric: "uv_index", op: "<", value: 8 }))).toBe(
      "UV < 8",
    );
  });
});

describe("evaluateDay", () => {
  it("returns GO when every condition passes", () => {
    const rule: RuleBody = {
      window,
      conditions: [cond({ id: "c1", metric: "wind_speed", op: "<", value: 25 })],
    };
    const v = evaluateDay(rule, makeWeather(), D0);
    expect(v.result).toBe("GO");
    expect(v.bestStart).toBe("06:00");
    expect(v.bestEnd).toBe("08:00");
    expect(v.conditions).toHaveLength(1);
    expect(v.conditions[0]!).toMatchObject({ pass: true, actual: 10, margin: 15 });
    expect(v.reason).toBe("Best 06:00–08:00 · wind 10 km/h");
  });

  it("returns NO on a hard fail with the failing text", () => {
    const rule: RuleBody = {
      window,
      conditions: [cond({ id: "c1", metric: "wind_gusts", op: "<", value: 35 })],
    };
    const w = makeWeather(() => ({ wind_gusts: 48.26 }));
    const v = evaluateDay(rule, w, D0);
    expect(v.result).toBe("NO");
    expect(v.conditions[0]!.pass).toBe(false);
    expect(v.conditions[0]!.actual).toBe(48.3);
    expect(v.conditions[0]!.margin).toBe(-13.3);
    expect(v.reason).toBe("gusts 48.3 km/h (limit < 35)");
  });

  it("returns MAYBE on a soft fail only", () => {
    const rule: RuleBody = {
      window,
      conditions: [
        cond({ id: "c1", metric: "wind_speed", op: "<", value: 25 }),
        cond({ id: "c2", metric: "cloud_cover", op: "<", value: 10, severity: "soft" }),
      ],
    };
    const v = evaluateDay(rule, makeWeather(), D0);
    expect(v.result).toBe("MAYBE");
    expect(v.reason).toContain("cloud 20 %");
  });

  it("hard fail wins over soft fail", () => {
    const rule: RuleBody = {
      window,
      conditions: [
        cond({ id: "c1", metric: "wind_speed", op: "<", value: 5 }),
        cond({ id: "c2", metric: "cloud_cover", op: "<", value: 10, severity: "soft" }),
      ],
    };
    expect(evaluateDay(rule, makeWeather(), D0).result).toBe("NO");
  });

  it("lookback rain crosses midnight into the previous day", () => {
    const rule: RuleBody = {
      window: { startHour: 6, endHour: 8, minHours: 2 },
      conditions: [
        cond({
          id: "c1",
          metric: "precipitation",
          op: "<=",
          value: 0,
          agg: "sum",
          scope: { kind: "lookback", hours: 24 },
        }),
      ],
    };
    // Rain at 22:00 on D0 only; D1 run at 06:00 looks back to D0 06:00.
    const w = makeWeather((date, h) => (date === D0 && h === 22 ? { precipitation: 2.4 } : {}));
    const v = evaluateDay(rule, w, D1);
    expect(v.result).toBe("NO");
    expect(v.conditions[0]!.actual).toBe(2.4);
    expect(v.reason).toBe("rain 2.4 mm in past 24 h (limit = 0)");
    // D0 06:00 needs 24 h of earlier data that the fixture does not have.
    expect(evaluateDay(rule, w, D0).result).toBe("UNKNOWN"); // no data before D0 00:00
  });

  it("picks the dry run inside the window", () => {
    const rule: RuleBody = {
      window: { startHour: 6, endHour: 12, minHours: 2 },
      conditions: [
        cond({ id: "c1", metric: "precipitation", op: "<=", value: 0, agg: "sum" }),
      ],
    };
    // Rain 6-8 and 8-9 wet; 9..11 dry.
    const w = makeWeather((date, h) =>
      date === D0 && h >= 6 && h <= 8 ? { precipitation: 1 } : {},
    );
    const v = evaluateDay(rule, w, D0);
    expect(v.result).toBe("GO");
    expect(v.bestStart).toBe("09:00");
    expect(v.bestEnd).toBe("11:00");
  });

  it("handles between (inclusive) with margin", () => {
    const rule: RuleBody = {
      window,
      conditions: [cond({ id: "c1", metric: "temperature", op: "between", value: [12, 28] })],
    };
    const ok = evaluateDay(rule, makeWeather(() => ({ temperature: 28 })), D0);
    expect(ok.result).toBe("GO");
    expect(ok.conditions[0]!.margin).toBe(0);
    const cold = evaluateDay(rule, makeWeather(() => ({ temperature: 9.5 })), D0);
    expect(cold.result).toBe("NO");
    expect(cold.conditions[0]!.margin).toBe(-2.5);
    expect(cold.reason).toBe("temp 9.5 °C (limit 12–28)");
  });

  it("skips days outside the weekday filter", () => {
    const rule: RuleBody = {
      window,
      days: [0, 6],
      conditions: [cond({ id: "c1", metric: "wind_speed", op: "<", value: 25 })],
    };
    const v = evaluateDay(rule, makeWeather(), D0); // Monday
    expect(v).toMatchObject({ result: "SKIP", reason: "Not a Monday", conditions: [] });
    expect(v.bestStart).toBeNull();
    expect(evaluateDay({ ...rule, days: [1] }, makeWeather(), D0).result).toBe("GO");
  });

  it("returns UNKNOWN when data is missing or all null", () => {
    const rule: RuleBody = {
      window,
      conditions: [cond({ id: "c1", metric: "wind_speed", op: "<", value: 25 })],
    };
    const missing = evaluateDay(rule, makeWeather(), "2026-07-01");
    expect(missing).toMatchObject({
      result: "UNKNOWN",
      reason: "No weather data for this day",
      bestStart: null,
    });
    const nulls = evaluateDay(rule, makeWeather(() => ({ wind_speed: null })), D0);
    expect(nulls.result).toBe("UNKNOWN");
  });

  it("ignores partial nulls but uses remaining values", () => {
    const rule: RuleBody = {
      window: { startHour: 6, endHour: 8, minHours: 2 },
      conditions: [cond({ id: "c1", metric: "wind_speed", op: "<", value: 25 })],
    };
    const w = makeWeather((_d, h) => (h === 6 ? { wind_speed: null } : {}));
    expect(evaluateDay(rule, w, D0).conditions[0]!.actual).toBe(10);
  });

  it("sum and max aggregate differently", () => {
    const wet = makeWeather((date, h) =>
      date === D0 && (h === 6 || h === 7) ? { precipitation: 0.6 } : {},
    );
    const base = { window: { startHour: 6, endHour: 8, minHours: 2 } };
    const max: RuleBody = {
      ...base,
      conditions: [cond({ id: "c1", metric: "precipitation", op: "<", value: 1, agg: "max" })],
    };
    const sum: RuleBody = {
      ...base,
      conditions: [cond({ id: "c1", metric: "precipitation", op: "<", value: 1, agg: "sum" })],
    };
    expect(evaluateDay(max, wet, D0).result).toBe("GO");
    const s = evaluateDay(sum, wet, D0);
    expect(s.result).toBe("NO");
    expect(s.conditions[0]!.actual).toBe(1.2);
  });

  it("supports min and avg aggregation and >= ops", () => {
    const w = makeWeather((date, h) =>
      date === D0 && h === 6 ? { visibility: 5000 } : date === D0 && h === 7 ? { visibility: 9000 } : {},
    );
    const base = { window: { startHour: 6, endHour: 8, minHours: 2 } };
    const min: RuleBody = {
      ...base,
      conditions: [cond({ id: "c1", metric: "visibility", op: ">=", value: 8000, agg: "min" })],
    };
    const avg: RuleBody = {
      ...base,
      conditions: [cond({ id: "c1", metric: "visibility", op: ">=", value: 7000, agg: "avg" })],
    };
    expect(evaluateDay(min, w, D0).result).toBe("NO");
    expect(evaluateDay(avg, w, D0).result).toBe("GO");
  });

  it("is deterministic", () => {
    const rule: RuleBody = {
      window,
      conditions: [cond({ id: "c1", metric: "wind_speed", op: "<", value: 25 })],
    };
    const w = makeWeather();
    expect(evaluateDay(rule, w, D0)).toEqual(evaluateDay(rule, w, D0));
  });
});

describe("evaluateRange", () => {
  it("returns one verdict per day with consecutive dates", () => {
    const rule: RuleBody = {
      window,
      conditions: [cond({ id: "c1", metric: "wind_speed", op: "<", value: 25 })],
    };
    const out = evaluateRange(rule, makeWeather(), D0, 3);
    expect(out.map((v) => v.date)).toEqual([D0, D1, "2026-06-03"]);
    expect(out.every((v) => v.result === "GO")).toBe(true);
    expect(evaluateRange(rule, makeWeather(), D0, 0)).toEqual([]);
  });
});
