import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { options } from "@api/auth/[...nextauth]/options";
import { appRoutes } from "utils/constants";
import { ThresholdsTable } from "@components/ThresholdsTable";

export default async function ThresholdsPage() {
  const session = await getServerSession(options);
  if (!session?.user?.email) redirect(appRoutes.LOGIN_PAGE);

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Spending Thresholds</h1>
        <p className="text-sm text-default-500 mt-1">
          Set monthly spending limits per category. Get notified at 70%, 100%, and over budget.
          Set a category to <span className="font-mono">$0</span> to disable alerts for it.
        </p>
      </div>
      <ThresholdsTable />
    </div>
  );
}
