import {
  METRIC_LABELS,
  METRIC_UNITS,
  type Condition,
  type ConditionResult,
  type DayVerdict,
  type HourlyWeather,
  type RuleBody,
} from "./rules";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const pad2 = (n: number) => String(n).padStart(2, "0");

function parseDate(date: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Invalid date "${date}", expected YYYY-MM-DD`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Add n days (can be negative) to a YYYY-MM-DD string. UTC math, no local TZ. */
export function addDays(date: string, n: number): string {
  const d = new Date(parseDate(date) + n * 86_400_000);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function weekdayOf(date: string): number {
  return new Date(parseDate(date)).getUTCDay();
}

/** Local time key for `hourOffset` hours after midnight of `date` (offset may be negative or >= 24). */
function timeKey(date: string, hourOffset: number): string {
  const dayShift = Math.floor(hourOffset / 24);
  const hour = hourOffset - dayShift * 24;
  return `${addDays(date, dayShift)}T${pad2(hour)}:00`;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const fmtNum = (n: number) => String(round1(n));
const hhmm = (h: number) => `${pad2(h)}:00`;

function isZeroCap(c: Condition): boolean {
  return c.op === "<=" && c.value === 0;
}

function limitText(c: Condition): string {
  if (c.op === "between") {
    const [a, b] = toRange(c.value);
    return `${fmtNum(a)}–${fmtNum(b)}`;
  }
  const v = toNumber(c.value);
  if (isZeroCap(c)) return `= ${fmtNum(v)}`;
  return `${c.op} ${fmtNum(v)}`;
}

function toNumber(v: Condition["value"]): number {
  return Array.isArray(v) ? (v[0] ?? 0) : v;
}

function toRange(v: Condition["value"]): [number, number] {
  return Array.isArray(v) ? [v[0] ?? 0, v[1] ?? 0] : [v, v];
}

function withUnit(num: string, unit: string): string {
  return unit ? `${num} ${unit}` : num;
}

/** e.g. "Gusts < 35 km/h", "Rain, past 24 h = 0 mm", "Temp 12–28 °C" */
export function formatCondition(c: Condition): string {
  const label = METRIC_LABELS[c.metric];
  const unit = METRIC_UNITS[c.metric];
  const scope = c.scope.kind === "lookback" ? `, past ${c.scope.hours} h` : "";
  if (c.op === "between") {
    const [a, b] = toRange(c.value);
    return `${label}${scope} ${withUnit(`${fmtNum(a)}–${fmtNum(b)}`, unit)}`;
  }
  const v = fmtNum(toNumber(c.value));
  const opText = isZeroCap(c) ? "=" : c.op;
  return `${label}${scope} ${opText} ${withUnit(v, unit)}`;
}

function compare(c: Condition, actual: number): { pass: boolean; margin: number } {
  if (c.op === "between") {
    const [a, b] = toRange(c.value);
    return {
      pass: actual >= a && actual <= b,
      margin: Math.min(actual - a, b - actual),
    };
  }
  const v = toNumber(c.value);
  switch (c.op) {
    case "<":
      return { pass: actual < v, margin: v - actual };
    case "<=":
      return { pass: actual <= v, margin: v - actual };
    case ">":
      return { pass: actual > v, margin: actual - v };
    default:
      return { pass: actual >= v, margin: actual - v };
  }
}

function aggregate(values: number[], agg: Condition["agg"]): number {
  switch (agg) {
    case "max":
      return Math.max(...values);
    case "min":
      return Math.min(...values);
    case "sum":
      return values.reduce((s, x) => s + x, 0);
    default:
      return values.reduce((s, x) => s + x, 0) / values.length;
  }
}

type Evaluated = ConditionResult & { short: string };

type Run = {
  start: number;
  hardFails: number;
  softFails: number;
  results: Evaluated[];
};

function evaluateRun(
  rule: RuleBody,
  weather: HourlyWeather,
  index: Map<string, number>,
  date: string,
  start: number,
): Run | null {
  const results: Evaluated[] = [];
  for (const c of rule.conditions) {
    let from: number;
    let to: number; // exclusive
    if (c.scope.kind === "window") {
      from = start;
      to = start + rule.window.minHours;
    } else {
      from = start - c.scope.hours;
      to = start;
    }
    const series = weather[c.metric];
    const values: number[] = [];
    for (let h = from; h < to; h++) {
      const i = index.get(timeKey(date, h));
      if (i === undefined) return null;
      const v = series[i];
      if (v !== null && v !== undefined && Number.isFinite(v)) values.push(v);
    }
    if (values.length === 0) return null;

    const raw = aggregate(values, c.agg);
    const { pass, margin } = compare(c, raw);
    const actual = round1(raw);
    const label = METRIC_LABELS[c.metric].toLowerCase();
    const unit = METRIC_UNITS[c.metric];
    const where = c.scope.kind === "lookback" ? ` in past ${c.scope.hours} h` : "";
    const short = `${label} ${withUnit(fmtNum(actual), unit)}${where}`;
    results.push({
      id: c.id,
      metric: c.metric,
      pass,
      severity: c.severity,
      actual,
      margin: round1(margin),
      text: `${short} (limit ${limitText(c)})`,
      short,
    });
  }
  return {
    start,
    hardFails: results.filter((r) => !r.pass && r.severity === "hard").length,
    softFails: results.filter((r) => !r.pass && r.severity === "soft").length,
    results,
  };
}

function strip(r: Evaluated): ConditionResult {
  const { short: _short, ...rest } = r;
  return rest;
}

export function evaluateDay(
  rule: RuleBody,
  weather: HourlyWeather,
  date: string,
): DayVerdict {
  const weekday = weekdayOf(date);
  if (rule.days && rule.days.length > 0 && !rule.days.includes(weekday)) {
    return {
      date,
      result: "SKIP",
      bestStart: null,
      bestEnd: null,
      conditions: [],
      reason: `Not a ${WEEKDAYS[weekday]}`,
    };
  }

  const index = new Map<string, number>();
  weather.time.forEach((t, i) => index.set(t, i));

  const { startHour, endHour, minHours } = rule.window;
  let best: Run | null = null;
  for (let h = startHour; h <= endHour - minHours; h++) {
    const run = evaluateRun(rule, weather, index, date, h);
    if (!run) continue;
    if (
      !best ||
      run.hardFails < best.hardFails ||
      (run.hardFails === best.hardFails && run.softFails < best.softFails)
    ) {
      best = run;
    }
  }

  if (!best) {
    return {
      date,
      result: "UNKNOWN",
      bestStart: null,
      bestEnd: null,
      conditions: [],
      reason: "No weather data for this day",
    };
  }

  const result = best.hardFails > 0 ? "NO" : best.softFails > 0 ? "MAYBE" : "GO";
  const bestStart = hhmm(best.start);
  const bestEnd = hhmm(best.start + minHours);

  let reason: string;
  if (result === "GO") {
    const tight = best.results.reduce((a, b) =>
      (b.margin ?? Infinity) < (a.margin ?? Infinity) ? b : a,
    );
    reason = `Best ${bestStart}–${bestEnd} · ${tight.short}`;
  } else {
    const wanted = result === "NO" ? "hard" : "soft";
    const fails = best.results.filter((r) => !r.pass && r.severity === wanted);
    const worst = fails.reduce((a, b) =>
      (b.margin ?? Infinity) < (a.margin ?? Infinity) ? b : a,
    );
    reason = worst.text;
  }

  return {
    date,
    result,
    bestStart,
    bestEnd,
    conditions: best.results.map(strip),
    reason,
  };
}

export function evaluateRange(
  rule: RuleBody,
  weather: HourlyWeather,
  startDate: string,
  days: number,
): DayVerdict[] {
  const out: DayVerdict[] = [];
  for (let i = 0; i < days; i++) {
    out.push(evaluateDay(rule, weather, addDays(startDate, i)));
  }
  return out;
}
