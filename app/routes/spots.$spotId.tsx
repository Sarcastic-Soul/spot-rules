import { appPath } from "@agent-native/core/client/api-path";
import { useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { suggestTemplateKey, TEMPLATES } from "@shared/templates";
import {
  ArrowLeft,
  ArrowsClockwise,
  CaretDown,
  CaretUp,
  ChatCircleText,
  Check,
  LinkSimple,
  PencilSimple,
  Robot,
  Trash,
  User,
  Warning,
  X,
} from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";

import { btn, field } from "@/components/spots/context";
import { sendToAgent } from "@/lib/ask-agent";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  dayLabel,
  diffRules,
  formatCondition,
  longDate,
  prefersReducedMotion,
  shortWindow,
  windowText,
  type Condition,
  type DayVerdict,
  type RuleBody,
} from "@/lib/spots";

type Change = { date: string; from: string; to: string };

type FeedbackCheckRow = {
  feedbackId: string;
  date: string;
  userSays: "GO" | "MAYBE" | "NO";
  before: string | null;
  after: string;
  matches: boolean;
  wasMatching: boolean | null;
};

type Payoff = { spotId: string; version: number; dates: string[] };

type SpotDetail = {
  spot: { id: string; name: string; activity: string; lat: number; lon: number; timezone: string };
  today: string;
  replayDate: string | null;
  weatherFetchedAt: string;
  activeRule: { id: string; version: number; body: RuleBody; sourceText: string; createdBy: string } | null;
  draft: {
    id: string;
    body: RuleBody;
    sourceText: string;
    reason: string | null;
    feedbackId: string | null;
    effect: {
      forecast: DayVerdict[];
      forecastChanges: Change[];
      backtestChanges: Change[];
      backtestCounts: Record<string, number>;
      feedbackCheck?: FeedbackCheckRow[];
    } | null;
  } | null;
  forecast: DayVerdict[] | null;
  history: {
    id: string;
    version: number | null;
    status: string;
    createdBy: string;
    reason: string | null;
    sourceText: string;
    body: RuleBody;
    createdAt: string;
    decidedAt: string | null;
    feedbackText?: string | null;
    feedbackDate?: string | null;
  }[];
  feedback: {
    id: string;
    date: string;
    userSays: string;
    reasonText: string;
    ruleVersion: number;
    status: string;
    resolvedByVersion: number | null;
    verdict?: DayVerdict | null;
  }[];
};

type Backtest = {
  today: string;
  days: number;
  active: { version: number; counts: Record<string, number>; verdicts: DayVerdict[] } | null;
  draft: { id: string; counts: Record<string, number>; verdicts: DayVerdict[] } | null;
  changes: Change[];
};

const TABS = [
  { id: "next", label: "Next 7 days" },
  { id: "past", label: "Past 30 days" },
  { id: "history", label: "Rule history" },
] as const;

