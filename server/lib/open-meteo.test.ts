import { describe, expect, it, vi } from "vitest";
import { fetchHourly, searchPlaces } from "./open-meteo";

function mockFetch(body: unknown, status = 200) {
  return vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
  );
}

describe("fetchHourly", () => {
  const payload = {
    timezone: "Asia/Kolkata",
    utc_offset_seconds: 19800,
    hourly: {
      time: ["2026-06-01T00:00", "2026-06-01T01:00"],
      temperature_2m: [20.1, 19.8],
      apparent_temperature: [21, 20],
      precipitation: [0, 0.4],
      precipitation_probability: [10, null],
      wind_speed_10m: [8, 9],
      wind_gusts_10m: [18, 22],
      cloud_cover: [30, 40],
      relative_humidity_2m: [60, 62],
      uv_index: [0, 0],
      visibility: [24000, 23000],
    },
  };

  it("builds the URL and maps API names to metrics", async () => {
    const f = mockFetch(payload);
    const r = await fetchHourly(13.3702, 77.6835, { fetchImpl: f as unknown as typeof fetch });
    const url = new URL(String(f.mock.calls[0]![0]));
    expect(url.origin + url.pathname).toBe("https://api.open-meteo.com/v1/forecast");
    expect(url.searchParams.get("latitude")).toBe("13.3702");
    expect(url.searchParams.get("longitude")).toBe("77.6835");
    expect(url.searchParams.get("timezone")).toBe("auto");
    expect(url.searchParams.get("wind_speed_unit")).toBe("kmh");
    expect(url.searchParams.get("past_days")).toBe("35");
    expect(url.searchParams.get("forecast_days")).toBe("8");
    expect(url.searchParams.get("hourly")).toBe(
      "temperature_2m,apparent_temperature,precipitation,precipitation_probability,wind_speed_10m,wind_gusts_10m,cloud_cover,relative_humidity_2m,uv_index,visibility,is_day",
    );
    expect(r.timezone).toBe("Asia/Kolkata");
    expect(r.utcOffsetSeconds).toBe(19800);
    expect(r.hourly.time).toHaveLength(2);
    expect(r.hourly.temperature).toEqual([20.1, 19.8]);
    expect(r.hourly.wind_gusts).toEqual([18, 22]);
    expect(r.hourly.relative_humidity).toEqual([60, 62]);
    expect(r.hourly.precipitation_probability).toEqual([10, null]);
  });

  it("clamps past and forecast days", async () => {
    const f = mockFetch(payload);
    await fetchHourly(1, 2, { pastDays: 500, forecastDays: 99, fetchImpl: f as unknown as typeof fetch });
    const url = new URL(String(f.mock.calls[0]![0]));
    expect(url.searchParams.get("past_days")).toBe("92");
    expect(url.searchParams.get("forecast_days")).toBe("16");
  });

  it("fills missing variables with nulls", async () => {
    const f = mockFetch({
      ...payload,
      hourly: { time: payload.hourly.time, temperature_2m: [1, 2] },
    });
    const r = await fetchHourly(1, 2, { fetchImpl: f as unknown as typeof fetch });
    expect(r.hourly.uv_index).toEqual([null, null]);
  });

  it("throws with status and reason on non-200", async () => {
    const f = mockFetch({ error: true, reason: "Latitude must be in range of -90 to 90" }, 400);
    await expect(
      fetchHourly(999, 0, { fetchImpl: f as unknown as typeof fetch }),
    ).rejects.toThrow(/400.*Latitude must be in range/);
  });

  it("throws on non-200 without a JSON body", async () => {
    const f = vi.fn(async () => new Response("bad gateway", { status: 502 }));
    await expect(
      fetchHourly(1, 2, { fetchImpl: f as unknown as typeof fetch }),
    ).rejects.toThrow(/status 502/);
  });

  it("throws when hourly data is missing", async () => {
    const f = mockFetch({ timezone: "UTC" });
    await expect(
      fetchHourly(1, 2, { fetchImpl: f as unknown as typeof fetch }),
    ).rejects.toThrow(/no hourly data/);
  });

  it("aborts on timeout", async () => {
    vi.useFakeTimers();
    try {
      const f = vi.fn(
        (_u: unknown, init?: RequestInit) =>
          new Promise<Response>((_res, rej) => {
            init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
          }),
      );
      const p = fetchHourly(1, 2, { fetchImpl: f as unknown as typeof fetch });
      const assertion = expect(p).rejects.toThrow(/timed out/);
      await vi.advanceTimersByTimeAsync(10_001);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("searchPlaces", () => {
  it("maps results", async () => {
    const f = mockFetch({
      results: [
        {
          name: "Nandi Hills",
          admin1: "Karnataka",
          country: "India",
          latitude: 13.37,
          longitude: 77.68,
          timezone: "Asia/Kolkata",
          id: 1,
        },
        { name: "Bare", latitude: 1, longitude: 2 },
      ],
    });
    const r = await searchPlaces("nandi hills", { count: 3, fetchImpl: f as unknown as typeof fetch });
    const url = new URL(String(f.mock.calls[0]![0]));
    expect(url.origin + url.pathname).toBe("https://geocoding-api.open-meteo.com/v1/search");
    expect(url.searchParams.get("name")).toBe("nandi hills");
    expect(url.searchParams.get("count")).toBe("3");
    expect(url.searchParams.get("language")).toBe("en");
    expect(url.searchParams.get("format")).toBe("json");
    expect(r).toEqual([
      {
        name: "Nandi Hills",
        admin1: "Karnataka",
        country: "India",
        lat: 13.37,
        lon: 77.68,
        timezone: "Asia/Kolkata",
      },
      { name: "Bare", lat: 1, lon: 2 },
    ]);
  });

  it("returns an empty array when there are no results", async () => {
    const f = mockFetch({ generationtime_ms: 0.5 });
    expect(await searchPlaces("zzzz", { fetchImpl: f as unknown as typeof fetch })).toEqual([]);
  });

  it("returns empty for a blank query without calling the API", async () => {
    const f = mockFetch({});
    expect(await searchPlaces("  ", { fetchImpl: f as unknown as typeof fetch })).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });

  it("throws on non-200", async () => {
    const f = mockFetch({ error: true, reason: "boom" }, 500);
    await expect(
      searchPlaces("x", { fetchImpl: f as unknown as typeof fetch }),
    ).rejects.toThrow(/500.*boom/);
  });
});
