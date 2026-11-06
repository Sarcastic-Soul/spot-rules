import { defineAction, fail } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { ruleBodySchema } from "../shared/rules.js";
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
  loadWeather,
  requireEmail,
} from "../server/lib/spots.js";

export default defineAction({
  description:
    "Save a DRAFT rule for a spot, written from the user's plain-English words (first rule, or a change after feedback). Nothing goes live until the user approves it with decide-rule-draft. Replaces any earlier draft. Returns how the draft would change the next 7 days and the past 30 days.",
  schema: z.object({
    spotId: z.string().describe("Spot id"),
    sourceText: z
      .string()
      .min(3)
      .max(600)
      .describe("The full rule in plain English, as the user would say it (update it to include the change)"),
    body: ruleBodySchema.describe("The typed rule: window, optional weekday filter, conditions"),
    reason: z
      .string()
      .min(3)
      .max(300)
      .describe('Why this draft: e.g. "First rule from your description" or "You said Sunday was fine at gusts 33"'),
    feedbackId: z.string().optional().describe("Feedback id from give-feedback that this change answers"),
  }),
  link: ({ args }) => ({
    url: buildDeepLink({
      view: "spots",
      to: `/spots/${encodeURIComponent(args.spotId)}`,
      params: { spotId: args.spotId },
    }),
    label: "Review the draft",
  }),
  run: async (args, ctx) => {
    const ownerEmail = requireEmail(ctx);
    const spot = await getOwnedSpot(args.spotId, ownerEmail);
    if (args.feedbackId) {
      const [fb] = await getDb()
        .select({ id: schema.feedback.id })
        .from(schema.feedback)
        .where(and(eq(schema.feedback.id, args.feedbackId), eq(schema.feedback.spotId, spot.id)))
        .limit(1);
      if (!fb) fail("feedbackId does not belong to this spot.", { errorCode: "not_found", statusCode: 404 });
    }
    const id = crypto.randomUUID();
    await getDb().transaction(async (tx) => {
      await tx
        .update(schema.rules)
        .set({ status: "rejected", decidedAt: new Date().toISOString(), reason: "Replaced by a newer draft" })
        .where(and(eq(schema.rules.spotId, spot.id), eq(schema.rules.status, "draft")));
      await tx.insert(schema.rules).values({
        id,
        spotId: spot.id,
        version: null,
        body: args.body,
        sourceText: args.sourceText.trim(),
        status: "draft",
        createdBy: "agent",
        reason: args.reason.trim(),
        feedbackId: args.feedbackId ?? null,
        ownerEmail,
      });
    });

    // Effect preview, computed by code so the user can judge the change.
    const replayDate = await getReplayDate(ownerEmail);
    const [weather, active] = await Promise.all([
      loadWeather(spot, { replay: Boolean(replayDate) }).catch(() => null),
      getRuleByStatus(spot.id, "active"),
    ]);
    if (!weather) return { draftId: id, status: "draft", preview: null, note: "Weather unavailable; preview skipped." };
    const today = effectiveToday(weather.timezone, replayDate);
    const draftNext = forecastVerdicts(args.body, weather.hourly, today);
    const draftPast = backtestVerdicts(args.body, weather.hourly, today);
    const activeNext = active ? forecastVerdicts(active.body, weather.hourly, today) : null;
    const activePast = active ? backtestVerdicts(active.body, weather.hourly, today) : null;
    return {
      draftId: id,
      status: "draft",
      preview: {
        next7: draftNext.map((v) => ({ date: v.date, result: v.result, reason: v.reason })),
        next7Changes: activeNext ? changedDays(activeNext, draftNext) : [],
        past30Counts: countResults(draftPast),
        past30Changes: activePast ? changedDays(activePast, draftPast) : [],
      },
      next: "Tell the user the draft is waiting in the panel, summarise the change and its effect, and let them approve or reject it.",
    };
  },
});
