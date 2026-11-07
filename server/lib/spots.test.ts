import { describe, expect, it, vi } from "vitest";

vi.mock("../db/index.js", () => ({
  getDb: () => {
    throw new Error("database is not available in unit tests");
  },
  schema: {},
}));

import { addDays } from "../../shared/evaluate";
import {
  METRICS,
  type ConditionResult,
  type DayVerdict,
  type HourlyWeather,
  type RuleBody,
  type Verdict,
} from "../../shared/rules";
import {
  backtestVerdicts,
  changedDays,
  countResults,
  coversPastDays,
  pastDaysNeeded,
  rankSpots,
  todayIn,
  verdictMargin,
  WEATHER_PAST_DAYS,
  windowIsOver,
  type SpotComparison,
} from "./spots";

function verdict(date: string, result: Verdict, extra: Partial<DayVerdict> = {}): DayVerdict {
  return { date, result, bestStart: null, bestEnd: null, conditions: [], reason: "", ...extra };
}

function weatherFrom(startDate: string, days: number): HourlyWeather {
  const w = { time: [] } as unknown as HourlyWeather;
  for (const m of METRICS) w[m] = [];
  for (let d = 0; d < days; d++) {
    for (let h = 0; h < 24; h++) {
      w.time.push(`${addDays(startDate, d)}T${String(h).padStart(2, "0")}:00`);
      for (const m of METRICS) w[m].push(1);
    }
  }
  return w;
}

describe("todayIn", () => {
  const now = new Date("2026-11-07T20:00:00Z");

  it("uses the local date of the timezone", () => {
    expect(todayIn("UTC", now)).toBe("2026-11-07");
    expect(todayIn("Asia/Kolkata", now)).toBe("2026-11-08");
    expect(todayIn("America/Los_Angeles", now)).toBe("2026-11-07");
  });

  it("falls back to UTC for a missing or invalid timezone", () => {
    expect(todayIn(null, now)).toBe("2026-11-07");
    expect(todayIn("Not/AZone", now)).toBe("2026-11-07");
  });
});

describe("countResults", () => {
  it("counts each result", () => {
    const counts = countResults([
      verdict("2026-06-01", "GO"),
      verdict("2026-06-02", "GO"),
      verdict("2026-06-03", "NO"),
      verdict("2026-06-04", "SKIP"),
      verdict("2026-06-05", "UNKNOWN"),
    ]);
    expect(counts).toEqual({ GO: 2, MAYBE: 0, NO: 1, SKIP: 1, UNKNOWN: 1 });
  });
});

describe("changedDays", () => {
  it("lists only days whose result differs", () => {
    const before = [verdict("2026-06-01", "NO"), verdict("2026-06-02", "GO")];
    const after = [verdict("2026-06-01", "GO"), verdict("2026-06-02", "GO")];
    expect(changedDays(before, after)).toEqual([{ date: "2026-06-01", from: "NO", to: "GO" }]);
  });

  it("ignores dates missing from the first run", () => {
    expect(changedDays([verdict("2026-06-01", "GO")], [verdict("2026-06-02", "NO")])).toEqual([]);
  });
});

describe("backtestVerdicts", () => {
  it("returns 30 consecutive dates ending the day before today", () => {
    const rule: RuleBody = {
      window: { startHour: 6, endHour: 10, minHours: 2 },
      conditions: [
        {
          id: "c1",
          metric: "wind_speed",
          op: "<",
          value: 25,
          scope: { kind: "window" },
          agg: "max",
          severity: "hard",
        },
      ],
    };
    const today = "2026-06-20";
    const out = backtestVerdicts(rule, weatherFrom("2026-05-01", 60), today);
    expect(out).toHaveLength(30);
    expect(out[0]!.date).toBe("2026-05-21");
    expect(out[29]!.date).toBe("2026-06-19");
    out.forEach((v, i) => {
      if (i > 0) expect(v.date).toBe(addDays(out[i - 1]!.date, 1));
    });
  });
});

