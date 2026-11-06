import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireEmail } from "../server/lib/spots.js";

export default defineAction({
  description:
    "Pin a new outdoor spot. It starts with no rule; then call propose-rule with the user's plain-English rule.",
  schema: z.object({
    name: z.string().min(1).max(80).describe('Short spot name, e.g. "Nandi Hills climb"'),
    activity: z.string().min(1).max(40).describe('Activity, e.g. "Road cycling"'),
    lat: z.coerce.number().min(-90).max(90).describe("Latitude, decimal degrees"),
    lon: z.coerce.number().min(-180).max(180).describe("Longitude, decimal degrees"),
  }),
  link: ({ result }) => ({
    url: buildDeepLink({
      view: "spots",
      to: `/spots/${encodeURIComponent(result.id)}`,
      params: { spotId: result.id },
    }),
    label: `Open ${result.name}`,
  }),
  run: async (args, ctx) => {
    const ownerEmail = requireEmail(ctx);
    const spot = {
      id: crypto.randomUUID(),
      name: args.name.trim(),
      activity: args.activity.trim(),
      lat: Math.round(args.lat * 1e5) / 1e5,
      lon: Math.round(args.lon * 1e5) / 1e5,
      ownerEmail,
    };
    await getDb().insert(schema.spots).values(spot);
    return { id: spot.id, name: spot.name, activity: spot.activity, lat: spot.lat, lon: spot.lon };
  },
});
