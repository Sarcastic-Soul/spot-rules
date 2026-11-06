import { useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { MagnifyingGlass, MapPin, Plus, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

import { btn, field, useSpotsContext } from "@/components/spots/context";
import { Skeleton } from "@/components/ui/skeleton";
import { dayLabel } from "@/lib/spots";

type ListResult = {
  replayDate: string | null;
  spots: {
    id: string;
    name: string;
    activity: string;
    lat: number;
    lon: number;
    ruleVersion: number | null;
    week: { date: string; result: string; reason: string }[] | null;
  }[];
};

type Place = { name: string; admin1?: string; country?: string; lat: number; lon: number };

export default function SpotsIndex() {
  const list = useActionQuery<ListResult>("list-spots", {});
  const { pendingPin } = useSpotsContext();
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    if (pendingPin) setAdding(true);
  }, [pendingPin]);

  const spots = list.data?.spots ?? [];

  return (
    <div>
      <div className="flex items-center px-5 pb-2 pt-4">
        <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Your spots</h2>
        {spots[0]?.week && (
          <div className="ml-auto grid grid-cols-7 gap-[3px] font-plex text-[10px] text-muted-foreground">
            {spots[0].week.map((d) => (
              <span key={d.date} className="w-7 text-center">
                {dayLabel(d.date).slice(0, 2)}
              </span>
            ))}
          </div>
        )}
      </div>
      {list.isLoading ? (
        <div className="space-y-2 px-5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-none" />
          ))}
        </div>
      ) : list.error ? (
        <p className="px-5 text-sm text-destructive">Could not load spots: {(list.error as Error).message}</p>
      ) : spots.length === 0 && !adding ? (
        <div className="mx-5 border border-dashed border-muted-foreground px-5 py-8">
          <p className="font-display text-xl font-semibold">No spots yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Pin a place you ride, run or hike from. Then tell the agent what a good day looks like there.
          </p>
        </div>
      ) : (
        <ul className="border-b border-border">
          {spots.map((s) => (
            <li key={s.id} className="border-t border-border">
              <Link
                to={`/spots/${s.id}`}
                className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/60 focus-visible:bg-muted focus-visible:outline-none"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-[17px] font-semibold leading-tight">{s.name}</span>
                  <span className="block truncate text-[13px] text-muted-foreground">
                    {s.activity}
                    {s.ruleVersion ? ` · rule v${s.ruleVersion}` : " · no rule yet"}
                  </span>
                </span>
                {s.week ? (
                  <span className="grid grid-cols-7 gap-[3px]" aria-label="Next 7 days">
                    {s.week.map((d) => (
                      <span
                        key={d.date}
                        title={`${dayLabel(d.date)}: ${d.result} · ${d.reason}`}
                        className={`cell-${d.result} flex h-7 w-7 items-center justify-center border border-foreground/25 font-plex text-[10px] font-medium`}
                      >
                        {d.result === "MAYBE" ? "?" : d.result === "GO" ? "GO" : d.result === "NO" ? "–" : ""}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="font-plex text-[11px] text-muted-foreground">add a rule</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <AddSpotForm onClose={() => setAdding(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mx-5 my-5 flex min-h-11 w-[calc(100%-2.5rem)] items-center justify-center gap-2 border border-dashed border-muted-foreground text-sm font-medium transition-colors hover:border-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus size={16} /> Pin a new spot
        </button>
      )}
    </div>
  );
}

function AddSpotForm({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { pendingPin, setPendingPin, pinMode, setPinMode } = useSpotsContext();
  const [name, setName] = useState("");
  const [activity, setActivity] = useState("");
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  // Rank results near the user's spots (or the default map view) so "Nandi Hills" finds the one in India first.
  const spots = useActionQuery<ListResult>("list-spots", {});
  const anchor = spots.data?.spots[0] ?? { lat: 13.1, lon: 77.5 };
  const places = useActionQuery<Place[] | { places: Place[] }>(
    "search-places",
    { query: submittedQuery, nearLat: anchor.lat, nearLon: anchor.lon },
    { enabled: submittedQuery.length >= 2 },
  );
  const placeList: Place[] = Array.isArray(places.data) ? places.data : (places.data?.places ?? []);
  const create = useActionMutation<{ id?: string; spot?: { id: string } }>("create-spot", {
    onSuccess: (r) => {
      const id = r.id ?? r.spot?.id;
      setPendingPin(null);
      toast.success("Spot pinned");
      onClose();
      if (id) navigate(`/spots/${id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function close() {
    setPendingPin(null);
    setPinMode(false);
    onClose();
  }

  return (
    <form
      className="mx-5 my-5 space-y-3 border border-foreground bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!pendingPin) return toast.error("Pick a place first: search, or click the map.");
        create.mutate({ name: name.trim(), activity: activity.trim(), lat: pendingPin.lat, lon: pendingPin.lon });
      }}
    >
      <div className="flex items-center">
        <h3 className="font-display text-lg font-semibold">Pin a new spot</h3>
        <button type="button" onClick={close} className={`${btn.ghost} ml-auto`} aria-label="Cancel">
          <X size={16} />
        </button>
      </div>
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="place-q">Search a place</label>
        <input
          id="place-q"
          className={field}
          placeholder="Search a place, e.g. Nandi Hills"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              setSubmittedQuery(query.trim());
            }
          }}
        />
        <button type="button" className={btn.line} onClick={() => setSubmittedQuery(query.trim())} aria-label="Search">
          <MagnifyingGlass size={16} />
        </button>
      </div>
      {submittedQuery && (
        <ul className="max-h-40 overflow-y-auto border border-border">
          {places.isLoading && <li className="px-3 py-2 text-sm text-muted-foreground">Searching…</li>}
          {!places.isLoading && placeList.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted-foreground">No places found.</li>
          )}
          {placeList.map((p) => (
            <li key={`${p.lat},${p.lon}`}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                onClick={() => {
                  setPendingPin({ lat: p.lat, lon: p.lon });
                  if (!name) setName(p.name);
                  setSubmittedQuery("");
                }}
              >
                <span className="font-medium">{p.name}</span>
                <span className="text-muted-foreground">{[p.admin1, p.country].filter(Boolean).join(", ") ? ` · ${[p.admin1, p.country].filter(Boolean).join(", ")}` : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className={`${pinMode ? btn.solid : btn.line} w-full`}
        onClick={() => setPinMode(!pinMode)}
        aria-pressed={pinMode}
      >
        <MapPin size={16} />
        {pinMode ? "Click the map…" : pendingPin ? `Pinned ${pendingPin.lat.toFixed(3)}, ${pendingPin.lon.toFixed(3)} · move` : "Or click on the map"}
      </button>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Name
          <input className={field} required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Hill climb" />
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Activity
          <input className={field} required maxLength={40} value={activity} onChange={(e) => setActivity(e.target.value)} placeholder="Road cycling" />
        </label>
      </div>
      <button type="submit" className={`${btn.solid} w-full`} disabled={create.isPending || !pendingPin}>
        {create.isPending ? "Pinning…" : "Pin spot"}
      </button>
    </form>
  );
}
