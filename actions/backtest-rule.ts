import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import {
  backtestVerdicts,
  changedDays,
  countResults,
  effectiveToday,
  getOwnedSpot,
  getReplayDate,
  getRuleByStatus,
  loadWeather,
  requireEmail,
} from "../server/lib/spots.js";

export default defineAction({
  description:
    "Run the spot's active rule (and pending draft, if any) over the past N days of real weather. Returns per-day verdicts, counts, days the draft would change, and the user's feedback on those days.",
  schema: z.object({
    spotId: z.string().describe("Spot id"),
    days: z.coerce.number().int().min(7).max(40).default(30).describe("How many past days (7-40)"),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ spotId, days }, ctx) => {
    const ownerEmail = requireEmail(ctx);
    const spot = await getOwnedSpot(spotId, ownerEmail);
    const replayDate = await getReplayDate(ownerEmail);
    const [weather, active, draft, notes] = await Promise.all([
      loadWeather(spot, { replay: Boolean(replayDate) }),
      getRuleByStatus(spotId, "active"),
      getRuleByStatus(spotId, "draft"),
      getDb()
        .select({ date: schema.feedback.date, userSays: schema.feedback.userSays, reasonText: schema.feedback.reasonText, status: schema.feedback.status })
        .from(schema.feedback)
        .where(and(eq(schema.feedback.spotId, spotId), eq(schema.feedback.ownerEmail, ownerEmail)))
        .limit(100),
    ]);
    if (!active && !draft) fail("This spot has no rule yet.", { errorCode: "no_rule", statusCode: 409 });
    const today = effectiveToday(weather.timezone, replayDate);
    const activeDays = active ? backtestVerdicts(active.body, weather.hourly, today, days) : null;
    const draftDays = draft ? backtestVerdicts(draft.body, weather.hourly, today, days) : null;
    return {
      today,
      days,
      active: activeDays && { version: active!.version, counts: countResults(activeDays), verdicts: activeDays },
      draft: draftDays && { id: draft!.id, counts: countResults(draftDays), verdicts: draftDays },
      changes: activeDays && draftDays ? changedDays(activeDays, draftDays) : [],
      feedback: notes,
    };
  },
});
