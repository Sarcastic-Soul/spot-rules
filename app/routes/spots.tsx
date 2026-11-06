import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { ArrowsClockwise, ClockCounterClockwise, SunHorizon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Outlet, useNavigate, useParams } from "react-router";
import { toast } from "sonner";

import { SpotMap } from "@/components/spots/SpotMap";
import { btn, type Pin, type SpotsOutletContext } from "@/components/spots/context";
import { longDate } from "@/lib/spots";

export function meta() {
  return [{ title: "Spot Rules" }];
}

type ListResult = {
  replayDate: string | null;
  spots: {
    id: string;
    name: string;
    activity: string;
    lat: number;
    lon: number;
    ruleVersion: number | null;
    today: string;
    week: { date: string; result: string; reason: string }[] | null;
  }[];
};

export default function SpotsLayout() {
  const navigate = useNavigate();
  const { spotId } = useParams();
  const [pinMode, setPinMode] = useState(false);
  const [pendingPin, setPendingPin] = useState<Pin | null>(null);
  const list = useActionQuery<ListResult>("list-spots", {});
  const replayDate = list.data?.replayDate ?? null;
  // Spots carry their own local "today"; with no spots, fall back to replay date or the browser's date.
  const today = list.data ? (list.data.spots[0]?.today ?? replayDate ?? localIsoDate()) : undefined;

  const setReplay = useActionMutation("set-replay-date", {
    onError: (e: Error) => toast.error(e.message),
  });
  const morning = useActionMutation<{ title?: string; lines: { text: string }[]; note?: string }>("morning-check", {
    onSuccess: (r) =>
      toast(r.title ?? "Morning check", {
        description: r.lines.length ? (
          <ul className="mt-1 space-y-1">
            {r.lines.map((l, i) => (
              <li key={i}>{l.text}</li>
            ))}
          </ul>
        ) : (
          r.note
        ),
        duration: 12000,
        action: {
          label: "Run daily",
          onClick: () =>
            sendToAgentChat({
              message: "Run the morning check for me every day at 6 am.",
              context:
                "Spot Rules. Create a scheduled automation with manage-automations: schedule '0 6 * * *', instructions 'Run morning-check'. Confirm the next run time.",
              submit: true,
            }),
        },
      }),
    onError: (e: Error) => toast.error(e.message),
  });

  const mapSpots = useMemo(
    () =>
      (list.data?.spots ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        lat: s.lat,
        lon: s.lon,
        verdict: s.week?.[0]?.result ?? null,
      })),
    [list.data],
  );

  const ctx: SpotsOutletContext = { pinMode, setPinMode, pendingPin, setPendingPin };

  const minReplay = isoDaysAgo(35);
  const maxReplay = isoDaysAgo(1);

  return (
    <div className="grid h-full min-h-0 grid-rows-[42vh_1fr] bg-background text-foreground lg:grid-cols-[minmax(380px,460px)_1fr] lg:grid-rows-1">
      <section className="order-2 flex min-h-0 flex-col border-border lg:order-1 lg:border-r">
        <header className="flex items-baseline gap-3 border-b border-foreground px-5 pb-3 pt-4">
          <h1 className="font-display text-[26px] font-extrabold leading-none tracking-[-0.02em]">Spot Rules</h1>
          <span className="ml-auto font-plex text-xs text-muted-foreground">
            {today ? longDate(today) : ""}
          </span>
        </header>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-5 py-2">
          <label className="flex items-center gap-1.5 font-plex text-xs text-muted-foreground">
            <ClockCounterClockwise size={15} aria-hidden />
            <span>Replay</span>
            <input
              type="date"
              aria-label="Replay a past day"
              className="h-8 border border-border bg-card px-1.5 text-foreground"
              min={minReplay}
              max={maxReplay}
              value={replayDate ?? ""}
              onChange={(e) => setReplay.mutate({ date: e.target.value || null })}
            />
          </label>
          {replayDate && (
            <button type="button" className={btn.ghost} onClick={() => setReplay.mutate({ date: null })}>
              Back to live
            </button>
          )}
          <button
            type="button"
            className={`${btn.ghost} ml-auto`}
            disabled={morning.isPending}
            onClick={() => morning.mutate({ notifyUser: true })}
            title="Refresh weather and post today's and tomorrow's calls to your inbox"
          >
            {morning.isPending ? <ArrowsClockwise size={15} className="animate-spin" /> : <SunHorizon size={15} />}
            Morning check
          </button>
        </div>
        {replayDate && (
          <div className="border-b border-foreground bg-foreground px-5 py-1.5 font-plex text-xs text-background">
            Replay: today is {longDate(replayDate)}. Real past weather, frozen for demos.
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Outlet context={ctx} />
        </div>
        <footer className="border-t border-border px-5 py-2 font-plex text-[11px] text-muted-foreground">
          Weather:{" "}
          <a className="underline" href="https://open-meteo.com/" target="_blank" rel="noreferrer">
            Open-Meteo
          </a>{" "}
          · Map: OpenFreeMap, © OpenStreetMap
        </footer>
      </section>
      <section className="order-1 min-h-0 border-b border-border lg:order-2 lg:border-b-0">
        <SpotMap
          spots={mapSpots}
          selectedId={spotId ?? null}
          onSelect={(id) => navigate(`/spots/${id}`)}
          pinMode={pinMode}
          pendingPin={pendingPin}
          onPick={(p) => {
            setPendingPin(p);
            setPinMode(false);
          }}
        />
      </section>
    </div>
  );
}

function isoDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function localIsoDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
