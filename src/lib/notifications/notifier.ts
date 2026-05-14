import { Resend } from "resend";
import * as React from "react";
import type { NotificationChannel } from "@prisma/client";
import prisma from "../prisma/prismaClient";
import {
  buildAlertEmailData,
  formatAlertPush,
  type Alert,
} from "./templates";
import ThresholdAlertEmail from "../../emails/ThresholdAlertEmail";

export type { Alert } from "./templates";

export interface Notifier {
  channel: NotificationChannel;
  // Throws if the notifier is misconfigured. Called by checkThresholdsAndNotify
  // BEFORE any NotificationLog rows are written so a misconfigured deploy
  // doesn't leave dedupe-suppressed phantom rows behind.
  assertReady(): void;
  dispatch(userId: string, alerts: Alert[]): Promise<void>;
}

const baseUrl = (): string =>
  process.env.NEXTAUTH_URL ?? "http://localhost:3000";

export class EmailNotifier implements Notifier {
  readonly channel: NotificationChannel = "EMAIL";

  assertReady(): void {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("EmailNotifier: missing RESEND_API_KEY");
    }
    if (!process.env.EMAIL_FROM) {
      throw new Error("EmailNotifier: missing EMAIL_FROM");
    }
  }

  async dispatch(userId: string, alerts: Alert[]): Promise<void> {
    if (alerts.length === 0) return;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user?.email) {
      console.warn(`[notifier] no email for userId=${userId}; skipping`);
      return;
    }

    const data = buildAlertEmailData(alerts, baseUrl());
    const resend = new Resend(process.env.RESEND_API_KEY);

    console.log(
      `[notifier] sending email to ${user.email}: ${data.subject} (${alerts.length} alert${alerts.length === 1 ? "" : "s"})`
    );

    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM!,
      to: user.email,
      subject: data.subject,
      react: React.createElement(ThresholdAlertEmail, data),
    });

    if (error) {
      throw new Error(`Resend error: ${error.name} — ${error.message}`);
    }
  }
}

// Logs intended sends without dispatching. Selected when DRY_RUN_NOTIFICATIONS=true.
export class DryRunNotifier implements Notifier {
  readonly channel: NotificationChannel = "EMAIL";

  assertReady(): void {
    // No external config required.
  }

  async dispatch(userId: string, alerts: Alert[]): Promise<void> {
    if (alerts.length === 0) return;
    console.log(
      `[notifier:DRY_RUN] would email user=${userId}, ${alerts.length} alert(s):`,
      alerts.map((a) => `${a.category}/${a.level}`).join(", ")
    );
  }
}

type ExpoPushTicket = {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
};

type ExpoPushResponse = {
  data?: ExpoPushTicket[];
};

// Expo's push API rejects requests larger than 100 messages.
const EXPO_MAX_BATCH_SIZE = 100;

// Thrown by ExpoPushNotifier when the user has no push tokens at dispatch
// time. Surfaces a separate signal from successful dispatch so callers (e.g.
// PushOrEmailNotifier) can fall back to email instead of silently dropping
// alerts when the last token vanished between notifier selection and dispatch.
export class NoPushTokensError extends Error {
  constructor(public readonly userId: string) {
    super(`no push tokens for user ${userId}`);
    this.name = "NoPushTokensError";
  }
}

export class ExpoPushNotifier implements Notifier {
  readonly channel: NotificationChannel = "PUSH";

  assertReady(): void {
    // Expo push API requires no server-side credentials.
  }

