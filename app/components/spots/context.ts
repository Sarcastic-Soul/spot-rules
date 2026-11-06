import { useOutletContext } from "react-router";

export type Pin = { lat: number; lon: number };

export type SpotsOutletContext = {
  pinMode: boolean;
  setPinMode: (on: boolean) => void;
  pendingPin: Pin | null;
  setPendingPin: (p: Pin | null) => void;
};

export function useSpotsContext() {
  return useOutletContext<SpotsOutletContext>();
}

/** Plain button styles shared by the Spot Rules screens. */
export const btn = {
  solid:
    "inline-flex min-h-9 items-center justify-center gap-1.5 bg-foreground px-3.5 text-[13px] font-semibold text-background transition-colors hover:bg-foreground/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50",
  line:
    "inline-flex min-h-9 items-center justify-center gap-1.5 border border-foreground px-3.5 text-[13px] font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50",
  ghost:
    "inline-flex min-h-9 items-center justify-center gap-1.5 px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
  signal:
    "inline-flex min-h-9 items-center justify-center gap-1.5 bg-signal px-3.5 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50",
};

export const field =
  "h-10 w-full border border-border bg-card px-3 text-sm placeholder:text-muted-foreground focus-visible:border-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground";
