import { Resend } from "resend";
import * as React from "react";
import type { NotificationChannel } from "@prisma/client";
import prisma from "../prisma/prismaClient";
import { buildAlertEmailData, type Alert } from "./templates";
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

export function getDefaultNotifier(): Notifier {
  if (process.env.DRY_RUN_NOTIFICATIONS === "true") return new DryRunNotifier();
  return new EmailNotifier();
}
