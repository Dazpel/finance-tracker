import { getAvailableYears } from "./actions";
import InsightsPageComponent from "../../components/InsightsPage/InsightsPage";

export default async function InsightsPage() {
  // Server fetch for available years only
  const years = await getAvailableYears();

  if (!years?.success || !years?.data) {
    return <div>Oops! there is not data to show</div>;
  }
  
  return <InsightsPageComponent years={years?.data || 0} />;
} 