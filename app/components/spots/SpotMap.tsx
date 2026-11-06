import { useEffect, useRef } from "react";
import type { Map as MlMap, Marker } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";

export type MapSpot = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Today's verdict, if known */
  verdict?: string | null;
};

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

export function SpotMap({
  spots,
  selectedId,
  onSelect,
  pinMode,
  pendingPin,
  onPick,
}: {
  spots: MapSpot[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  pinMode: boolean;
  pendingPin: { lat: number; lon: number } | null;
  onPick: (p: { lat: number; lon: number }) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const lib = useRef<typeof import("maplibre-gl") | null>(null);
  const markers = useRef<Marker[]>([]);
  const pending = useRef<Marker | null>(null);
  const fitted = useRef(false);
  const pinModeRef = useRef(pinMode);
  const onPickRef = useRef(onPick);
  const onSelectRef = useRef(onSelect);
  pinModeRef.current = pinMode;
  onPickRef.current = onPick;
  onSelectRef.current = onSelect;
  const ready = useRef<Promise<void> | null>(null);

  useEffect(() => {
    let cancelled = false;
    let ro: ResizeObserver | undefined;
    ready.current = import("maplibre-gl").then((m) => {
      if (cancelled || !box.current) return;
      lib.current = m;
      // Production builds do not ship the worker next to the bundle; point at the copied asset.
      m.setWorkerUrl(workerUrl);
      const instance = new m.Map({
        container: box.current,
        style: STYLE_URL,
        center: [77.5, 13.1],
        zoom: 8.6,
        attributionControl: { compact: true },
      });
      instance.addControl(new m.NavigationControl({ showCompass: false }), "bottom-right");
      instance.on("click", (e) => {
        if (pinModeRef.current) onPickRef.current({ lat: e.lngLat.lat, lon: e.lngLat.lng });
      });
      map.current = instance;
      ro = new ResizeObserver(() => instance.resize());
      ro.observe(box.current);
    });
    return () => {
      cancelled = true;
      ro?.disconnect();
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Markers
  useEffect(() => {
    let alive = true;
    void ready.current?.then(() => {
      const m = lib.current;
      const instance = map.current;
      if (!alive || !m || !instance) return;
      markers.current.forEach((mk) => mk.remove());
      markers.current = spots.map((s) => {
        const el = document.createElement("button");
        el.type = "button";
        el.className = "spot-marker";
        el.dataset.selected = String(s.id === selectedId);
        el.setAttribute("aria-label", `${s.name}${s.verdict ? `, today ${s.verdict}` : ""}`);
        const name = document.createElement("span");
        name.textContent = s.name;
        el.append(name);
        if (s.verdict) {
          const b = document.createElement("b");
          b.textContent = ` · ${s.verdict}`;
          if (s.verdict === "GO") b.className = "go";
          el.append(b);
        }
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          onSelectRef.current(s.id);
        });
        return new m.Marker({ element: el, anchor: "bottom" }).setLngLat([s.lon, s.lat]).addTo(instance);
      });
      if (!fitted.current && spots.length) {
        fitted.current = true;
        if (spots.length === 1) instance.jumpTo({ center: [spots[0]!.lon, spots[0]!.lat], zoom: 10 });
        else {
          const b = new m.LngLatBounds();
          spots.forEach((s) => b.extend([s.lon, s.lat]));
          instance.fitBounds(b, { padding: 90, maxZoom: 11, duration: 0 });
        }
      }
    });
    return () => {
      alive = false;
    };
  }, [spots, selectedId]);

  // Fly to selection
  useEffect(() => {
    const s = spots.find((x) => x.id === selectedId);
    if (!s) return;
    void ready.current?.then(() => {
      map.current?.easeTo({ center: [s.lon, s.lat], zoom: Math.max(map.current.getZoom(), 10), duration: 500 });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Pending pin
  useEffect(() => {
    void ready.current?.then(() => {
      const m = lib.current;
      const instance = map.current;
      if (!m || !instance) return;
      pending.current?.remove();
      pending.current = null;
      if (pendingPin) {
        const el = document.createElement("div");
        el.className = "spot-pending-pin";
        pending.current = new m.Marker({ element: el }).setLngLat([pendingPin.lon, pendingPin.lat]).addTo(instance);
        instance.easeTo({ center: [pendingPin.lon, pendingPin.lat], duration: 400 });
      }
    });
  }, [pendingPin]);

  useEffect(() => {
    if (map.current) map.current.getCanvas().style.cursor = pinMode ? "crosshair" : "";
  }, [pinMode]);

  return (
    <div className="spot-map relative h-full w-full">
      <div ref={box} className="h-full w-full" />
      {pinMode && (
        <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 border border-foreground bg-card px-3 py-1.5 font-plex text-xs">
          Click the map to drop a pin
        </div>
      )}
    </div>
  );
}
