import { evaluateDay } from "./evaluate";
import type { HourlyWeather, RuleBody, Verdict } from "./rules";

export type FeedbackRow = {
  id: string;
  date: string;
  userSays: "GO" | "MAYBE" | "NO";
};

export type FeedbackCheckRow = {
  feedbackId: string;
  date: string;
  userSays: "GO" | "MAYBE" | "NO";
  before: string | null;
  after: string;
  matches: boolean;
  wasMatching: boolean | null;
};

export const FEEDBACK_CHECK_LIMIT = 30;

/**
 * Runs the draft rule (and the active rule, when there is one) on every day the
 * user gave feedback on. `feedback` should be newest first; when a day has more
 * than one note, only the newest counts.
 */
export function feedbackCheck(
  draft: RuleBody,
  active: RuleBody | null,
  weather: HourlyWeather,
  feedback: FeedbackRow[],
): FeedbackCheckRow[] {
  const seen = new Set<string>();
  const latestPerDay = feedback.filter((row) => {
    if (seen.has(row.date)) return false;
    seen.add(row.date);
    return true;
  });
  return latestPerDay.slice(0, FEEDBACK_CHECK_LIMIT).map((row) => {
    const after: Verdict = evaluateDay(draft, weather, row.date).result;
    const before: Verdict | null = active
      ? evaluateDay(active, weather, row.date).result
      : null;
    return {
      feedbackId: row.id,
      date: row.date,
      userSays: row.userSays,
      before,
      after,
      matches: after === row.userSays,
      wasMatching: before === null ? null : before === row.userSays,
    };
  });
}