export default function SpotDetailRoute() {
  const { spotId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const [payoff, setPayoff] = useState<Payoff | null>(null);
  const tab = params.get("tab") ?? "next";
  const day = params.get("day");
  const q = useActionQuery<SpotDetail>("get-spot", { id: spotId }, { enabled: !!spotId });

  useEffect(() => {
    if (!payoff) return;
    const t = window.setTimeout(() => setPayoff(null), 4000);
    return () => window.clearTimeout(t);
  }, [payoff]);

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  }

  if (q.isLoading) {
    return (
      <div className="space-y-3 p-5">
        <Skeleton className="h-10 w-2/3 rounded-none" />
        <Skeleton className="h-24 w-full rounded-none" />
        <Skeleton className="h-36 w-full rounded-none" />
      </div>
    );
  }
  if (q.error || !q.data) {
    return (
      <div className="p-5">
        <BackLink />
        <p className="mt-4 text-sm text-destructive">{(q.error as Error)?.message ?? "Spot not found."}</p>
      </div>
    );
  }

  const d = q.data;
  const live = payoff && payoff.spotId === d.spot.id ? payoff : null;
  const flash = live ? new Set(live.dates) : undefined;
  return (
    <div className="pb-8">
      <SpotHeader d={d} />
      {d.draft && <DraftCard d={d} onApproved={setPayoff} />}
      {!d.activeRule && <RuleBlock d={d} />}
      {d.activeRule && (
        <>
          <div role="tablist" aria-label="Views" className="mt-3 flex border-b border-foreground px-5">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={tab === t.id}
                onClick={() => {
                  const next = new URLSearchParams(params);
                  next.set("tab", t.id);
                  next.delete("day");
                  setParams(next, { replace: true });
                }}
                className={`-mb-px min-h-10 border-b-2 px-3 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  tab === t.id ? "border-signal text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === "next" && d.forecast && (
            <NextWeek d={d} day={day} onDay={(v) => setParam("day", v)} flash={flash} />
          )}
          {tab === "past" && <PastMonth d={d} day={day} onDay={(v) => setParam("day", v)} flash={flash} />}
          <RuleBlock d={d} live={live} />
          {tab === "history" && <History d={d} />}
        </>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/spots" className={`${btn.ghost} -ml-2`}>
      <ArrowLeft size={15} /> All spots
    </Link>
  );
}

function SpotHeader({ d }: { d: SpotDetail }) {
  const navigate = useNavigate();
  const refresh = useActionMutation("refresh-weather", {
    onSuccess: () => toast.success("Weather refreshed"),
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useActionMutation("delete-spot", {
    onSuccess: () => {
      toast.success("Spot deleted");
      navigate("/spots");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const share = useActionMutation<{ path: string | null }>("share-rule", {
    onSuccess: async (r) => {
      if (!r.path) return;
      const url = new URL(appPath(r.path), window.location.origin).toString();
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Share link copied", { description: url });
      } catch {
        toast.success("Share link ready", { description: url, duration: 15000 });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const fetched = new Date(d.weatherFetchedAt);
  return (
    <div className="px-5 pt-3">
      <div className="flex items-center">
        <BackLink />
        <span className="ml-auto flex items-center">
          <button
            type="button"
            className={btn.ghost}
            onClick={() => refresh.mutate({ spotId: d.spot.id })}
            disabled={refresh.isPending || !!d.replayDate}
            title={d.replayDate ? "Replay mode uses saved weather" : `Weather from ${fetched.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
          >
            <ArrowsClockwise size={15} className={refresh.isPending ? "animate-spin" : ""} />
            <span className="sr-only sm:not-sr-only">Refresh</span>
          </button>
          {d.activeRule && (
            <button
              type="button"
              className={btn.ghost}
              disabled={share.isPending}
              onClick={() => share.mutate({ spotId: d.spot.id })}
              title="Copy a public read-only link to this rule"
            >
              <LinkSimple size={15} />
              <span className="sr-only sm:not-sr-only">Share</span>
            </button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button type="button" className={btn.ghost} aria-label="Delete spot">
                <Trash size={15} />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {d.spot.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Its rules, rule history and feedback go too. This can't be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep it</AlertDialogCancel>
                <AlertDialogAction onClick={() => del.mutate({ id: d.spot.id })}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </span>
      </div>
      <SpotTitle d={d} />
      <p className="mt-1 text-sm text-muted-foreground">
        {d.spot.activity} · <span className="font-plex text-xs">{d.spot.lat.toFixed(3)}, {d.spot.lon.toFixed(3)}</span>
      </p>
    </div>
  );
}

function SpotTitle({ d }: { d: SpotDetail }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(d.spot.name);
  const rename = useActionMutation("update-spot", {
    onSuccess: () => {
      setEditing(false);
      toast.success("Spot renamed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function save() {
    const next = name.trim();
    if (!next) return toast.error("A spot needs a name");
    if (next === d.spot.name) return setEditing(false);
    rename.mutate({ id: d.spot.id, name: next });
  }

  if (editing) {
    return (
      <form
        className="mt-2 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label htmlFor="spot-name" className="sr-only">Spot name</label>
        <input
          id="spot-name"
          autoFocus
          maxLength={80}
          value={name}
          disabled={rename.isPending}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
            }
          }}
          className={`${field} font-display text-xl font-bold`}
        />
        <button type="submit" className={btn.solid} disabled={rename.isPending} aria-label="Save name">
          <Check size={16} weight="bold" />
        </button>
        <button type="button" className={btn.ghost} disabled={rename.isPending} aria-label="Cancel rename" onClick={() => setEditing(false)}>
          <X size={16} />
        </button>
      </form>
    );
  }
  return (
    <div className="mt-2 flex items-start gap-1">
      <h2 className="min-w-0 break-words font-display text-[32px] font-extrabold leading-[1.02] tracking-[-0.03em] sm:text-[38px]">{d.spot.name}</h2>
      <button
        type="button"
        className={`${btn.ghost} shrink-0`}
        aria-label={`Rename ${d.spot.name}`}
        onClick={() => {
          setName(d.spot.name);
          setEditing(true);
        }}
      >
        <PencilSimple size={16} />
      </button>
    </div>
  );
}

/* ---------- Rule ---------- */

function RuleBlock({ d, live }: { d: SpotDetail; live?: Payoff | null }) {
  const rule = d.activeRule;
  if (!rule) {
    if (d.draft) return null;
    return <AskForRule d={d} />;
  }
  return (
    <div className="mt-5 px-5">
      <div className="flex flex-wrap items-baseline">
        <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Rule v{rule.version}</h3>
        {live && (
          <span role="status" className="spot-anim ml-2 bg-foreground px-1.5 font-plex text-[11px] text-background">
            v{live.version} live
          </span>
        )}
        <span className="ml-2 font-plex text-[11px] text-muted-foreground">
          {rule.createdBy === "agent" ? "drafted by agent, approved by you" : "edited by you"}
        </span>
      </div>
      <p className="mt-2 border-l-2 border-signal pl-4 font-display text-[19px] italic leading-snug">“{rule.sourceText}”</p>
      <RuleChips d={d} />
      <ChangeInWords d={d} />
    </div>
  );
}

function RuleChips({ d }: { d: SpotDetail }) {
  const rule = d.activeRule!;
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const edit = useActionMutation("edit-rule", {
    onSuccess: () => {
      toast.success("Rule updated");
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function save(c: Condition) {
    let next: Condition["value"];
    if (c.op === "between") {
      const parts = value.split(/[–\-,\s]+/).filter(Boolean).map(Number);
      if (parts.length !== 2 || parts.some((n) => Number.isNaN(n))) return toast.error("Enter two numbers, e.g. 10–30");
      next = [parts[0]!, parts[1]!];
    } else {
      const n = Number(value);
      if (Number.isNaN(n) || value.trim() === "") return toast.error("Enter a number");
      next = n;
    }
    const body: RuleBody = {
      ...rule.body,
      conditions: rule.body.conditions.map((x) => (x.id === c.id ? { ...x, value: next } : x)),
    };
    edit.mutate({
      spotId: d.spot.id,
      body,
      sourceText: rule.sourceText,
      reason: `Changed ${formatCondition(c)} to ${formatCondition({ ...c, value: next })}`,
    });
  }

  return (
    <ul className="mt-3 flex flex-wrap gap-2" aria-label="Rule conditions">
      <li className="border border-foreground bg-card px-2.5 py-1 font-plex text-[12.5px]">
        <span className="mr-1.5 text-muted-foreground">window</span>
        {windowText(rule.body)}
      </li>
      {rule.body.conditions.map((c) =>
        editing === c.id ? (
          <li key={c.id}>
            <form
              className="flex items-center border border-signal bg-card font-plex text-[12.5px]"
              onSubmit={(e) => {
                e.preventDefault();
                save(c);
              }}
            >
              <span className="pl-2.5 text-muted-foreground">{formatCondition(c).replace(/[\d.–\-\s]+[^\s]*$/, "")}</span>
              <input
                autoFocus
                aria-label={`New value for ${c.metric}`}
                className="w-16 bg-transparent px-1.5 py-1 focus-visible:outline-none"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
              />
              <button type="submit" className="px-1.5 py-1 text-signal" aria-label="Save" disabled={edit.isPending}>
                <Check size={14} weight="bold" />
              </button>
              <button type="button" className="px-1.5 py-1 text-muted-foreground" aria-label="Cancel" onClick={() => setEditing(null)}>
                <X size={14} />
              </button>
            </form>
          </li>
        ) : (
          <li key={c.id}>
            <button
              type="button"
              title={c.note ? `From: “${c.note}”. Click to edit the number.` : "Click to edit the number"}
              onClick={() => {
                setEditing(c.id);
                setValue(Array.isArray(c.value) ? `${c.value[0]}–${c.value[1]}` : String(c.value));
              }}
              className={`border px-2.5 py-1 font-plex text-[12.5px] transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                c.severity === "hard" ? "border-foreground bg-card" : "border-dashed border-foreground/60 bg-transparent"
              }`}
            >
              {formatCondition(c)}
              {c.severity === "soft" && <span className="ml-1.5 text-muted-foreground">soft</span>}
            </button>
          </li>
        ),
      )}
    </ul>
  );
}

async function askAgent(message: string, context: string, sent = "Sent to the agent") {
  const id = toast.loading("Sending to the agent…");
  const ok = await sendToAgent(message, context);
  if (ok) toast.success(sent, { id });
  else toast.error("Couldn't reach the agent. Your text is still here, try again.", { id });
  return ok;
}

function feedbackMessage(d: SpotDetail, date: string, appSaid: string, userSays: string, reason: string) {
  return `On ${longDate(date)} at ${d.spot.name} the app said ${appSaid}, but it should be ${userSays}: “${reason}”. Propose the smallest rule change that fixes this.`;
}

function feedbackContext(d: SpotDetail, feedbackId: string) {
  return `Spot Rules. spotId=${d.spot.id}. feedbackId=${feedbackId}. Call propose-rule with this feedbackId, then report how many past days change.`;
}

function ChangeInWords({ d, draftId, autoFocus }: { d: SpotDetail; draftId?: string; autoFocus?: boolean }) {
  const [text, setText] = useState("");
  const id = draftId ? "change-draft" : "change-rule";
  return (
    <form
      className={draftId ? "flex gap-2 px-4 pb-4" : "mt-3 flex gap-2"}
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim().length < 3) return;
        void askAgent(
          draftId
            ? `Change this draft for ${d.spot.name}: ${text.trim()}`
            : `Change the rule for ${d.spot.name}: ${text.trim()}`,
          draftId
            ? `Spot Rules. spotId=${d.spot.id}. draftId=${draftId}. Revise the draft with propose-rule; keep everything the user did not mention.`
            : `Spot Rules. spotId=${d.spot.id}. Active rule v${d.activeRule?.version}. Use propose-rule to save a draft with the smallest change; do not decide verdicts yourself.`,
        ).then((sent) => sent && setText(""));
      }}
    >
      <label htmlFor={id} className="sr-only">
        {draftId ? "Say what to change in this draft" : "Change the rule in your own words"}
      </label>
      <input
        id={id}
        className={field}
        value={text}
        autoFocus={autoFocus}
        onChange={(e) => setText(e.target.value)}
        placeholder={draftId ? "What should change? e.g. “I can start as late as 10”" : "Change it in words, e.g. “gusts matter more than wind”"}
      />
      <button type="submit" className={btn.line} disabled={text.trim().length < 3}>
        <ChatCircleText size={16} /> {draftId ? "Send" : "Ask"}
      </button>
    </form>
  );
}

const RULE_EXAMPLES: Record<string, string> = {
  cycling: "Good ride: no rain since 6 pm the day before, wind under 20 km/h, gusts under 35, start between 6 and 9 am for 2 hours, not above 32 °C.",
  running: "Good run: start between 5 and 8 am for 1 hour, feels-like under 28 °C, rain chance under 40%.",
  hiking: "Good hike: 6 am to 2 pm, 5 hours, less than 2 mm rain in the window, no more than 10 mm in the 48 hours before, visibility over 5 km.",
};

function StarterTemplates({ d }: { d: SpotDetail }) {
  const suggested = suggestTemplateKey(d.spot.activity);
  const [busy, setBusy] = useState<string | null>(null);
  const propose = useActionMutation("propose-rule", {
    onSuccess: () => toast.success("Starter rule drafted. Check it, then approve."),
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setBusy(null),
  });
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Start from a template</p>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Starter templates">
        {TEMPLATES.map((t) => (
          <button
            key={t.key}
            type="button"
            disabled={propose.isPending}
            aria-busy={busy === t.key}
            className={t.key === suggested ? btn.signal : btn.line}
            onClick={() => {
              setBusy(t.key);
              propose.mutate({
                spotId: d.spot.id,
                sourceText: t.sourceText,
                body: t.body,
                reason: `Starter template: ${t.label}`,
              });
            }}
          >
            {busy === t.key ? "Drafting…" : t.label}
            {t.key === suggested && busy !== t.key && <span className="font-plex text-[11px] font-normal">suggested</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function AskForRule({ d }: { d: SpotDetail }) {
  const key = Object.keys(RULE_EXAMPLES).find((k) => d.spot.activity.toLowerCase().includes(k.slice(0, 4)));
  const example = (key && RULE_EXAMPLES[key]) || RULE_EXAMPLES.cycling!;
  const [text, setText] = useState("");
  return (
    <form
      className="mx-5 mt-5 border border-foreground bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim().length < 5) return;
        void askAgent(
          `Make a rule for ${d.spot.name} (${d.spot.activity}): ${text.trim()}`,
          `Spot Rules. spotId=${d.spot.id}. No rule yet. Turn the user's words into a typed rule with propose-rule; keep the user's words as sourceText.`,
        ).then((sent) => sent && setText(""));
      }}
    >
      <h3 className="font-display text-xl font-semibold">What does a good day look like here?</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Pick a starter and tune it later, or say it the way you'd tell a friend. Nothing goes live until you approve it.
      </p>
      <StarterTemplates d={d} />
      <label htmlFor="rule-text" className="mt-4 block text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Or describe it to the agent
      </label>
      <textarea
        id="rule-text"
        rows={4}
        className={`${field} mt-2 h-auto py-2 leading-relaxed`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={example}
      />
      <div className="mt-2 flex items-center gap-2">
        <button type="button" className={btn.ghost} onClick={() => setText(example)}>
          Use example
        </button>
        <button type="submit" className={`${btn.solid} ml-auto`} disabled={text.trim().length < 5}>
          <Robot size={16} /> Draft my rule
        </button>
      </div>
    </form>
  );
}

/* ---------- Draft ---------- */

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function DraftCard({ d, onApproved }: { d: SpotDetail; onApproved: (p: Payoff) => void }) {
  const draft = d.draft!;
  const qc = useQueryClient();
  const approving = useRef<{ spotId: string; isNew: boolean; effect: NonNullable<SpotDetail["draft"]>["effect"] } | null>(null);
  const decide = useActionMutation<{ status: string; version: number | null }>("decide-rule-draft", {
    onSuccess: (r, vars: any) => {
      void qc.invalidateQueries({ queryKey: ["action"] });
      if (vars?.decision !== "approve") {
        toast.success("Draft dropped");
        return;
      }
      const snap = approving.current;
      approving.current = null;
      const version = r.version ?? 0;
      const past = snap?.effect?.backtestChanges ?? [];
      const next = snap?.effect?.forecastChanges ?? [];
      if (snap?.isNew) {
        const go = snap.effect?.backtestCounts.GO;
        toast.success(go === undefined ? `Rule v${version} live` : `Rule v${version} live: ${plural(go, "GO day")} in the past 30`);
      } else if (!past.length && !next.length) {
        toast.success(`Rule v${version} live: no days changed`);
      } else {
        toast.success(`Rule v${version} live: ${plural(past.length, "past day")} and ${plural(next.length, "upcoming day")} changed`);
      }
      onApproved({ spotId: snap?.spotId ?? draft.id, version, dates: [...past, ...next].map((c) => c.date) });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const diff = diffRules(d.activeRule?.body ?? null, draft.body);
  const eff = draft.effect;
  const isNew = !d.activeRule;
  const [tweaking, setTweaking] = useState(false);
  return (
    <section className="mx-5 mt-5 border-2 border-signal bg-card" aria-label="Rule draft waiting for you">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <Robot size={16} className="text-signal" />
        <h3 className="text-[13px] font-semibold">{isNew ? "Agent drafted your rule" : "Agent proposes a change"}</h3>
        <span className="ml-auto font-plex text-[11px] text-muted-foreground">not live until you approve</span>
      </div>
      {draft.reason && <p className="px-4 pt-3 text-sm">{draft.reason}</p>}
      {isNew && <p className="px-4 pt-3 font-display text-[17px] italic leading-snug">“{draft.sourceText}”</p>}
      <ul className="mx-4 my-3 border border-border font-plex text-[12.5px]">
        <li className="border-b border-border px-3 py-1.5">
          <span className="text-muted-foreground">window </span>
          {diff.windowChanged && d.activeRule && (
            <span className="mr-2 text-muted-foreground line-through">{windowText(d.activeRule.body)}</span>
          )}
          {windowText(draft.body)}
        </li>
        {diff.conditions.map((c, i) => (
          <li
            key={i}
            className={`border-b border-border px-3 py-1.5 last:border-b-0 ${
              c.kind === "removed" ? "bg-muted text-muted-foreground line-through" : c.kind === "same" ? "" : "bg-signal/10"
            }`}
          >
            {c.kind === "added" && !isNew && <span className="mr-1.5 text-signal">+</span>}
            {c.kind === "removed" && <span className="mr-1.5">−</span>}
            {c.kind === "changed" && (
              <span className="mr-2 text-muted-foreground line-through">
                {formatCondition(c.before)}
                {c.before.severity === "soft" ? " soft" : ""}
              </span>
            )}
            {c.kind !== "removed" ? formatCondition(c.after) : formatCondition(c.before)}
            {c.kind !== "removed" && c.after.severity === "soft" && <span className="ml-1.5 text-muted-foreground">soft</span>}
            {c.kind !== "removed" && c.after.note && (
              <span className="ml-2 font-sans text-[11.5px] italic text-muted-foreground">“{c.after.note}”</span>
            )}
          </li>
        ))}
      </ul>
      {eff && (
        <div className="space-y-1 px-4 pb-3 text-[13px]">
          {isNew ? (
            <p>
              Past 30 days under this rule: <Counts counts={eff.backtestCounts} />
            </p>
          ) : (
            <>
              <p>
                <b>{eff.backtestChanges.length}</b> of the past 30 days change
                {eff.backtestChanges.length > 0 && ": "}
                <ChangeList changes={eff.backtestChanges} />
              </p>
              <p>
                <b>{eff.forecastChanges.length}</b> of the next 7 days change
                {eff.forecastChanges.length > 0 && ": "}
                <ChangeList changes={eff.forecastChanges} />
              </p>
            </>
          )}
          <WeekStrip verdicts={eff.forecast} compact />
        </div>
      )}
      {eff?.feedbackCheck && eff.feedbackCheck.length > 0 && <FeedbackCheck rows={eff.feedbackCheck} />}
      <div className="flex gap-2 border-t border-border px-4 py-3">
        <button
          type="button"
          className={btn.signal}
          disabled={decide.isPending}
          onClick={() => {
            approving.current = { spotId: d.spot.id, isNew, effect: eff };
            decide.mutate({ draftId: draft.id, decision: "approve" });
          }}
        >
          <Check size={16} weight="bold" /> {isNew ? "Approve rule" : "Approve change"}
        </button>
        <button
          type="button"
          className={btn.line}
          disabled={decide.isPending}
          onClick={() => decide.mutate({ draftId: draft.id, decision: "reject" })}
        >
          Reject
        </button>
        <button
          type="button"
          className={`${btn.ghost} ml-auto`}
          aria-expanded={tweaking}
          onClick={() => setTweaking((v) => !v)}
        >
          <ChatCircleText size={15} /> Tweak with agent
        </button>
      </div>
      {tweaking && <ChangeInWords d={d} draftId={draft.id} autoFocus />}
    </section>
  );
}

function FeedbackCheck({ rows }: { rows: FeedbackCheckRow[] }) {
  const [open, setOpen] = useState(false);
  const fixes = rows.filter((r) => !r.wasMatching && r.matches);
  const keeps = rows.filter((r) => r.wasMatching && r.matches);
  const breaks = rows.filter((r) => r.wasMatching && !r.matches);
  const still = rows.filter((r) => !r.wasMatching && !r.matches);
  const parts = [
    `Fixes ${plural(fixes.length, "note")}`,
    `keeps ${keeps.length}`,
    `breaks ${breaks.length}`,
    ...(still.length ? [`${still.length} still wrong`] : []),
  ];
  const ordered: [FeedbackCheckRow, "breaks" | "fixes" | "keeps" | "still"][] = [
    ...breaks.map((r) => [r, "breaks"] as [FeedbackCheckRow, "breaks"]),
    ...fixes.map((r) => [r, "fixes"] as [FeedbackCheckRow, "fixes"]),
    ...keeps.map((r) => [r, "keeps"] as [FeedbackCheckRow, "keeps"]),
    ...still.map((r) => [r, "still"] as [FeedbackCheckRow, "still"]),
  ];
  const labels = { breaks: "Breaks", fixes: "Fixes", keeps: "Still matches", still: "Still wrong" };
  return (
    <div className="px-4 pb-3 text-[13px]">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="feedback-check-list"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-9 w-full items-center gap-1.5 text-left font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {breaks.length > 0 && <Warning size={15} weight="fill" className="shrink-0 text-signal" aria-hidden />}
        <span>{parts.join(", ")}</span>
        {open ? <CaretUp size={14} className="ml-auto shrink-0" aria-hidden /> : <CaretDown size={14} className="ml-auto shrink-0" aria-hidden />}
      </button>
      {open && (
        <ul id="feedback-check-list" className="mt-1 border border-border">
          {ordered.map(([r, kind]) => (
            <li
              key={r.feedbackId}
              className={`flex items-start gap-2 border-b border-border px-3 py-1.5 last:border-b-0 ${
                kind === "breaks" ? "border-l-2 border-l-signal bg-signal/10" : ""
              }`}
            >
              {kind === "breaks" ? (
                <Warning size={14} weight="fill" className="mt-0.5 shrink-0 text-signal" aria-hidden />
              ) : kind === "still" ? (
                <X size={14} weight="bold" className="mt-0.5 shrink-0" aria-hidden />
              ) : (
                <Check size={14} weight="bold" className="mt-0.5 shrink-0" aria-hidden />
              )}
              <span>
                <span className={kind === "breaks" ? "font-bold" : "font-medium"}>{labels[kind]}</span> {longDate(r.date)} (you said {r.userSays})
                <span className="ml-1.5 font-plex text-[11.5px] text-muted-foreground">
                  {r.before ?? "—"} → {r.after}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Counts({ counts }: { counts: Record<string, number> }) {
  return (
    <span className="font-plex text-[12.5px]">
      <span className="verdict-GO">GO {counts.GO ?? 0}</span> · <span className="verdict-MAYBE">MAYBE {counts.MAYBE ?? 0}</span> ·{" "}
      <span className="verdict-NO">NO {counts.NO ?? 0}</span>
    </span>
  );
}

function ChangeList({ changes }: { changes: Change[] }) {
  const shown = changes.slice(0, 6);
  return (
    <span className="font-plex text-[12px]">
      {shown.map((c, i) => (
        <span key={c.date}>
          {i > 0 && ", "}
          {dayLabel(c.date)} <span className={`verdict-${c.from}`}>{c.from}</span>→
          <span className={`verdict-${c.to}`}>{c.to}</span>
        </span>
      ))}
      {changes.length > shown.length && ` +${changes.length - shown.length} more`}
    </span>
  );
}

/* ---------- Verdicts ---------- */

/** The first failing condition, or a short "ok" line, for the narrow week cells. */
function shortReason(v: DayVerdict) {
  const fail = v.conditions.find((c) => !c.pass && c.severity === "hard") ?? v.conditions.find((c) => !c.pass);
  if (fail) return fail.text.replace(/\s*\(limit[^)]*\)/, "");
  if (v.result === "GO") return "all clear";
  return v.result === "SKIP" ? "day off" : "";
}

function WeekStrip({
  verdicts,
  selected,
  onSelect,
  compact,
  flash,
}: {
  verdicts: DayVerdict[];
  selected?: string | null;
  onSelect?: (date: string) => void;
  compact?: boolean;
  flash?: Set<string> | undefined;
}) {
  return (
    <div className={`grid grid-cols-7 gap-1 ${compact ? "pt-2" : ""}`}>
      {verdicts.map((v, i) => {
        const Tag = onSelect ? "button" : "div";
        const [weekday, dateNum] = dayLabel(v.date).split(" ");
        const label = v.result === "UNKNOWN" ? "—" : v.result === "SKIP" ? "off" : v.result;
        const long = label.length > 3;
        const go = v.result === "GO";
        return (
          <Tag
            key={v.date}
            {...(onSelect ? { type: "button" as const, onClick: () => onSelect(v.date), "aria-pressed": selected === v.date } : {})}
            title={v.reason}
            style={{ animationDelay: `${i * 40}ms` }}
            className={`spot-cell-in cell-${v.result} flex min-w-0 flex-col items-center justify-start border border-foreground/25 px-0.5 text-center ${compact ? "py-1.5" : "min-h-[88px] py-2"} ${
              onSelect ? "transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" : ""
            } ${selected === v.date ? "shadow-[inset_0_0_0_3px_hsl(var(--foreground))]" : ""} ${flash?.has(v.date) ? "day-flash" : ""}`}
          >
            {compact ? (
              <span className="block font-plex text-[11px] leading-tight">{dayLabel(v.date)}</span>
            ) : (
              <>
                <span className="flex items-center gap-0.5 font-plex text-[11px] leading-tight">
                  {weekday}
                  {go && <Check size={12} weight="bold" aria-hidden />}
                </span>
                <span className="block font-plex text-[11px] leading-tight">{dateNum}</span>
              </>
            )}
            <span
              className={`mt-1 inline-flex items-center gap-0.5 font-display leading-tight ${
                compact ? "text-sm" : long ? "text-[11px] tracking-tight sm:text-[13px]" : "text-xl"
              } ${go ? "font-extrabold" : v.result === "MAYBE" ? "bg-card/85 px-0.5 font-semibold italic" : v.result === "NO" ? "font-semibold line-through decoration-2" : "font-normal"}`}
            >
              {compact && go && <Check size={12} weight="bold" aria-hidden />}
              {label}
            </span>
            {!compact && (
              <>
                <span className="mt-1 block font-plex text-[11px] leading-tight">
                  {v.bestStart && v.bestEnd ? `${v.bestStart.slice(0, 2)}–${v.bestEnd.slice(0, 2)}h` : ""}
                </span>
                <span className="mt-1 hidden text-[11px] leading-tight sm:block">
                  <span className="line-clamp-3 block">{shortReason(v)}</span>
                </span>
              </>
            )}
          </Tag>
        );
      })}
    </div>
  );
}

function NextWeek({ d, day, onDay, flash }: { d: SpotDetail; day: string | null; onDay: (v: string | null) => void; flash?: Set<string> | undefined }) {
  const verdicts = d.forecast!;
  const sel = verdicts.find((v) => v.date === day) ?? null;
  return (
    <div className="px-5 pt-4">
      <WeekStrip verdicts={verdicts} selected={day} onSelect={(x) => onDay(x === day ? null : x)} flash={flash} />
      {sel ? (
        <DayDetail key={sel.date} d={d} v={sel} onClose={() => onDay(null)} />
      ) : (
        <p className="mt-3 text-[13px] text-muted-foreground">Tap a day to see why. If a call looks wrong, tell the agent.</p>
      )}
    </div>
  );
}

function PastMonth({ d, day, onDay, flash }: { d: SpotDetail; day: string | null; onDay: (v: string | null) => void; flash?: Set<string> | undefined }) {
  const q = useActionQuery<Backtest>("backtest-rule", { spotId: d.spot.id, days: 30 });
  if (q.isLoading) return <Skeleton className="mx-5 mt-4 h-40 rounded-none" />;
  if (q.error || !q.data?.active) return <p className="px-5 pt-4 text-sm text-destructive">{(q.error as Error)?.message ?? "No backtest."}</p>;
  const bt = q.data;
  const verdicts = bt.active!.verdicts;
  const draftByDate = new Map((bt.draft?.verdicts ?? []).map((v) => [v.date, v]));
  const fbByDate = new Map(d.feedback.map((f) => [f.date, f]));
  const sel = verdicts.find((v) => v.date === day) ?? null;
  const firstDow = verdicts[0] ? new Date(`${verdicts[0].date}T00:00:00Z`).getUTCDay() : 0;
  return (
    <div className="px-5 pt-4">
      <p className="text-[13px]">
        Rule v{bt.active!.version} on real weather, last {bt.days} days: <Counts counts={bt.active!.counts} />
      </p>
      {bt.draft && (
        <p className="mt-1 text-[13px]">
          With the draft: <Counts counts={bt.draft.counts} /> · <b>{bt.changes.length}</b> days change (outlined)
        </p>
      )}
      <div className="mt-3 grid grid-cols-7 gap-1 font-plex text-[11px] text-muted-foreground">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((w) => (
          <span key={w} className="text-center">{w}</span>
        ))}
        {Array.from({ length: firstDow }).map((_, i) => (
          <span key={`pad${i}`} />
        ))}
        {verdicts.map((v) => {
          const dv = draftByDate.get(v.date);
          const changed = dv && dv.result !== v.result;
          const fb = fbByDate.get(v.date);
          return (
            <button
              key={v.date}
              type="button"
              onClick={() => onDay(v.date === day ? null : v.date)}
              aria-pressed={day === v.date}
              title={`${longDate(v.date)}: ${v.result}${changed ? ` → ${dv!.result} with draft` : ""} · ${v.reason}`}
              className={`cell-${v.result} relative flex h-10 flex-col items-center justify-center border text-[11px] font-medium leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                changed ? "border-2 border-foreground" : "border-foreground/20"
              } ${day === v.date ? "ring-2 ring-foreground ring-offset-1" : ""} ${flash?.has(v.date) ? "day-flash" : ""}`}
            >
              <span>{Number(v.date.slice(8))}</span>
              <span className="text-[11px]">{changed ? `→${dv!.result}` : v.result === "GO" ? "GO" : v.result === "NO" ? "NO" : v.result === "MAYBE" ? "?" : ""}</span>
              {fb && <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-foreground" aria-label="you left feedback" />}
            </button>
          );
        })}
      </div>
      {sel ? (
        <DayDetail key={sel.date} d={d} v={sel} onClose={() => onDay(null)} past />
      ) : (
        <p className="mt-3 text-[13px] text-muted-foreground">Remember one of these days? Tap it and say if the call was right.</p>
      )}
    </div>
  );
}

function DayDetail({ d, v, onClose, past }: { d: SpotDetail; v: DayVerdict; onClose: () => void; past?: boolean }) {
  const [says, setSays] = useState<"GO" | "MAYBE" | "NO" | null>(null);
  const [reason, setReason] = useState("");
  const box = useRef<HTMLElement>(null);
  const existing = d.feedback.find((f) => f.date === v.date);
  useEffect(() => {
    box.current?.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, []);
  const give = useActionMutation<{ feedbackId: string; appSaid: string }>("give-feedback", {
    onSuccess: (r, vars: any) => {
      void askAgent(
        feedbackMessage(d, v.date, r.appSaid, vars.userSays, vars.reason),
        feedbackContext(d, r.feedbackId),
        "Noted. Sent to the agent for a fix",
      ).then((sent) => {
        if (sent) {
          setSays(null);
          setReason("");
        }
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const options = (["GO", "MAYBE", "NO"] as const).filter((o) => o !== v.result);
  return (
    <section ref={box} className="spot-anim mt-4 border border-foreground bg-card" aria-label={`Details for ${longDate(v.date)}`}>
      <div className="flex items-baseline gap-3 border-b border-border px-4 py-2.5">
        <span className={`verdict-${v.result} font-display text-2xl`}>{v.result}</span>
        <span className="text-sm font-medium">{longDate(v.date)}</span>
        <span className="font-plex text-xs text-muted-foreground">{shortWindow(v)}</span>
        <button type="button" onClick={onClose} className={`${btn.ghost} ml-auto min-h-0`} aria-label="Close day">
          <X size={15} />
        </button>
      </div>
      <p className="px-4 pt-2.5 text-sm">{v.reason}</p>
      {v.conditions.length > 0 && (
        <ul className="px-4 py-2.5 font-plex text-[12.5px]">
          {v.conditions.map((c) => (
            <li key={c.id} className="flex items-center gap-2 py-0.5">
              <span
                className={`inline-flex h-4 w-4 shrink-0 items-center justify-center ${
                  c.pass ? "text-signal" : c.severity === "hard" ? "bg-foreground text-background" : "border border-foreground"
                }`}
                aria-label={c.pass ? "pass" : c.severity === "hard" ? "hard fail" : "soft fail"}
              >
                {c.pass ? <Check size={12} weight="bold" /> : <X size={11} weight="bold" />}
              </span>
              <span className={c.pass ? "" : "font-medium"}>{c.text}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-border bg-muted/40 px-4 py-3">
        {existing ? (
          <div>
            <p className="text-[13px]">
              You said <b>{existing.userSays}</b>: “{existing.reasonText}”{" "}
              <span className="text-muted-foreground">
                {existing.status === "resolved" ? `· fixed in v${existing.resolvedByVersion}` : "· waiting on a rule change"}
              </span>
            </p>
            {existing.status === "open" && !d.draft && (
              <button
                type="button"
                className={`${btn.line} mt-2`}
                onClick={() =>
                  void askAgent(
                    feedbackMessage(d, v.date, existing.verdict?.result ?? v.result, existing.userSays, existing.reasonText),
                    feedbackContext(d, existing.id),
                    "Sent to the agent again",
                  )
                }
              >
                <Robot size={15} /> Ask the agent again
              </button>
            )}
          </div>
        ) : v.result === "UNKNOWN" || v.result === "SKIP" ? null : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!says || reason.trim().length < 2) return;
              give.mutate({ spotId: d.spot.id, date: v.date, userSays: says, reason: reason.trim() });
            }}
          >
            <p className="text-[13px] font-medium">{past ? "Was this call right?" : "Does this call look wrong?"} It should be:</p>
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="What it should be">
              {options.map((o) => (
                <button
                  key={o}
                  type="button"
                  aria-pressed={says === o}
                  onClick={() => setSays(o)}
                  className={says === o ? btn.solid : btn.line}
                >
                  {o}
                </button>
              ))}
            </div>
            {says && (
              <div className="mt-2 flex gap-2">
                <label htmlFor="fb-reason" className="sr-only">Why</label>
                <input
                  id="fb-reason"
                  autoFocus
                  className={field}
                  value={reason}
                  maxLength={400}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={says === "GO" ? "Why? e.g. gusts 33 were fine" : "Why? e.g. too gusty on the descent"}
                />
                <button type="submit" className={btn.solid} disabled={give.isPending || reason.trim().length < 2}>
                  {give.isPending ? "Sending…" : "Send"}
                </button>
              </div>
            )}
          </form>
        )}
      </div>
    </section>
  );
}

/* ---------- History ---------- */

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const condText = (c: Condition) => `${formatCondition(c)}${c.severity === "soft" ? " (soft)" : ""}`;

function VersionDiff({ prev, next }: { prev: RuleBody; next: RuleBody }) {
  const diff = diffRules(prev, next);
  const lines = diff.conditions.filter((c) => c.kind !== "same");
  if (!diff.windowChanged && !lines.length) return null;
  return (
    <ul className="mt-1 font-plex text-[11.5px] leading-relaxed" aria-label="Changed from the previous version">
      {diff.windowChanged && (
        <li>
          <span className="text-muted-foreground">window </span>
          <span className="text-muted-foreground line-through">{windowText(prev)}</span> → {windowText(next)}
        </li>
      )}
      {lines.map((c, i) => (
        <li key={i}>
          {c.kind === "added" && <>+ {condText(c.after)}</>}
          {c.kind === "removed" && <span className="text-muted-foreground line-through">− {condText(c.before)}</span>}
          {c.kind === "changed" && (
            <>
              <span className="text-muted-foreground line-through">{condText(c.before)}</span> → {condText(c.after)}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

function History({ d }: { d: SpotDetail }) {
  const items = d.history.filter((h) => h.status !== "rejected" || h.createdBy === "agent");
  return (
    <ol className="px-5 pt-4">
      {items.map((h) => {
        const at = d.history.findIndex((x) => x.id === h.id);
        const prev = d.history.slice(at + 1).find((x) => x.version !== null);
        const diff = prev ? <VersionDiff prev={prev.body} next={h.body} /> : null;
        const full = `${windowText(h.body)} · ${h.body.conditions.map((c) => formatCondition(c)).join(" · ")}`;
        return (
          <li key={h.id} className="grid grid-cols-[52px_1fr] gap-3 border-b border-border py-3 last:border-b-0">
            <span className="font-display text-xl font-bold">{h.version ? `v${h.version}` : "—"}</span>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-x-2 text-[13px]">
                {h.createdBy === "agent" ? <Robot size={14} aria-hidden /> : <User size={14} aria-hidden />}
                <span className="font-medium">
                  {h.createdBy !== "agent"
                    ? "You edited"
                    : h.status !== "rejected"
                      ? "Agent proposed · you approved"
                      : h.reason === "Replaced by a newer draft"
                        ? "Agent proposed · replaced by a newer draft"
                        : "Agent proposed · you rejected"}
                </span>
                <span className="font-plex text-[11px] text-muted-foreground">{new Date(h.decidedAt ?? h.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>
                {h.status === "active" && <span className="bg-foreground px-1.5 font-plex text-[11px] text-background">LIVE</span>}
              </p>
              {h.reason && <p className="mt-0.5 text-[13px] text-muted-foreground">{h.reason}</p>}
              {h.feedbackText && (
                <p className="mt-0.5 text-[13px]" title={h.feedbackText}>
                  because you said: “{clip(h.feedbackText, 140)}”
                  {h.feedbackDate && <span className="text-muted-foreground"> ({longDate(h.feedbackDate)})</span>}
                </p>
              )}
              {diff ?? (
                <p className="mt-1 font-plex text-[11.5px] leading-relaxed" title={full}>
                  {full}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
