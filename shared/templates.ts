import type { RuleBody } from "./rules";

export type TemplateKey = "cycling" | "running" | "hiking" | "kite-surfing" | "photography" | "laundry";

export type RuleTemplate = {
  key: TemplateKey;
  label: string;
  sourceText: string;
  body: RuleBody;
};

export const TEMPLATES: RuleTemplate[] = [
  {
    key: "cycling",
    label: "Cycling",
    sourceText:
      "Good ride: no rain in the 12 hours before and dry during, wind under 20 km/h, gusts under 35 km/h, start between 6 and 9 am for 2 hours, feels like under 32 °C.",
    body: {
      window: { startHour: 6, endHour: 11, minHours: 2 },
      conditions: [
        { id: "c1", metric: "precipitation", op: "<=", value: 0.2, scope: { kind: "lookback", hours: 12 }, agg: "sum", severity: "hard", note: "no rain in the 12 hours before" },
        { id: "c2", metric: "precipitation", op: "<=", value: 0.5, scope: { kind: "window" }, agg: "sum", severity: "hard", note: "dry during the ride" },
        { id: "c3", metric: "wind_speed", op: "<", value: 20, scope: { kind: "window" }, agg: "max", severity: "hard", note: "wind under 20 km/h" },
        { id: "c4", metric: "wind_gusts", op: "<", value: 35, scope: { kind: "window" }, agg: "max", severity: "soft", note: "gusts under 35 km/h" },
        { id: "c5", metric: "apparent_temperature", op: "<=", value: 32, scope: { kind: "window" }, agg: "max", severity: "soft", note: "feels like under 32 °C" },
      ],
    },
  },
  {
    key: "running",
    label: "Running",
    sourceText: "Good run: start between 5 and 8 am for 1 hour, feels like under 28 °C, rain chance under 40 percent, wind under 25 km/h.",
    body: {
      window: { startHour: 5, endHour: 9, minHours: 1 },
      conditions: [
        { id: "c1", metric: "precipitation_probability", op: "<", value: 40, scope: { kind: "window" }, agg: "max", severity: "hard", note: "rain chance under 40 percent" },
        { id: "c2", metric: "apparent_temperature", op: "<", value: 28, scope: { kind: "window" }, agg: "max", severity: "soft", note: "feels like under 28 °C" },
        { id: "c3", metric: "wind_speed", op: "<", value: 25, scope: { kind: "window" }, agg: "max", severity: "soft", note: "wind under 25 km/h" },
      ],
    },
  },
  {
    key: "hiking",
    label: "Hiking",
    sourceText:
      "Good hike: 6 am to 2 pm for 5 hours, less than 2 mm rain during the hike, no more than 10 mm in the 48 hours before, visibility over 5 km, gusts under 40 km/h.",
    body: {
      window: { startHour: 6, endHour: 14, minHours: 5 },
      conditions: [
        { id: "c1", metric: "precipitation", op: "<", value: 2, scope: { kind: "window" }, agg: "sum", severity: "hard", note: "less than 2 mm rain during the hike" },
        { id: "c2", metric: "precipitation", op: "<=", value: 10, scope: { kind: "lookback", hours: 48 }, agg: "sum", severity: "soft", note: "no more than 10 mm in the 48 hours before" },
        { id: "c3", metric: "visibility", op: ">", value: 5000, scope: { kind: "window" }, agg: "min", severity: "hard", note: "visibility over 5 km" },
        { id: "c4", metric: "wind_gusts", op: "<", value: 40, scope: { kind: "window" }, agg: "max", severity: "soft", note: "gusts under 40 km/h" },
      ],
    },
  },
  {
    key: "kite-surfing",
    label: "Kite surfing",
    sourceText:
      "Good kite session: 10 am to 6 pm for 3 hours, wind between 18 and 30 km/h, gusts under 40 km/h, little rain, warmer than 18 °C.",
    body: {
      window: { startHour: 10, endHour: 18, minHours: 3 },
      conditions: [
        { id: "c1", metric: "wind_speed", op: "between", value: [18, 30], scope: { kind: "window" }, agg: "avg", severity: "hard", note: "wind between 18 and 30 km/h" },
        { id: "c2", metric: "wind_gusts", op: "<", value: 40, scope: { kind: "window" }, agg: "max", severity: "soft", note: "gusts under 40 km/h" },
        { id: "c3", metric: "precipitation", op: "<=", value: 1, scope: { kind: "window" }, agg: "sum", severity: "soft", note: "little rain" },
        { id: "c4", metric: "temperature", op: ">", value: 18, scope: { kind: "window" }, agg: "avg", severity: "soft", note: "warmer than 18 °C" },
      ],
    },
  },
  {
    key: "photography",
    label: "Photography",
    sourceText:
      "Good photo morning: golden hour, from an hour before sunrise to two hours after, no rain, cloud cover between 20 and 70 percent for good light, visibility over 8 km, wind under 25 km/h.",
    body: {
      window: { startHour: 5, endHour: 8, minHours: 2, anchor: { to: "sunrise", startOffset: -1, endOffset: 2 } },
      conditions: [
        { id: "c1", metric: "precipitation", op: "<=", value: 0.2, scope: { kind: "window" }, agg: "sum", severity: "hard", note: "no rain" },
        { id: "c2", metric: "cloud_cover", op: "between", value: [20, 70], scope: { kind: "window" }, agg: "avg", severity: "soft", note: "cloud cover between 20 and 70 percent" },
        { id: "c3", metric: "visibility", op: ">", value: 8000, scope: { kind: "window" }, agg: "min", severity: "hard", note: "visibility over 8 km" },
        { id: "c4", metric: "wind_speed", op: "<", value: 25, scope: { kind: "window" }, agg: "max", severity: "soft", note: "wind under 25 km/h" },
      ],
    },
  },
  {
    key: "laundry",
    label: "Laundry",
    sourceText:
      "Good drying day: 9 am to 5 pm for 6 hours, no rain, rain chance under 30 percent, humidity under 70 percent, warmer than 15 °C, a breeze over 8 km/h.",
    body: {
      window: { startHour: 9, endHour: 17, minHours: 6 },
      conditions: [
        { id: "c1", metric: "precipitation", op: "<=", value: 0.1, scope: { kind: "window" }, agg: "sum", severity: "hard", note: "no rain" },
        { id: "c2", metric: "precipitation_probability", op: "<", value: 30, scope: { kind: "window" }, agg: "max", severity: "hard", note: "rain chance under 30 percent" },
        { id: "c3", metric: "relative_humidity", op: "<", value: 70, scope: { kind: "window" }, agg: "avg", severity: "soft", note: "humidity under 70 percent" },
        { id: "c4", metric: "temperature", op: ">", value: 15, scope: { kind: "window" }, agg: "avg", severity: "soft", note: "warmer than 15 °C" },
        { id: "c5", metric: "wind_speed", op: ">", value: 8, scope: { kind: "window" }, agg: "avg", severity: "soft", note: "a breeze over 8 km/h" },
      ],
    },
  },
];

const KEYWORDS: [TemplateKey, RegExp][] = [
  ["cycling", /\b(cycl|bik|bicycl|ride|riding|mtb|gravel)/],
  ["running", /\b(run|jog)/],
  ["kite-surfing", /\b(kite|kitesurf|windsurf)/],
  ["hiking", /\b(hik|trek|walk|trail|climb)/],
  ["photography", /\b(photo|camera|astro|sunrise|sunset)/],
  ["laundry", /\b(laundry|washing|clothes|drying|dry)\b/],
];

export function suggestTemplateKey(activity: string): TemplateKey | null {
  const text = activity.toLowerCase();
  for (const [key, re] of KEYWORDS) if (re.test(text)) return key;
  return null;
}
