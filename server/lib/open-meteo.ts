import { METRICS, type HourlyWeather, type Metric } from "../../shared/rules";

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const TIMEOUT_MS = 10_000;

/** Our metric name -> Open-Meteo hourly variable name. */
const API_NAMES: Record<Metric, string> = {
  temperature: "temperature_2m",
  apparent_temperature: "apparent_temperature",
  precipitation: "precipitation",
  precipitation_probability: "precipitation_probability",
  wind_speed: "wind_speed_10m",
  wind_gusts: "wind_gusts_10m",
  cloud_cover: "cloud_cover",
  relative_humidity: "relative_humidity_2m",
  uv_index: "uv_index",
  visibility: "visibility",
};

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Math.floor(n)));

async function getJson(url: string, fetchImpl: typeof fetch, what: string): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetchImpl(url, { signal: ctrl.signal });
    } catch (err) {
      if (ctrl.signal.aborted) {
        throw new Error(`${what} timed out after ${TIMEOUT_MS / 1000}s`);
      }
      throw new Error(`${what} request failed: ${(err as Error).message}`);
    }
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok) {
      const reason = body && typeof body.reason === "string" ? `: ${body.reason}` : "";
      throw new Error(`${what} failed with status ${res.status}${reason}`);
    }
    if (body === null) throw new Error(`${what} returned an invalid JSON body`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchHourly(
  lat: number,
  lon: number,
  opts: { pastDays?: number; forecastDays?: number; fetchImpl?: typeof fetch } = {},
): Promise<{ timezone: string; utcOffsetSeconds: number; hourly: HourlyWeather }> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const pastDays = clamp(opts.pastDays ?? 35, 0, 92);
  const forecastDays = clamp(opts.forecastDays ?? 8, 1, 16);
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: METRICS.map((m) => API_NAMES[m]).join(","),
    timezone: "auto",
    wind_speed_unit: "kmh",
    past_days: String(pastDays),
    forecast_days: String(forecastDays),
  });
  // Keep commas readable; Open-Meteo accepts both forms.
  const url = `${FORECAST_URL}?${params.toString().replace(/%2C/g, ",")}`;
  const data = await getJson(url, fetchImpl, "Open-Meteo forecast");

  const h = data?.hourly;
  if (!h || !Array.isArray(h.time)) {
    throw new Error("Open-Meteo forecast response has no hourly data");
  }
  const time: string[] = h.time;
  const hourly = { time } as HourlyWeather;
  for (const m of METRICS) {
    const arr = h[API_NAMES[m]];
    hourly[m] = Array.isArray(arr)
      ? time.map((_, i) => (typeof arr[i] === "number" ? arr[i] : null))
      : time.map(() => null);
  }
  return {
    timezone: String(data.timezone ?? "UTC"),
    utcOffsetSeconds: Number(data.utc_offset_seconds ?? 0),
    hourly,
  };
}

export type Place = {
  name: string;
  admin1?: string;
  country?: string;
  lat: number;
  lon: number;
  timezone?: string;
};

export async function searchPlaces(
  query: string,
  opts: { count?: number; fetchImpl?: typeof fetch } = {},
): Promise<Place[]> {
  const q = query.trim();
  if (!q) return [];
  const fetchImpl = opts.fetchImpl ?? fetch;
  const count = clamp(opts.count ?? 5, 1, 100);
  const params = new URLSearchParams({
    name: q,
    count: String(count),
    language: "en",
    format: "json",
  });
  const data = await getJson(`${GEOCODING_URL}?${params}`, fetchImpl, "Open-Meteo geocoding");
  const results: any[] = Array.isArray(data?.results) ? data.results : [];
  return results
    .filter((r) => typeof r.latitude === "number" && typeof r.longitude === "number")
    .map((r) => {
      const p: Place = { name: String(r.name), lat: r.latitude, lon: r.longitude };
      if (r.admin1) p.admin1 = String(r.admin1);
      if (r.country) p.country = String(r.country);
      if (r.timezone) p.timezone = String(r.timezone);
      return p;
    });
}
