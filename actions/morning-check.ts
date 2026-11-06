import { defineAction } from "@agent-native/core/action";
import { notify } from "@agent-native/core/notifications";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { addDays, evaluateDay } from "../shared/evaluate.js";
import { getDb, schema } from "../server/db/index.js";
import { effectiveToday, getReplayDate, loadWeather, requireEmail } from "../server/lib/spots.js";

export default defineAction({
  description:
    "Daily check: refresh weather for every spot, work out today's and tomorrow's verdicts with code, and post one summary to the notification inbox. Run by the morning automation or on demand.",
  schema: z.object({
    notifyUser: z.boolean().default(true).describe("Post the summary to the inbox"),
  }),
  run: async ({ notifyUser }, ctx) => {
    const ownerEmail = requireEmail(ctx);
    const db = getDb();
    const replayDate = await getReplayDate(ownerEmail);
    const spots = await db.select().from(schema.spots).where(eq(schema.spots.ownerEmail, ownerEmail)).limit(50);
    if (!spots.length) return { lines: [], note: "No spots yet." };
    const rules = await db
      .select({ spotId: schema.rules.spotId, body: schema.rules.body })
      .from(schema.rules)
      .where(and(inArray(schema.rules.spotId, spots.map((s) => s.id)), eq(schema.rules.status, "active")));
    const ruleBySpot = new Map(rules.map((r) => [r.spotId, r.body]));
    const lines: Array<{ spotId: string; name: string; today: string; tomorrow: string; text: string }> = [];
    for (const spot of spots) {
      const body = ruleBySpot.get(spot.id);
      if (!body) continue;
      const weather = await loadWeather(spot, { force: !replayDate, replay: Boolean(replayDate) }).catch(() => null);
      if (!weather) continue;
      const today = effectiveToday(weather.timezone, replayDate);
      const a = evaluateDay(body, weather.hourly, today);
      const b = evaluateDay(body, weather.hourly, addDays(today, 1));
      const when = (v: typeof a) => (v.bestStart ? ` ${v.bestStart}–${v.bestEnd}` : "");
      lines.push({
        spotId: spot.id,
        name: spot.name,
        today: a.result,
        tomorrow: b.result,
        text: `${spot.name}: today ${a.result}${a.result === "GO" ? when(a) : ` (${a.reason})`}, tomorrow ${b.result}${b.result === "GO" ? when(b) : ""}`,
      });
    }
    const goes = lines.filter((l) => l.today === "GO").map((l) => l.name);
    const title = goes.length ? `Go today: ${goes.join(", ")}` : "No GO spots today";
    if (notifyUser && lines.length) {
      await notify(
        {
          severity: "info",
          title,
          body: lines.map((l) => l.text).join("\n"),
          metadata: { kind: "morning-check", replayDate },
          idempotencyKey: `morning-check:${ownerEmail}:${replayDate ?? "live"}:${new Date().toISOString().slice(0, 16)}`,
        },
        { owner: ownerEmail },
      ).catch(() => undefined);
    }
    return { title, lines, replayDate };
  },
});
