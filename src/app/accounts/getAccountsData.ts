import { cacheTag, cacheLife } from 'next/cache'
import { plaidClient } from '@lib/plaid'
import prisma from '@lib/prisma/prismaClient'
import type { AccountsPageProps, AccountType, AccountWithErrors, ConnectionType } from './AccountsPage'

export async function getAccountsData(userId: string): Promise<AccountsPageProps> {
  'use cache'
  cacheTag(`user-accounts-${userId}`)
  cacheLife('accounts')

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { accounts: true },
  })

  const plaidAccounts = user?.accounts ?? []

  if (plaidAccounts.length === 0) {
    return { accounts: [], connections: [], accountsWithErrors: [] }
  }

  const results = await Promise.all(
    plaidAccounts.map(async (account) => {
      try {
        const res = await plaidClient.accountsGet({
          access_token: account.accessToken,
        })
        return {
          success: true as const,
          account: {
            institutionName: account.institutionName,
            accounts: res.data.accounts,
          },
        }
      } catch (error: any) {
        return {
          success: false as const,
          account: {
            institutionName: account.institutionName,
            accounts: [],
          },
          error: {
            institutionName: account.institutionName,
            accessToken: account.accessToken,
            error: error?.response?.data?.error_code ?? 'UNKNOWN_ERROR',
          },
        }
      }
    })
  )

  const accounts: AccountType[] = results.map((r) => r.account)
  const accountsWithErrors: AccountWithErrors[] = results
    .filter((r): r is Extract<typeof r, { success: false }> => !r.success)
    .map((r) => r.error)

  const connections: ConnectionType[] = plaidAccounts.map((a) => ({
    accessToken: a.accessToken,
    institutionName: a.institutionName,
  }))

  return { accounts, connections, accountsWithErrors }
}