describe("weather coverage", () => {
  const today = "2026-11-07";

  it("needs 34 past days live and 69 in replay", () => {
    expect(pastDaysNeeded(false)).toBe(34);
    expect(pastDaysNeeded(true)).toBe(69);
    expect(WEATHER_PAST_DAYS).toBeGreaterThanOrEqual(pastDaysNeeded(true));
    expect(WEATHER_PAST_DAYS).toBeLessThanOrEqual(92);
  });

  it("is covered when the series starts on or before the needed day", () => {
    expect(coversPastDays(weatherFrom(addDays(today, -70), 2), 69, today)).toBe(true);
    expect(coversPastDays(weatherFrom(addDays(today, -69), 2), 69, today)).toBe(true);
  });

  it("is not covered by the old 45 day cache in replay", () => {
    const old = weatherFrom(addDays(today, -45), 2);
    expect(coversPastDays(old, pastDaysNeeded(true), today)).toBe(false);
    expect(coversPastDays(old, pastDaysNeeded(false), today)).toBe(true);
  });

  it("is not covered by an empty series", () => {
    expect(coversPastDays({ time: [] }, 1, today)).toBe(false);
  });
});

describe("windowIsOver", () => {
  const v = { bestEnd: "10:00" };

  it("is false before the window ends and true after", () => {
    expect(windowIsOver(v, "UTC", new Date("2026-11-07T09:59:00Z"))).toBe(false);
    expect(windowIsOver(v, "UTC", new Date("2026-11-07T10:00:00Z"))).toBe(true);
    expect(windowIsOver(v, "UTC", new Date("2026-11-07T23:30:00Z"))).toBe(true);
  });

  it("uses the spot's local time", () => {
    const now = new Date("2026-11-07T05:00:00Z");
    expect(windowIsOver(v, "UTC", now)).toBe(false);
    expect(windowIsOver(v, "Asia/Kolkata", now)).toBe(true);
  });

  it("is false when there is no best window", () => {
    expect(windowIsOver({ bestEnd: null }, "UTC", new Date("2026-11-07T23:00:00Z"))).toBe(false);
  });

  it("handles midnight in the local timezone", () => {
    expect(windowIsOver(v, "UTC", new Date("2026-11-07T00:15:00Z"))).toBe(false);
  });
});

describe("rankSpots", () => {
  const spot = (
    name: string,
    result: Verdict,
    margin: number | null,
  ): SpotComparison => ({
    spotId: name,
    name,
    activity: "ride",
    date: "2026-11-08",
    result,
    bestStart: null,
    bestEnd: null,
    reason: "",
    margin,
  });

  it("orders GO > MAYBE > NO > SKIP > UNKNOWN", () => {
    const out = rankSpots([
      spot("u", "UNKNOWN", null),
      spot("s", "SKIP", null),
      spot("n", "NO", -3),
      spot("m", "MAYBE", 1),
      spot("g", "GO", 2),
    ]);
    expect(out.map((s) => s.name)).toEqual(["g", "m", "n", "s", "u"]);
  });

  it("breaks ties by the larger margin, null last, then by name", () => {
    const out = rankSpots([
      spot("b", "GO", 4),
      spot("a", "GO", 9),
      spot("c", "GO", null),
      spot("d", "GO", 4),
    ]);
    expect(out.map((s) => s.name)).toEqual(["a", "b", "d", "c"]);
  });

  it("does not change the input array", () => {
    const input = [spot("x", "NO", 0), spot("y", "GO", 0)];
    rankSpots(input);
    expect(input.map((s) => s.name)).toEqual(["x", "y"]);
  });
});

describe("verdictMargin", () => {
  const cond = (margin: number | null): ConditionResult => ({
    id: "c",
    metric: "wind_speed",
    pass: true,
    severity: "hard",
    actual: 1,
    margin,
    text: "",
  });

  it("returns the smallest condition margin", () => {
    expect(verdictMargin(verdict("2026-06-01", "GO", { conditions: [cond(5), cond(2.5), cond(8)] }))).toBe(2.5);
  });

  it("returns null without conditions", () => {
    expect(verdictMargin(verdict("2026-06-01", "SKIP"))).toBeNull();
  });
});
