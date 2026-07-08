import { requireMobileUser } from "@lib/auth/requireMobileUser";
// Relative import — the accounts page dir has no path alias.
import { getAccountsData } from "../../../../accounts/getAccountsData";

export async function GET(request: Request) {
  const auth = await requireMobileUser(request);
  if (!auth.ok) return auth.response;

  try {
    const data = await getAccountsData(auth.user.id);
    const accounts = data.accounts.flatMap((group) =>
      group.accounts.map((a) => ({
        id: a.account_id,
        name: a.name,
        mask: a.mask ?? null,
        type: String(a.type),
        institutionName: group.institutionName,
      }))
    );
    return Response.json({ success: true, response: { accounts } });
  } catch (error) {
    console.error("[/api/mobile/plaid/accounts]", error);
    // Degrade gracefully — the feed works without chips.
    return Response.json({ success: true, response: { accounts: [] } });
  }
}