  async dispatch(userId: string, alerts: Alert[]): Promise<void> {
    if (alerts.length === 0) return;

    const tokens = await prisma.pushToken.findMany({
      where: { userId },
      select: { id: true, token: true },
    });
    if (tokens.length === 0) {
      throw new NoPushTokensError(userId);
    }

    // Carry tokenId alongside each message so ticket-to-token mapping survives
    // batching. The previous `tokens[i % tokens.length]` trick relied on the
    // exact alerts × tokens flat ordering and breaks once we slice into chunks.
    const entries = alerts.flatMap((alert) =>
      tokens.map((t) => ({
        tokenId: t.id,
        message: { to: t.token, ...formatAlertPush(alert) },
      }))
    );

    const batchCount = Math.ceil(entries.length / EXPO_MAX_BATCH_SIZE);
    console.log(
      `[notifier] sending ${entries.length} push message(s) to userId=${userId} (${alerts.length} alert(s) × ${tokens.length} token(s)) in ${batchCount} batch(es)`
    );

    const stale = new Set<string>();
    const otherErrors: { tokenId: string; reason: string }[] = [];

    for (let start = 0; start < entries.length; start += EXPO_MAX_BATCH_SIZE) {
      const batch = entries.slice(start, start + EXPO_MAX_BATCH_SIZE);
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(batch.map((e) => e.message)),
      });
      if (!res.ok) {
        throw new Error(`Expo push HTTP ${res.status}`);
      }

      const json = (await res.json()) as ExpoPushResponse;
      const tickets = json.data ?? [];
      tickets.forEach((ticket, i) => {
        if (ticket.status !== "error") return;
        const tokenId = batch[i]?.tokenId;
        if (!tokenId) return;
        if (ticket.details?.error === "DeviceNotRegistered") {
          stale.add(tokenId);
        } else {
          otherErrors.push({
            tokenId,
            reason:
              ticket.details?.error ?? ticket.message ?? "unknown Expo error",
          });
        }
      });
    }

    for (const id of stale) {
      try {
        await prisma.pushToken.delete({ where: { id } });
      } catch (e) {
        console.error(`[notifier] failed to delete stale PushToken id=${id}:`, e);
      }
    }

    // Non-DeviceNotRegistered tickets aren't recoverable by deleting tokens —
    // they're real delivery failures. Surface them so checkThresholdsAndNotify
    // logs the dispatch as failed instead of treating the partially-broken
    // batch as success (NotificationLog rows are already committed and would
    // otherwise permanently dedupe these alerts).
    if (otherErrors.length > 0) {
      const summary = otherErrors
        .map((e) => `${e.tokenId}: ${e.reason}`)
        .join("; ");
      throw new Error(
        `Expo push: ${otherErrors.length} ticket error(s) — ${summary}`
      );
    }
  }
}

// Selected when the user has at least one push token. Tries push first; if
// the user's last token was deleted between getDefaultNotifier's count() and
// dispatch (via NoPushTokensError), falls back to email so the alert isn't
// silently dropped.
export class PushOrEmailNotifier implements Notifier {
  readonly channel: NotificationChannel = "PUSH";

  constructor(
    private readonly push: ExpoPushNotifier,
    private readonly email: EmailNotifier
  ) {}

  assertReady(): void {
    // Push is the primary channel — assert it's ready. The email fallback
    // only fires on the NoPushTokensError edge (the user's last token
    // vanished mid-flight); we deliberately don't require email config
    // here so a push-only deploy without Resend keys doesn't blackhole
    // alerts for every push-equipped user. If the fallback ever runs
    // with broken email config, dispatch will throw — the already-committed
    // NotificationLog rows will dedupe-suppress retry, but that's an
    // acceptable tradeoff for a rare-edge fallback.
    this.push.assertReady();
  }

  async dispatch(userId: string, alerts: Alert[]): Promise<void> {
    try {
      await this.push.dispatch(userId, alerts);
    } catch (e) {
      if (e instanceof NoPushTokensError) {
        console.log(
          `[notifier] push tokens vanished mid-flight for userId=${userId}; falling back to email`
        );
        await this.email.dispatch(userId, alerts);
        return;
      }
      throw e;
    }
  }
}

export async function getDefaultNotifier(userId: string): Promise<Notifier> {
  if (process.env.DRY_RUN_NOTIFICATIONS === "true") return new DryRunNotifier();
  const tokenCount = await prisma.pushToken.count({ where: { userId } });
  if (tokenCount > 0) {
    return new PushOrEmailNotifier(new ExpoPushNotifier(), new EmailNotifier());
  }
  return new EmailNotifier();
}
