import { describe, expect, it } from "vitest";
import { addDays } from "./evaluate";
import { feedbackCheck, FEEDBACK_CHECK_LIMIT } from "./feedback-check";
import { METRICS, type HourlyWeather, type Metric, type RuleBody } from "./rules";

const D0 = "2026-06-01";

function makeWeather(wind: (date: string) => number, days = 3): HourlyWeather {
  const w = { time: [] } as unknown as HourlyWeather;
  for (const m of METRICS) w[m] = [];
  for (let d = 0; d < days; d++) {
    const date = addDays(D0, d);
    for (let h = 0; h < 24; h++) {
      w.time.push(`${date}T${String(h).padStart(2, "0")}:00`);
      for (const m of METRICS) {
        w[m].push(m === ("wind_speed" as Metric) ? wind(date) : 10);
      }
    }
  }
  return w;
}

function windRule(limit: number): RuleBody {
  return {
    window: { startHour: 6, endHour: 10, minHours: 2 },
    conditions: [
      {
        id: "c1",
        metric: "wind_speed",
        op: "<",
        value: limit,
        scope: { kind: "window" },
        agg: "max",
        severity: "hard",
      },
    ],
  };
}

// D0 wind 30, D0+1 wind 15
const weather = makeWeather((date) => (date === D0 ? 30 : 15));

describe("feedbackCheck", () => {
  it("fixes a day the active rule got wrong", () => {
    const rows = feedbackCheck(windRule(35), windRule(25), weather, [
      { id: "f1", date: D0, userSays: "GO" },
    ]);
    expect(rows).toEqual([
      {
        feedbackId: "f1",
        date: D0,
        userSays: "GO",
        before: "NO",
        after: "GO",
        matches: true,
        wasMatching: false,
      },
    ]);
  });

  it("still matches when both rules agree with the user", () => {
    const [row] = feedbackCheck(windRule(40), windRule(35), weather, [
      { id: "f1", date: D0, userSays: "GO" },
    ]);
    expect(row).toMatchObject({ before: "GO", after: "GO", matches: true, wasMatching: true });
  });

  it("breaks a day the active rule had right", () => {
    const [row] = feedbackCheck(windRule(20), windRule(35), weather, [
      { id: "f1", date: D0, userSays: "GO" },
    ]);
    expect(row).toMatchObject({ before: "GO", after: "NO", matches: false, wasMatching: true });
  });

  it("still wrong when neither rule agrees with the user", () => {
    const [row] = feedbackCheck(windRule(20), windRule(25), weather, [
      { id: "f1", date: D0, userSays: "GO" },
    ]);
    expect(row).toMatchObject({ before: "NO", after: "NO", matches: false, wasMatching: false });
  });

  it("has before null and wasMatching null without an active rule", () => {
    const [row] = feedbackCheck(windRule(35), null, weather, [
      { id: "f1", date: D0, userSays: "GO" },
    ]);
    expect(row).toMatchObject({ before: null, after: "GO", matches: true, wasMatching: null });
  });

  it("reports UNKNOWN for a day outside the weather data", () => {
    const [row] = feedbackCheck(windRule(35), windRule(25), weather, [
      { id: "f1", date: "2026-01-01", userSays: "GO" },
    ]);
    expect(row).toMatchObject({
      before: "UNKNOWN",
      after: "UNKNOWN",
      matches: false,
      wasMatching: false,
    });
  });

  it("keeps order and caps rows at the limit", () => {
    const many = Array.from({ length: FEEDBACK_CHECK_LIMIT + 5 }, (_, i) => ({
      id: `f${i}`,
      date: addDays(D0, -i),
      userSays: "GO" as const,
    }));
    const rows = feedbackCheck(windRule(35), windRule(25), weather, many);
    expect(rows).toHaveLength(FEEDBACK_CHECK_LIMIT);
    expect(rows[0]!.feedbackId).toBe("f0");
    expect(rows[1]!.feedbackId).toBe("f1");
  });

  it("counts only the newest note when a day has several", () => {
    const rows = feedbackCheck(windRule(35), windRule(25), weather, [
      { id: "new", date: D0, userSays: "GO" },
      { id: "old", date: D0, userSays: "NO" },
      { id: "other", date: addDays(D0, 1), userSays: "GO" },
    ]);
    expect(rows.map((r) => r.feedbackId)).toEqual(["new", "other"]);
  });
});
