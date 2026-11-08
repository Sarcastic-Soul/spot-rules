import { and, eq, isNull } from "drizzle-orm";
import { createError, defineEventHandler, getRouterParam, setResponseHeader } from "h3";

import { getDb, schema } from "../../../../db/index.js";
import { forecastVerdicts, getRuleByStatus, loadWeather, todayIn } from "../../../../lib/spots.js";

// Public, read-only view of a shared rule (listed in the auth plugin's publicPaths).
// Only the token decides access; the response leaves out coordinates and the owner.
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, "token") ?? "";
  if (!/^[a-f0-9]{32}$/.test(token)) throw createError({ statusCode: 404, statusMessage: "Link not found" });
  const db = getDb();
  const [share] = await db
    .select({ spotId: schema.ruleShares.spotId, ownerEmail: schema.ruleShares.ownerEmail })
    .from(schema.ruleShares)
    .where(and(eq(schema.ruleShares.token, token), isNull(schema.ruleShares.revokedAt)))
    .limit(1);
  if (!share) throw createError({ statusCode: 404, statusMessage: "Link not found or turned off" });
  const [spot] = await db
    .select()
    .from(schema.spots)
    .where(and(eq(schema.spots.id, share.spotId), eq(schema.spots.ownerEmail, share.ownerEmail)))
    .limit(1);
  const rule = spot ? await getRuleByStatus(spot.id, "active") : null;
  if (!spot || !rule) throw createError({ statusCode: 404, statusMessage: "This rule is no longer live" });
  let forecast = null;
  let today = todayIn(spot.timezone);
  try {
    const weather = await loadWeather(spot);
    today = todayIn(weather.timezone);
    forecast = forecastVerdicts(rule.body, weather.hourly, today).map((v) => ({
      date: v.date,
      result: v.result,
      bestStart: v.bestStart,
      bestEnd: v.bestEnd,
      reason: v.reason,
    }));
  } catch {
    forecast = null;
  }
  setResponseHeader(event, "Cache-Control", "public, max-age=300");
  return {
    spot: { name: spot.name, activity: spot.activity },
    rule: { version: rule.version, sourceText: rule.sourceText, body: rule.body },
    today,
    forecast,
  };
});
