import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { notify } from "@agent-native/core/notifications";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { addDays, evaluateDay } from "../shared/evaluate.js";
import { getDb, schema } from "../server/db/index.js";
import {
  effectiveToday,
  getReplayDate,
  loadWeather,
  requireEmail,
  windowIsOver,
} from "../server/lib/spots.js";

type Line = {
  spotId: string;
  name: string;
  today: string;
  tomorrow: string;
  todayOver: boolean;
  text: string;
};

export default defineAction({
  description:
    "Daily check: refresh weather for every spot, work out today's and tomorrow's verdicts with code, and post one summary to the notification inbox. A spot whose best window for today has already ended is marked todayOver (live mode only). Returns notified (true only when the inbox post succeeded). Run by the morning automation or on demand.",
  schema: z.object({
    notifyUser: z.boolean().default(true).describe("Post the summary to the inbox"),
  }),
  link: () => ({
    url: buildDeepLink({ view: "spots", to: "/spots" }),
    label: "Open Spots",
  }),
  run: async ({ notifyUser }, ctx) => {
    const ownerEmail = requireEmail(ctx);
    const db = getDb();
    const replayDate = await getReplayDate(ownerEmail);
    const spots = await db.select().from(schema.spots).where(eq(schema.spots.ownerEmail, ownerEmail)).limit(50);
    if (!spots.length) return { lines: [], notified: false, note: "No spots yet." };
    const rules = await db
      .select({ spotId: schema.rules.spotId, body: schema.rules.body })
      .from(schema.rules)
      .where(and(inArray(schema.rules.spotId, spots.map((s) => s.id)), eq(schema.rules.status, "active")));
    const ruleBySpot = new Map(rules.map((r) => [r.spotId, r.body]));
    const now = new Date();
    const computed = await Promise.all(
      spots.map(async (spot): Promise<Line | null> => {
        const body = ruleBySpot.get(spot.id);
        if (!body) return null;
        const weather = await loadWeather(spot, { force: !replayDate, replay: Boolean(replayDate) }).catch(() => null);
        if (!weather) return null;
        const today = effectiveToday(weather.timezone, replayDate);
        const a = evaluateDay(body, weather.hourly, today);
        const b = evaluateDay(body, weather.hourly, addDays(today, 1));
        const when = (v: typeof a) => (v.bestStart ? ` ${v.bestStart}–${v.bestEnd}` : "");
        const todayOver = !replayDate && windowIsOver(a, weather.timezone, now);
        const todayText = todayOver
          ? "today window over"
          : `today ${a.result}${a.result === "GO" ? when(a) : ` (${a.reason})`}`;
        return {
          spotId: spot.id,
          name: spot.name,
          today: a.result,
          tomorrow: b.result,
          todayOver,
          text: `${spot.name}: ${todayText}, tomorrow ${b.result}${b.result === "GO" ? when(b) : ""}`,
        };
      }),
    );
    const lines = computed.filter((l): l is Line => l !== null);
    const goes = lines.filter((l) => l.today === "GO" && !l.todayOver).map((l) => l.name);
    const title = goes.length ? `Go today: ${goes.join(", ")}` : "No GO spots today";
    let notified = false;
    let notifyError: string | undefined;
    if (notifyUser && lines.length) {
      try {
        const stored = await notify(
          {
            severity: "info",
            title,
            body: lines.map((l) => l.text).join("\n"),
            metadata: { kind: "morning-check", replayDate },
            idempotencyKey: `morning-check:${ownerEmail}:${replayDate ?? "live"}:${now.toISOString().slice(0, 16)}`,
          },
          { owner: ownerEmail },
        );
        notified = Boolean(stored);
        if (!stored) notifyError = "The inbox did not store the notification.";
      } catch (error) {
        notifyError = error instanceof Error ? error.message : String(error);
      }
    }
    return { title, lines, replayDate, notified, ...(notifyError ? { notifyError } : {}) };
  },
});
