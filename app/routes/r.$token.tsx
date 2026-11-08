import { appPath } from "@agent-native/core/client/api-path";
import { Check } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useParams } from "react-router";

import { dayLabel, formatCondition, windowText, type RuleBody } from "@/lib/spots";

export function meta() {
  return [{ title: "A shared rule · Spot Rules" }, { name: "robots", content: "noindex" }];
}

type Shared = {
  spot: { name: string; activity: string };
  rule: { version: number; sourceText: string; body: RuleBody };
  today: string;
  forecast: { date: string; result: string; bestStart: string | null; bestEnd: string | null; reason: string }[] | null;
};

/** Public, read-only page for a shared rule. Signed-out visitors can open it. */
export default function SharedRule() {
  const { token = "" } = useParams();
  const [data, setData] = useState<Shared | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    fetch(appPath(`/api/public/rules/${encodeURIComponent(token)}`))
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "This link was turned off or never existed." : `Could not load (${r.status}).`);
        return (await r.json()) as Shared;
      })
      .then((d) => !off && setData(d))
      .catch((e: Error) => !off && setError(e.message));
    return () => {
      off = true;
    };
  }, [token]);

  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-background px-5 py-10 text-foreground">
      <p className="font-plex text-xs uppercase tracking-[0.08em] text-muted-foreground">Spot Rules · shared rule</p>
      {error ? (
        <p role="alert" className="mt-6 text-sm text-destructive">{error}</p>
      ) : !data ? (
        <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <h1 className="mt-2 font-display text-[38px] font-extrabold leading-[1.02] tracking-[-0.03em]">{data.spot.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{data.spot.activity} · rule v{data.rule.version}</p>
          <p className="mt-5 border-l-2 border-signal pl-4 font-display text-[19px] italic leading-snug">“{data.rule.sourceText}”</p>
          <ul className="mt-4 flex flex-wrap gap-2" aria-label="Rule conditions">
            <li className="border border-foreground bg-card px-2.5 py-1 font-plex text-[12.5px]">
              <span className="mr-1.5 text-muted-foreground">window</span>
              {windowText(data.rule.body)}
            </li>
            {data.rule.body.conditions.map((c) => (
              <li
                key={c.id}
                className={`border px-2.5 py-1 font-plex text-[12.5px] ${c.severity === "hard" ? "border-foreground bg-card" : "border-dashed border-foreground/60"}`}
              >
                {formatCondition(c)}
                {c.severity === "soft" && <span className="ml-1.5 text-muted-foreground">soft</span>}
              </li>
            ))}
          </ul>
          <h2 className="mt-8 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Next 7 days</h2>
          {data.forecast ? (
            <ol className="mt-2 grid grid-cols-7 gap-1">
              {data.forecast.map((v) => (
                <li
                  key={v.date}
                  title={v.reason}
                  className={`cell-${v.result} flex min-h-[72px] flex-col items-center border border-foreground/25 py-2 text-center`}
                >
                  <span className="font-plex text-[11px]">{dayLabel(v.date)}</span>
                  <span className="mt-1 inline-flex items-center gap-0.5 font-display text-sm font-bold">
                    {v.result === "GO" && <Check size={12} weight="bold" aria-hidden />}
                    {v.result === "UNKNOWN" ? "—" : v.result === "SKIP" ? "off" : v.result}
                  </span>
                  <span className="mt-1 font-plex text-[10px]">
                    {v.bestStart && v.bestEnd ? `${v.bestStart.slice(0, 2)}–${v.bestEnd.slice(0, 2)}h` : ""}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Weather is not available right now.</p>
          )}
          <p className="mt-6 text-[13px] text-muted-foreground">
            Calls come from plain code checking each condition against Open-Meteo weather. The AI writes rules; it never decides GO or NO.
          </p>
          <a href={appPath("/spots")} className="mt-6 inline-flex min-h-9 items-center bg-foreground px-3.5 text-[13px] font-semibold text-background">
            Make your own rules
          </a>
        </>
      )}
    </main>
  );
}
