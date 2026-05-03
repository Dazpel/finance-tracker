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
  details?: { error?: string };
};

type ExpoPushResponse = {
  data?: ExpoPushTicket[];
};

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
      console.log(`[notifier] no push tokens for userId=${userId}; skipping`);
      return;
    }

    const messages = alerts.flatMap((alert) =>
      tokens.map((t) => ({ to: t.token, ...formatAlertPush(alert) }))
    );

    console.log(
      `[notifier] sending ${messages.length} push message(s) to userId=${userId} (${alerts.length} alert(s) × ${tokens.length} token(s))`
    );

    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(messages),
    });
    if (!res.ok) {
      throw new Error(`Expo push HTTP ${res.status}`);
    }

    const json = (await res.json()) as ExpoPushResponse;
    const tickets = json.data ?? [];
    const stale = new Set<string>();
    tickets.forEach((ticket, i) => {
      if (
        ticket.status === "error" &&
        ticket.details?.error === "DeviceNotRegistered"
      ) {
        const tokenId = tokens[i % tokens.length].id;
        stale.add(tokenId);
      }
    });

    for (const id of stale) {
      try {
        await prisma.pushToken.delete({ where: { id } });
      } catch (e) {
        console.error(`[notifier] failed to delete stale PushToken id=${id}:`, e);
      }
    }
  }
}

export async function getDefaultNotifier(userId: string): Promise<Notifier> {
  if (process.env.DRY_RUN_NOTIFICATIONS === "true") return new DryRunNotifier();
  const tokenCount = await prisma.pushToken.count({ where: { userId } });
  if (tokenCount > 0) return new ExpoPushNotifier();
  return new EmailNotifier();
}
