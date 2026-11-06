import { z } from "zod";

/**
 * Typed rule model for Spot Rules. The agent writes rules in this shape; the
 * evaluator (shared/evaluate.ts) decides verdicts with plain code. The model
 * never decides GO / MAYBE / NO.
 */

export const METRICS = [
  "temperature",
  "apparent_temperature",
  "precipitation",
  "precipitation_probability",
  "wind_speed",
  "wind_gusts",
  "cloud_cover",
  "relative_humidity",
  "uv_index",
  "visibility",
] as const;

export type Metric = (typeof METRICS)[number];

/** Display unit for each metric. Data from Open-Meteo is requested in these units. */
export const METRIC_UNITS: Record<Metric, string> = {
  temperature: "°C",
  apparent_temperature: "°C",
  precipitation: "mm",
  precipitation_probability: "%",
  wind_speed: "km/h",
  wind_gusts: "km/h",
  cloud_cover: "%",
  relative_humidity: "%",
  uv_index: "",
  visibility: "m",
};

export const METRIC_LABELS: Record<Metric, string> = {
  temperature: "Temp",
  apparent_temperature: "Feels like",
  precipitation: "Rain",
  precipitation_probability: "Rain chance",
  wind_speed: "Wind",
  wind_gusts: "Gusts",
  cloud_cover: "Cloud",
  relative_humidity: "Humidity",
  uv_index: "UV",
  visibility: "Visibility",
};

export const conditionSchema = z.object({
  id: z.string().min(1).describe("Stable id for this condition, e.g. 'c1'"),
  metric: z.enum(METRICS).describe("Weather metric to check"),
  op: z
    .enum(["<", "<=", ">", ">=", "between"])
    .describe("Comparison. 'between' needs value as [min, max] inclusive"),
  value: z
    .union([z.number(), z.array(z.number()).length(2)])
    .describe("Threshold in the metric's unit (°C, mm, km/h, %, m)"),
  scope: z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("window") }),
      z.object({
        kind: z.literal("lookback"),
        hours: z.number().int().min(1).max(96),
      }),
    ])
    .describe(
      "'window' = during the activity hours; 'lookback' = the N hours before the activity starts (e.g. rain in the past 24h)",
    ),
  agg: z
    .enum(["max", "min", "sum", "avg"])
    .describe(
      "How hourly values combine: max/min/avg, or sum (use sum for rain totals)",
    ),
  severity: z
    .enum(["hard", "soft"])
    .describe("hard fail = NO, soft fail = MAYBE"),
  note: z
    .string()
    .optional()
    .describe("The user's own words this condition came from"),
}).describe(
  "A test a GOOD day must pass (passes when true). Write the bad case the other way round: 'if cloud is over 80% call it maybe' = cloud_cover <= 80 soft; 'not above 32' = <= 32.",
).superRefine((c, ctx) => {
  const isRange = Array.isArray(c.value);
  if (c.op === "between" && !isRange)
    ctx.addIssue({ code: "custom", message: "op 'between' needs value [min, max]" });
  if (c.op !== "between" && isRange)
    ctx.addIssue({ code: "custom", message: `op '${c.op}' needs a single number value` });
  if (isRange && (c.value as [number, number])[0] > (c.value as [number, number])[1])
    ctx.addIssue({ code: "custom", message: "between needs min <= max" });
});

export type Condition = z.infer<typeof conditionSchema>;

export const windowSchema = z
  .object({
    startHour: z.number().int().min(0).max(23).describe("Earliest start, local hour 0-23"),
    endHour: z
      .number()
      .int()
      .min(1)
      .max(24)
      .describe(
        "Hour the activity must be finished by, local 1-24 (exclusive). 'Start between 6 and 10, 4 hours' = endHour 14",
      ),
    minHours: z
      .number()
      .int()
      .min(1)
      .max(24)
      .describe("How many hours the activity takes"),
  })
  .refine((w) => w.endHour - w.startHour >= w.minHours, {
    message: "endHour - startHour must be at least minHours",
  });

export type RuleWindow = z.infer<typeof windowSchema>;

export const ruleBodySchema = z.object({
  window: windowSchema,
  days: z
    .array(z.number().int().min(0).max(6))
    .optional()
    .describe("Optional weekday filter, 0 = Sunday ... 6 = Saturday"),
  conditions: z.array(conditionSchema).min(1).max(12),
});

export type RuleBody = z.infer<typeof ruleBodySchema>;

/** Hourly weather in the spot's local time. All arrays align with `time`. */
export type HourlyWeather = {
  /** Local time strings "YYYY-MM-DDTHH:00" from Open-Meteo with timezone=auto */
  time: string[];
} & { [M in Metric]: (number | null)[] };

export type Verdict = "GO" | "MAYBE" | "NO" | "SKIP" | "UNKNOWN";

export type ConditionResult = {
  id: string;
  metric: Metric;
  pass: boolean;
  severity: "hard" | "soft";
  /** Aggregated value actually seen; null when data missing */
  actual: number | null;
  /** How far from failing (positive = room to spare), in the metric's unit */
  margin: number | null;
  /** Short human text, e.g. "gusts 33 km/h (limit 35)" */
  text: string;
};

export type DayVerdict = {
  date: string; // YYYY-MM-DD local
  result: Verdict;
  /** Best run start/end, local "HH:00"; null when no run */
  bestStart: string | null;
  bestEnd: string | null;
  /** Condition results for the best run */
  conditions: ConditionResult[];
  /** One short line: the main reason for the verdict */
  reason: string;
};
