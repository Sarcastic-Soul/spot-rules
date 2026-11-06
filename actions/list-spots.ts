import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import {
  effectiveToday,
  forecastVerdicts,
  getReplayDate,
  requireEmail,
} from "../server/lib/spots.js";

export default defineAction({
  description:
    "List the user's spots with a 7-day GO/MAYBE/NO summary from cached weather (null week when weather or rule is missing). Use get-spot for reasons.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  link: () => ({
    url: buildDeepLink({ view: "spots", to: "/spots" }),
    label: "Open Spots",
  }),
  run: async (_args, ctx) => {
    const ownerEmail = requireEmail(ctx);
    const db = getDb();
    const spots = await db
      .select()
      .from(schema.spots)
      .where(eq(schema.spots.ownerEmail, ownerEmail))
      .orderBy(schema.spots.createdAt)
      .limit(50);
    const ids = spots.map((s) => s.id);
    const replayDate = await getReplayDate(ownerEmail);
    if (!ids.length) return { spots: [], replayDate };
    const [rules, weather] = await Promise.all([
      db
        .select({ spotId: schema.rules.spotId, body: schema.rules.body, version: schema.rules.version })
        .from(schema.rules)
        .where(and(inArray(schema.rules.spotId, ids), eq(schema.rules.status, "active"))),
      db
        .select()
        .from(schema.weatherCache)
        .where(inArray(schema.weatherCache.spotId, ids)),
    ]);
    const ruleBySpot = new Map(rules.map((r) => [r.spotId, r]));
    const weatherBySpot = new Map(weather.map((w) => [w.spotId, w]));
    return {
      replayDate,
      spots: spots.map((spot) => {
        const rule = ruleBySpot.get(spot.id);
        const w = weatherBySpot.get(spot.id);
        const today = effectiveToday(w?.timezone ?? spot.timezone, replayDate);
        const week =
          rule && w
            ? forecastVerdicts(rule.body, w.hourly, today, 7).map((v) => ({
                date: v.date,
                result: v.result,
                reason: v.reason,
              }))
            : null;
        return {
          id: spot.id,
          name: spot.name,
          activity: spot.activity,
          lat: spot.lat,
          lon: spot.lon,
          ruleVersion: rule?.version ?? null,
          today,
          week,
        };
      }),
    };
  },
});
