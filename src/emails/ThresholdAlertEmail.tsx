import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  pixelBasedPreset,
  Preview,
  Row,
  Section,
  Tailwind,
  Text,
} from "react-email";
import type { AlertEmailData } from "../lib/notifications/templates";

export type ThresholdAlertEmailProps = AlertEmailData;

export default function ThresholdAlertEmail({
  subject,
  monthLabel,
  alertCount,
  alerts,
  ctaUrl,
  reportsUrl,
}: ThresholdAlertEmailProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{subject}</Preview>
      <Tailwind
        config={{
          presets: [pixelBasedPreset],
          theme: {
            extend: {
              colors: {
                ink: "#1a1c1c",
                muted: "#444748",
                line: "#c4c7c7",
                surface: "#f9f9f9",
                surfaceLow: "#f3f3f3",
                primary: "#000000",
                warn: "#b25e00",
                danger: "#ba1a1a",
              },
            },
          },
        }}
      >
        <Body className="bg-surface font-sans text-ink m-0 p-0">
          <Container className="mx-auto max-w-[600px] bg-white px-6 py-10">
            <Section className="border-b border-line pb-6">
              <Text className="text-xs uppercase tracking-widest text-muted m-0">
                Money Eye · Budget Alert
              </Text>
              <Heading className="text-2xl font-semibold text-ink mt-2 mb-0">
                {alertCount === 1
                  ? "1 budget alert"
                  : `${alertCount} budget alerts`}
              </Heading>
              <Text className="text-xs uppercase tracking-widest text-muted mt-2 mb-0">
                {monthLabel}
              </Text>
            </Section>

            <Section className="pt-8">
              {alerts.map((a, i) => (
                <Section
                  key={`${a.category}-${i}`}
                  className="border border-line bg-surfaceLow p-5 mb-4"
                >
                  <Row>
                    <Column className="align-top">
                      <Text className="text-xs uppercase tracking-widest text-muted m-0">
                        {a.levelLabel}
                      </Text>
                      <Text className="text-lg font-semibold text-ink mt-1 mb-0">
                        {a.category}
                      </Text>
                    </Column>
                    <Column align="right" className="align-top">
                      <Text className="text-2xl font-semibold text-primary m-0">
                        {a.percent}%
                      </Text>
                    </Column>
                  </Row>
                  <Hr className="border-line my-3" />
                  <Row>
                    <Column>
                      <Text className="text-xs uppercase tracking-widest text-muted m-0">
                        Spent
                      </Text>
                      <Text className="text-sm font-semibold text-ink mt-1 mb-0">
                        {a.spentFormatted}
                      </Text>
                    </Column>
                    <Column align="right">
                      <Text className="text-xs uppercase tracking-widest text-muted m-0">
                        Limit
                      </Text>
                      <Text className="text-sm font-semibold text-ink mt-1 mb-0">
                        {a.limitFormatted}
                      </Text>
                    </Column>
                  </Row>
                  {a.overFormatted ? (
                    <Row>
                      <Column>
                        <Text className="text-xs uppercase tracking-widest text-danger mt-3 mb-0">
                          Over by {a.overFormatted}
                        </Text>
                      </Column>
                    </Row>
                  ) : null}
                </Section>
              ))}
            </Section>

            <Section className="pt-6 text-center">
              <Button
                href={ctaUrl}
                className="bg-primary text-white text-xs uppercase tracking-widest font-semibold px-8 py-4 box-border"
              >
                Review Thresholds
              </Button>
            </Section>

            <Section className="pt-6 text-center">
              <Link
                href={reportsUrl}
                className="text-xs uppercase tracking-widest text-muted underline"
              >
                Open Reports
              </Link>
            </Section>

            <Hr className="border-line my-10" />

            <Section>
              <Text className="text-xs text-muted text-center m-0">
                © {new Date().getFullYear()} Money Eye. All rights reserved.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

ThresholdAlertEmail.PreviewProps = {
  subject: "3 budget alerts for April 2026",
  monthLabel: "April 2026",
  alertCount: 3,
  alerts: [
    {
      category: "Groceries",
      levelLabel: "Warning · 70% reached",
      spentFormatted: "$290.00",
      limitFormatted: "$400.00",
      percent: 73,
      overFormatted: "",
    },
    {
      category: "Food & Drink",
      levelLabel: "Budget reached · 100%",
      spentFormatted: "$400.00",
      limitFormatted: "$400.00",
      percent: 100,
      overFormatted: "",
    },
    {
      category: "Shopping",
      levelLabel: "Over budget",
      spentFormatted: "$450.50",
      limitFormatted: "$300.00",
      percent: 150,
      overFormatted: "$150.50",
    },
  ],
  ctaUrl: "https://www.moneyeye.dev/thresholds",
  reportsUrl: "https://www.moneyeye.dev/reports",
} satisfies ThresholdAlertEmailProps;
