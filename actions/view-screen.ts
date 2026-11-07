import { defineAction } from "@agent-native/core/action";
import { readAppState } from "@agent-native/core/application-state";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { evaluateDay } from "../shared/evaluate.js";
import { getDb, schema } from "../server/db/index.js";
import {
  backtestVerdicts,
  changedDays,
  effectiveToday,
  forecastVerdicts,
  getOwnedSpot,
  getReplayDate,
  getRuleByStatus,
  loadWeather,
  requireEmail,
} from "../server/lib/spots.js";

async function spotsSection(
  spotId: string,
  day: string | undefined,
  ownerEmail: string,
): Promise<Record<string, unknown>> {
  let spot: Awaited<ReturnType<typeof getOwnedSpot>>;
  try {
    spot = await getOwnedSpot(spotId, ownerEmail);
  } catch (error) {
    if ((error as { errorCode?: string })?.errorCode === "not_found") {
      return { note: "The spot on screen was not found (deleted, or not yours)." };
    }
    throw error;
  }

  const replayDate = await getReplayDate(ownerEmail);
  const [active, draft, openFeedback, weather] = await Promise.all([
    getRuleByStatus(spot.id, "active"),
    getRuleByStatus(spot.id, "draft"),
    getDb()
      .select({
        id: schema.feedback.id,
        date: schema.feedback.date,
        userSays: schema.feedback.userSays,
        reasonText: schema.feedback.reasonText,
        ruleVersion: schema.feedback.ruleVersion,
      })
      .from(schema.feedback)
      .where(
        and(
          eq(schema.feedback.spotId, spot.id),
          eq(schema.feedback.ownerEmail, ownerEmail),
          eq(schema.feedback.status, "open"),
        ),
      )
      .orderBy(desc(schema.feedback.createdAt))
      .limit(30),
    loadWeather(spot, { replay: Boolean(replayDate) }).catch(() => null),
  ]);

  const section: Record<string, unknown> = {
    spot: { id: spot.id, name: spot.name, activity: spot.activity },
    activeRuleVersion: active?.version ?? null,
    replayDate,
    openFeedback,
  };
  if (!weather) {
    section.weatherNote = "Weather unavailable; verdicts skipped.";
    section.draft = draft ? { id: draft.id, reason: draft.reason } : null;
    return section;
  }

  const today = effectiveToday(weather.timezone, replayDate);
  section.today = today;
  if (draft) {
    const next = active
      ? changedDays(
          forecastVerdicts(active.body, weather.hourly, today),
          forecastVerdicts(draft.body, weather.hourly, today),
        )
      : [];
    const past = active
      ? changedDays(
          backtestVerdicts(active.body, weather.hourly, today),
          backtestVerdicts(draft.body, weather.hourly, today),
        )
      : [];
    section.draft = {
      id: draft.id,
      reason: draft.reason,
      changedNext7: next.length,
      changedPast30: past.length,
    };
  } else {
    section.draft = null;
  }
  if (day && active) {
    section.day = { ...evaluateDay(active.body, weather.hourly, day), rule: "active" };
  } else if (day) {
    section.dayNote = "This spot has no active rule, so the selected day has no verdict.";
  }
  return section;
}

export default defineAction({
  description:
    "Read what the user is looking at. Returns the navigation state and, on a spot screen, the spot, active rule version, open draft with how many next-7 and past-30 days it changes, the selected day's verdict with per-condition results, and open feedback. Basic navigation is already in <current-screen>; use this for a fresh read of the details.",
  schema: z.object({}),
  http: false,
  readOnly: true,
  run: async (_args, ctx) => {
    const navigation = await readAppState("navigation");

    const screen: Record<string, unknown> = {};
    if (navigation) screen.navigation = navigation;

    const spotId = typeof navigation?.spotId === "string" ? navigation.spotId : "";
    if (navigation?.view === "spots" && spotId) {
      const day = typeof navigation.day === "string" ? navigation.day : undefined;
      screen.spots = await spotsSection(spotId, day, requireEmail(ctx));
    }

    if (Object.keys(screen).length === 0) {
      return "No application state found. Is the app running?";
    }
    return screen;
  },
});
