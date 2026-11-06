import { sql } from "drizzle-orm";
import { doublePrecision, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";

import type { DayVerdict, HourlyWeather, RuleBody } from "../../shared/rules.js";

// Spot Rules data is private to its owner: every table carries owner_email and
// every action filters by ctx.userEmail.

export const spots = pgTable("spots", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  activity: text("activity").notNull(),
  lat: doublePrecision("lat").notNull(),
  lon: doublePrecision("lon").notNull(),
  timezone: text("timezone"),
  ownerEmail: text("owner_email").notNull(),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

/** Every rule version. One `active` row per spot; at most one open `draft`. */
export const rules = pgTable("rules", {
  id: text("id").primaryKey(),
  spotId: text("spot_id").notNull(),
  version: integer("version"),
  body: jsonb("body").$type<RuleBody>().notNull(),
  sourceText: text("source_text").notNull(),
  status: text("status", {
    enum: ["draft", "active", "archived", "rejected"],
  }).notNull(),
  createdBy: text("created_by", { enum: ["user", "agent"] }).notNull(),
  reason: text("reason"),
  feedbackId: text("feedback_id"),
  ownerEmail: text("owner_email").notNull(),
  createdAt: text("created_at").notNull().default(sql`now()`),
  decidedAt: text("decided_at"),
});

/** Latest hourly weather per spot (past ~35 days + next 8 days). */
export const weatherCache = pgTable("weather_cache", {
  spotId: text("spot_id").primaryKey(),
  timezone: text("timezone").notNull(),
  hourly: jsonb("hourly").$type<HourlyWeather>().notNull(),
  fetchedAt: text("fetched_at").notNull(),
  ownerEmail: text("owner_email").notNull(),
});

/** "The app called this day wrong" notes from the user. */
export const feedback = pgTable("feedback", {
  id: text("id").primaryKey(),
  spotId: text("spot_id").notNull(),
  date: text("date").notNull(),
  ruleVersion: integer("rule_version").notNull(),
  userSays: text("user_says", { enum: ["GO", "MAYBE", "NO"] }).notNull(),
  reasonText: text("reason_text").notNull(),
  verdict: jsonb("verdict").$type<DayVerdict>().notNull(),
  status: text("status", { enum: ["open", "resolved", "dismissed"] })
    .notNull()
    .default("open"),
  resolvedByVersion: integer("resolved_by_version"),
  ownerEmail: text("owner_email").notNull(),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

/** Per-user settings. replay_date freezes "today" to a past date. */
export const userSettings = pgTable("spot_user_settings", {
  ownerEmail: text("owner_email").primaryKey(),
  replayDate: text("replay_date"),
  updatedAt: text("updated_at").notNull().default(sql`now()`),
});
