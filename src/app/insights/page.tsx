import { getAvailableYears } from "./actions";
import InsightsPageComponent from "../../components/InsightsPage/InsightsPage";
import { ReportType } from "@prisma/client";

export const dynamic = 'force-dynamic';

interface InsightsPageProps {
  searchParams: Promise<{
    reportId?: string;
    reportType?: string;
  }>;
}

export default async function InsightsPage({ searchParams }: InsightsPageProps) {
  const params = await searchParams;
  
  // Server fetch for available years only
  const years = await getAvailableYears();

  if (!years?.success || !years?.data) {
    return <div>Oops! there is not data to show</div>;
  }

  // Parse URL params for report-based insights
  const reportId = params.reportId ? parseInt(params.reportId, 10) : undefined;
  const reportType = params.reportType as ReportType | undefined;
  
  return (
    <InsightsPageComponent
      years={years?.data || 0}
      initialReportId={reportId}
      initialReportType={reportType}
    />
  );
} 