import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { addDays, evaluateDay } from "../shared/evaluate.js";
import { getDb, schema } from "../server/db/index.js";
import {
  effectiveToday,
  getReplayDate,
  loadWeather,
  rankSpots,
  requireEmail,
  verdictMargin,
  type SpotComparison,
} from "../server/lib/spots.js";

export default defineAction({
  description:
    "Rank the user's spots for one day, best first (GO > MAYBE > NO > SKIP > UNKNOWN, ties by the larger safety margin). Use for 'where should I go Saturday?'. Spots without an active rule are listed under noRule; spots whose weather failed under unavailable. Default date is tomorrow.",
  schema: z.object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("Day to compare, YYYY-MM-DD. Default: tomorrow (in replay mode, the day after the replay date)"),
  }),
  http: { method: "GET" },
  readOnly: true,
  link: ({ result }) => {
    const top = result?.ranking?.[0];
    if (!top?.spotId) return null;
    return {
      url: buildDeepLink({
        view: "spots",
        to: `/spots/${encodeURIComponent(top.spotId)}`,
        params: { spotId: top.spotId },
      }),
      label: `Open ${top.name}`,
    };
  },
  run: async ({ date }, ctx) => {
    const ownerEmail = requireEmail(ctx);
    const db = getDb();
    const spots = await db
      .select()
      .from(schema.spots)
      .where(eq(schema.spots.ownerEmail, ownerEmail))
      .orderBy(schema.spots.createdAt)
      .limit(50);
    const replayDate = await getReplayDate(ownerEmail);
    if (!spots.length) {
      return { date: date ?? null, replayDate, ranking: [], noRule: [], unavailable: [] };
    }
    const rules = await db
      .select({ spotId: schema.rules.spotId, body: schema.rules.body })
      .from(schema.rules)
      .where(
        and(
          inArray(schema.rules.spotId, spots.map((s) => s.id)),
          eq(schema.rules.status, "active"),
        ),
      );
    const ruleBySpot = new Map(rules.map((r) => [r.spotId, r.body]));

    const noRule: Array<{ spotId: string; name: string }> = [];
    const unavailable: Array<{ spotId: string; name: string; error: string }> = [];
    const withRule = spots.filter((spot) => {
      if (ruleBySpot.has(spot.id)) return true;
      noRule.push({ spotId: spot.id, name: spot.name });
      return false;
    });

    const settled = await Promise.all(
      withRule.map(async (spot) => {
        try {
          const weather = await loadWeather(spot, { replay: Boolean(replayDate) });
          const day = date ?? addDays(effectiveToday(weather.timezone, replayDate), 1);
          const verdict = evaluateDay(ruleBySpot.get(spot.id)!, weather.hourly, day);
          const item: SpotComparison = {
            spotId: spot.id,
            name: spot.name,
            activity: spot.activity,
            date: day,
            result: verdict.result,
            bestStart: verdict.bestStart,
            bestEnd: verdict.bestEnd,
            reason: verdict.reason,
            margin: verdictMargin(verdict),
          };
          return { item, day };
        } catch (error) {
          unavailable.push({
            spotId: spot.id,
            name: spot.name,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      }),
    );
    const done = settled.filter((s): s is NonNullable<typeof s> => s !== null);
    return {
      date: done[0]?.day ?? date ?? null,
      replayDate,
      ranking: rankSpots(done.map((d) => d.item)),
      noRule,
      unavailable,
    };
  },
});
