import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { searchPlaces } from "../server/lib/open-meteo.js";

export default defineAction({
  description:
    "Search places by name (Open-Meteo geocoding). Returns up to 8 matches with lat/lon to use in create-spot.",
  schema: z.object({
    query: z.string().min(2).max(100).describe('Place name, e.g. "Nandi Hills"'),
    nearLat: z.coerce.number().min(-90).max(90).optional().describe("Optional: sort closest to this point first"),
    nearLon: z.coerce.number().min(-180).max(180).optional(),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ query, nearLat, nearLon }) => {
    const near = nearLat != null && nearLon != null ? { lat: nearLat, lon: nearLon } : undefined;
    try {
      return { places: await searchPlaces(query, near ? { count: 8, near } : { count: 8 }) };
    } catch (error) {
      fail(
        `Place search failed: ${error instanceof Error ? error.message : String(error)}`,
        { errorCode: "geocoding_failed", statusCode: 502 },
      );
    }
  },
});
