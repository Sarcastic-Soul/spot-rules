import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { getOwnedSpot, requireEmail } from "../server/lib/spots.js";

export default defineAction({
  description: "Rename a spot, change its activity, or move its pin.",
  schema: z.object({
    id: z.string().describe("Spot id"),
    name: z.string().min(1).max(80).optional().describe("New name"),
    activity: z.string().min(1).max(40).optional().describe("New activity"),
    lat: z.coerce.number().min(-90).max(90).optional().describe("New latitude"),
    lon: z.coerce.number().min(-180).max(180).optional().describe("New longitude"),
  }),
  run: async (args, ctx) => {
    const ownerEmail = requireEmail(ctx);
    const spot = await getOwnedSpot(args.id, ownerEmail);
    const patch: Partial<typeof schema.spots.$inferInsert> = {};
    if (args.name) patch.name = args.name.trim();
    if (args.activity) patch.activity = args.activity.trim();
    const moved = args.lat !== undefined || args.lon !== undefined;
    if (moved) {
      if (args.lat === undefined || args.lon === undefined)
        fail("Send both lat and lon to move a pin.", { errorCode: "invalid_input" });
      patch.lat = args.lat;
      patch.lon = args.lon;
    }
    if (!Object.keys(patch).length) return { id: spot.id, changed: false };
    const db = getDb();
    await db
      .update(schema.spots)
      .set(patch)
      .where(and(eq(schema.spots.id, spot.id), eq(schema.spots.ownerEmail, ownerEmail)));
    // A moved pin needs fresh weather.
    if (moved) await db.delete(schema.weatherCache).where(eq(schema.weatherCache.spotId, spot.id));
    return { id: spot.id, changed: true };
  },
});
