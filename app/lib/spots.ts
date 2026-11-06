import type { Condition, DayVerdict, RuleBody, Verdict } from "@shared/rules";
import { formatCondition } from "@shared/evaluate";

export type { Condition, DayVerdict, RuleBody, Verdict };

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Sat 7" from "YYYY-MM-DD" (calendar math in UTC so the server date is kept). */
export function dayLabel(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()}`;
}

export function longDate(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`;
}

export function shortWindow(v: Pick<DayVerdict, "bestStart" | "bestEnd">) {
  return v.bestStart && v.bestEnd ? `${v.bestStart}–${v.bestEnd}` : "—";
}

export function windowText(body: RuleBody) {
  const w = body.window;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(w.startHour)}–${pad(w.endHour)}, ${w.minHours} h`;
}

export { formatCondition };

function condKey(c: Condition) {
  return `${c.metric}|${c.scope.kind === "lookback" ? `lb${c.scope.hours}` : "w"}`;
}

export type ConditionDiff =
  | { kind: "same"; after: Condition }
  | { kind: "added"; after: Condition }
  | { kind: "removed"; before: Condition }
  | { kind: "changed"; before: Condition; after: Condition };

/** Line-by-line diff between two rule bodies, matched by metric + scope. */
export function diffRules(before: RuleBody | null, after: RuleBody): {
  conditions: ConditionDiff[];
  windowChanged: boolean;
} {
  const prev = new Map((before?.conditions ?? []).map((c) => [condKey(c), c]));
  const out: ConditionDiff[] = [];
  for (const c of after.conditions) {
    const k = condKey(c);
    const b = prev.get(k);
    prev.delete(k);
    if (!b) out.push({ kind: "added", after: c });
    else if (
      formatCondition(b) !== formatCondition(c) ||
      b.severity !== c.severity ||
      b.agg !== c.agg
    )
      out.push({ kind: "changed", before: b, after: c });
    else out.push({ kind: "same", after: c });
  }
  for (const b of prev.values()) out.push({ kind: "removed", before: b });
  return {
    conditions: out,
    windowChanged: !!before && windowText(before) !== windowText(after),
  };
}
