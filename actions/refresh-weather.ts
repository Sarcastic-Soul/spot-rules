import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { getOwnedSpot, loadWeather, requireEmail } from "../server/lib/spots.js";

export default defineAction({
  description: "Fetch fresh Open-Meteo weather for one spot, or all of the user's spots when spotId is omitted.",
  schema: z.object({ spotId: z.string().optional().describe("Spot id; omit for all spots") }),
  run: async ({ spotId }, ctx) => {
    const ownerEmail = requireEmail(ctx);
    const spots = spotId
      ? [await getOwnedSpot(spotId, ownerEmail)]
      : await getDb().select().from(schema.spots).where(eq(schema.spots.ownerEmail, ownerEmail)).limit(50);
    const results = await Promise.all(
      spots.map(async (spot) => {
        try {
          const w = await loadWeather(spot, { force: true });
          return { spotId: spot.id, name: spot.name, fetchedAt: w.fetchedAt, ok: true };
        } catch (error) {
          return { spotId: spot.id, name: spot.name, ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      }),
    );
    return { refreshed: results };
  },
});
