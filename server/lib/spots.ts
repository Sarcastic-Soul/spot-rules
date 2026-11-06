import { fail } from "@agent-native/core/action";
import { and, desc, eq } from "drizzle-orm";

import { addDays, evaluateRange } from "../../shared/evaluate.js";
import type { DayVerdict, HourlyWeather, RuleBody } from "../../shared/rules.js";
import { getDb, schema } from "../db/index.js";
import { fetchHourly } from "./open-meteo.js";

export const WEATHER_MAX_AGE_MINUTES = 180;

type Ctx = { userEmail?: string | null } | undefined;

export function requireEmail(ctx: Ctx): string {
  return ctx?.userEmail ?? fail("Sign in first.", { statusCode: 401 });
}

export async function getOwnedSpot(id: string, ownerEmail: string) {
  const [spot] = await getDb()
    .select()
    .from(schema.spots)
    .where(and(eq(schema.spots.id, id), eq(schema.spots.ownerEmail, ownerEmail)))
    .limit(1);
  if (!spot) fail("Spot not found.", { errorCode: "not_found", statusCode: 404 });
  return spot;
}

export async function getRuleByStatus(
  spotId: string,
  status: "active" | "draft",
) {
  const [row] = await getDb()
    .select()
    .from(schema.rules)
    .where(and(eq(schema.rules.spotId, spotId), eq(schema.rules.status, status)))
    .limit(1);
  return row ?? null;
}

export async function listRuleHistory(spotId: string) {
  return getDb()
    .select({
      id: schema.rules.id,
      version: schema.rules.version,
      status: schema.rules.status,
      createdBy: schema.rules.createdBy,
      reason: schema.rules.reason,
      sourceText: schema.rules.sourceText,
      body: schema.rules.body,
      createdAt: schema.rules.createdAt,
      decidedAt: schema.rules.decidedAt,
    })
    .from(schema.rules)
    .where(eq(schema.rules.spotId, spotId))
    .orderBy(desc(schema.rules.createdAt))
    .limit(50);
}

/** YYYY-MM-DD for "now" in an IANA timezone (falls back to UTC). */
export function todayIn(timezone: string | null | undefined, now = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export async function getReplayDate(ownerEmail: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ replayDate: schema.userSettings.replayDate })
    .from(schema.userSettings)
    .where(eq(schema.userSettings.ownerEmail, ownerEmail))
    .limit(1);
  return row?.replayDate ?? null;
}

/** "Today" for a spot: the replay date when set, else the local date at the spot. */
export function effectiveToday(timezone: string | null, replayDate: string | null) {
  return replayDate ?? todayIn(timezone);
}

type Spot = typeof schema.spots.$inferSelect;

export type LoadedWeather = {
  timezone: string;
  hourly: HourlyWeather;
  fetchedAt: string;
};

/**
 * Cached hourly weather for a spot. Refetches from Open-Meteo when the cache
 * is older than maxAgeMinutes or `force` is set. In replay mode the cache is
 * reused as-is so the demo stays repeatable.
 */
export async function loadWeather(
  spot: Spot,
  opts: { force?: boolean; maxAgeMinutes?: number; replay?: boolean } = {},
): Promise<LoadedWeather> {
  const db = getDb();
  const [cached] = await db
    .select()
    .from(schema.weatherCache)
    .where(eq(schema.weatherCache.spotId, spot.id))
    .limit(1);
  const maxAge = (opts.maxAgeMinutes ?? WEATHER_MAX_AGE_MINUTES) * 60_000;
  const fresh =
    cached && Date.now() - Date.parse(cached.fetchedAt) < maxAge;
  if (cached && !opts.force && (fresh || opts.replay)) {
    return {
      timezone: cached.timezone,
      hourly: cached.hourly,
      fetchedAt: cached.fetchedAt,
    };
  }
  let data: Awaited<ReturnType<typeof fetchHourly>>;
  try {
    data = await fetchHourly(spot.lat, spot.lon, { pastDays: 45, forecastDays: 8 });
  } catch (error) {
    if (cached) {
      // Serve stale data rather than nothing; the UI shows fetchedAt.
      return {
        timezone: cached.timezone,
        hourly: cached.hourly,
        fetchedAt: cached.fetchedAt,
      };
    }
    fail(
      `Could not load weather: ${error instanceof Error ? error.message : String(error)}`,
      { errorCode: "weather_unavailable", statusCode: 502 },
    );
  }
  const fetchedAt = new Date().toISOString();
  const row = {
    spotId: spot.id,
    timezone: data.timezone,
    hourly: data.hourly,
    fetchedAt,
    ownerEmail: spot.ownerEmail,
  };
  await db
    .insert(schema.weatherCache)
    .values(row)
    .onConflictDoUpdate({
      target: schema.weatherCache.spotId,
      set: { timezone: row.timezone, hourly: row.hourly, fetchedAt },
    });
  if (!spot.timezone || spot.timezone !== data.timezone) {
    await db
      .update(schema.spots)
      .set({ timezone: data.timezone })
      .where(eq(schema.spots.id, spot.id));
  }
  return { timezone: data.timezone, hourly: data.hourly, fetchedAt };
}

export function forecastVerdicts(
  body: RuleBody,
  hourly: HourlyWeather,
  today: string,
  days = 7,
): DayVerdict[] {
  return evaluateRange(body, hourly, today, days);
}

export function backtestVerdicts(
  body: RuleBody,
  hourly: HourlyWeather,
  today: string,
  days = 30,
): DayVerdict[] {
  return evaluateRange(body, hourly, addDays(today, -days), days);
}

export function countResults(verdicts: DayVerdict[]) {
  const counts = { GO: 0, MAYBE: 0, NO: 0, SKIP: 0, UNKNOWN: 0 };
  for (const v of verdicts) counts[v.result] += 1;
  return counts;
}

/** Days whose verdict differs between two runs over the same dates. */
export function changedDays(before: DayVerdict[], after: DayVerdict[]) {
  const byDate = new Map(before.map((v) => [v.date, v]));
  return after
    .filter((v) => byDate.get(v.date) && byDate.get(v.date)!.result !== v.result)
    .map((v) => ({ date: v.date, from: byDate.get(v.date)!.result, to: v.result }));
}
