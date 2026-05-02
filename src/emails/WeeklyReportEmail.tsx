import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  pixelBasedPreset,
  Preview,
  Row,
  Section,
  Tailwind,
  Text,
} from "react-email";

export type WeeklyReportCategory = {
  name: string;
  amountFormatted: string;
};

export type WeeklyReportEmailProps = {
  periodLabel: string;
  expensesFormatted: string;
  revenueFormatted: string;
  categories: WeeklyReportCategory[];
  reportsUrl: string;
};

const titleCase = (s: string) =>
  s
    .split(" ")
    .map((w) => (w === "&" ? "&" : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");

export default function WeeklyReportEmail({
  periodLabel,
  expensesFormatted,
  revenueFormatted,
  categories,
  reportsUrl,
}: WeeklyReportEmailProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{`Weekly expenses report — ${periodLabel}`}</Preview>
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
              },
            },
          },
        }}
      >
        <Body className="bg-surface font-sans text-ink m-0 p-0">
          <Container className="mx-auto max-w-[600px] bg-white px-6 py-10">
            <Section className="border-b border-line pb-6">
              <Text className="text-xs uppercase tracking-widest text-muted m-0">
                Money Eye
              </Text>
              <Heading className="text-2xl font-semibold text-ink mt-2 mb-0">
                Weekly Expenses
              </Heading>
            </Section>

            <Section className="pt-8">
              <Text className="text-base text-ink m-0">
                Hello! Here is your weekly expenses report.
              </Text>
              <Text className="text-xs uppercase tracking-widest text-muted mt-2 mb-0">
                {periodLabel}
              </Text>
            </Section>

            <Section className="pt-8">
              <Row>
                <Column className="w-1/2 pr-2 align-top">
                  <Section className="border border-line bg-surfaceLow p-5">
                    <Text className="text-xs uppercase tracking-widest text-muted m-0">
                      Expenses
                    </Text>
                    <Text className="text-2xl font-semibold text-primary mt-2 mb-0">
                      {expensesFormatted}
                    </Text>
                  </Section>
                </Column>
                <Column className="w-1/2 pl-2 align-top">
                  <Section className="border border-line bg-surfaceLow p-5">
                    <Text className="text-xs uppercase tracking-widest text-muted m-0">
                      Revenue
                    </Text>
                    <Text className="text-2xl font-semibold text-primary mt-2 mb-0">
                      {revenueFormatted}
                    </Text>
                  </Section>
                </Column>
              </Row>
            </Section>

            <Section className="pt-10">
              <Heading
                as="h2"
                className="text-base font-semibold uppercase tracking-tight text-primary border-b border-line pb-3 m-0"
              >
                Breakdown
              </Heading>
              {categories.map((c) => (
                <Row key={c.name} className="border-b border-line">
                  <Column className="py-3 align-middle">
                    <Text className="text-xs uppercase tracking-widest text-muted m-0">
                      {titleCase(c.name)}
                    </Text>
                  </Column>
                  <Column align="right" className="py-3 align-middle">
                    <Text className="text-sm font-semibold text-primary m-0">
                      {c.amountFormatted}
                    </Text>
                  </Column>
                </Row>
              ))}
            </Section>

            <Section className="pt-10 text-center">
              <Button
                href={reportsUrl}
                className="bg-primary text-white text-xs uppercase tracking-widest font-semibold px-8 py-4 box-border"
              >
                View Full Report
              </Button>
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

WeeklyReportEmail.PreviewProps = {
  periodLabel: "Apr 24 – Apr 30, 2026",
  expensesFormatted: "$1,234.56",
  revenueFormatted: "$2,500.00",
  categories: [
    { name: "food & drink", amountFormatted: "$200.00" },
    { name: "bills & utilities", amountFormatted: "$150.00" },
    { name: "car", amountFormatted: "$50.00" },
    { name: "entertainment", amountFormatted: "$100.00" },
    { name: "groceries", amountFormatted: "$300.00" },
    { name: "foster", amountFormatted: "$80.00" },
    { name: "health & wellness", amountFormatted: "$60.00" },
    { name: "personal", amountFormatted: "$40.00" },
    { name: "shopping", amountFormatted: "$120.00" },
    { name: "fees & adjustments", amountFormatted: "$10.00" },
    { name: "others", amountFormatted: "$70.00" },
  ],
  reportsUrl: "https://www.moneyeye.dev/reports",
} satisfies WeeklyReportEmailProps;
