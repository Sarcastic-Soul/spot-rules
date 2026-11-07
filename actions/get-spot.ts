import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { feedbackCheck } from "../shared/feedback-check.js";
import { getDb, schema } from "../server/db/index.js";
import {
  backtestVerdicts,
  changedDays,
  countResults,
  effectiveToday,
  forecastVerdicts,
  getOwnedSpot,
  getReplayDate,
  getRuleByStatus,
  listRuleHistory,
  loadWeather,
  requireEmail,
} from "../server/lib/spots.js";

export default defineAction({
  description:
    "Full detail for one spot: active rule, pending draft (with its effect), 7-day verdicts with per-condition reasons, rule history and open feedback. Refreshes weather when the cache is older than 3 hours.",
  schema: z.object({ id: z.string().describe("Spot id") }),
  http: { method: "GET" },
  link: ({ args }) => ({
    url: buildDeepLink({
      view: "spots",
      to: `/spots/${encodeURIComponent(args.id)}`,
      params: { spotId: args.id },
    }),
    label: "Open spot",
  }),
  run: async ({ id }, ctx) => {
    const ownerEmail = requireEmail(ctx);
    const spot = await getOwnedSpot(id, ownerEmail);
    const replayDate = await getReplayDate(ownerEmail);
    const [weather, active, draft, history, openFeedback] = await Promise.all([
      loadWeather(spot, { replay: Boolean(replayDate) }),
      getRuleByStatus(id, "active"),
      getRuleByStatus(id, "draft"),
      listRuleHistory(id),
      getDb()
        .select({
          id: schema.feedback.id,
          date: schema.feedback.date,
          userSays: schema.feedback.userSays,
          reasonText: schema.feedback.reasonText,
          ruleVersion: schema.feedback.ruleVersion,
          verdict: schema.feedback.verdict,
          status: schema.feedback.status,
          resolvedByVersion: schema.feedback.resolvedByVersion,
        })
        .from(schema.feedback)
        .where(and(eq(schema.feedback.spotId, id), eq(schema.feedback.ownerEmail, ownerEmail)))
        .orderBy(desc(schema.feedback.createdAt))
        .limit(30),
    ]);
    const today = effectiveToday(weather.timezone, replayDate);
    const forecast = active ? forecastVerdicts(active.body, weather.hourly, today) : null;
    let draftEffect = null;
    if (draft) {
      const draftForecast = forecastVerdicts(draft.body, weather.hourly, today);
      const draftPast = backtestVerdicts(draft.body, weather.hourly, today);
      const activePast = active ? backtestVerdicts(active.body, weather.hourly, today) : null;
      draftEffect = {
        forecast: draftForecast,
        forecastChanges: forecast ? changedDays(forecast, draftForecast) : [],
        backtestChanges: activePast ? changedDays(activePast, draftPast) : [],
        backtestCounts: countResults(draftPast),
        feedbackCheck: feedbackCheck(draft.body, active?.body ?? null, weather.hourly, openFeedback),
      };
    }
    return {
      spot: {
        id: spot.id,
        name: spot.name,
        activity: spot.activity,
        lat: spot.lat,
        lon: spot.lon,
        timezone: weather.timezone,
      },
      today,
      replayDate,
      weatherFetchedAt: weather.fetchedAt,
      activeRule: active
        ? { id: active.id, version: active.version, body: active.body, sourceText: active.sourceText, createdBy: active.createdBy }
        : null,
      draft: draft
        ? { id: draft.id, body: draft.body, sourceText: draft.sourceText, reason: draft.reason, feedbackId: draft.feedbackId, effect: draftEffect }
        : null,
      forecast,
      history: history.filter((h) => h.status !== "draft"),
      feedback: openFeedback,
    };
  },
});
