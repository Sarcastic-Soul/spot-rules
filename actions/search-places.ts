import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { searchPlaces } from "../server/lib/open-meteo.js";

export default defineAction({
  description:
    "Search places by name (Open-Meteo geocoding). Returns up to 8 matches with lat/lon to use in create-spot.",
  schema: z.object({
    query: z.string().min(2).max(100).describe('Place name, e.g. "Nandi Hills"'),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ query }) => {
    try {
      return { places: await searchPlaces(query, { count: 8 }) };
    } catch (error) {
      fail(
        `Place search failed: ${error instanceof Error ? error.message : String(error)}`,
        { errorCode: "geocoding_failed", statusCode: 502 },
      );
    }
  },
});
