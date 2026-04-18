'use server'

import { getServerSession } from 'next-auth'
import { options } from '@api/auth/[...nextauth]/options'
import { revalidateTag } from 'next/cache'
import { plaidClient } from '@lib/plaid'
import prisma from '@lib/prisma/prismaClient'

export async function addAccountAction(publicToken: string, institutionName: string) {
  const session = await getServerSession(options)
  if (!session?.user?.email) {
    return { success: false, error: 'Not authenticated' }
  }

  try {
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    })
    const accessToken = exchangeResponse.data.access_token
    const itemId = exchangeResponse.data.item_id

    if (!accessToken || !itemId) {
      return { success: false, error: 'Access token or Item Id not found' }
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })

    if (!user) {
      return { success: false, error: 'User not found' }
    }

    await prisma.plaidAccount.upsert({
      where: { itemId },
      create: { institutionName, accessToken, itemId, userId: user.id },
      update: { institutionName, accessToken },
    })

    revalidateTag(`user-accounts-${user.id}`, { expire: 0 })

    return { success: true }
  } catch (error) {
    console.error('addAccountAction failed', error)
    return { success: false, error: 'Failed to add account' }
  }
}

export async function removeAccountAction(accessToken: string) {
  const session = await getServerSession(options)
  if (!session?.user?.email) {
    return { success: false, error: 'Not authenticated' }
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })

    if (!user) {
      return { success: false, error: 'User not found' }
    }

    const ownedAccount = await prisma.plaidAccount.findFirst({
      where: { accessToken, userId: user.id },
      select: { id: true },
    })

    if (!ownedAccount) {
      return { success: false, error: 'Connection not found' }
    }

    const response = await plaidClient.itemRemove({
      access_token: accessToken,
    })

    if (!response.data.request_id) {
      return { success: false, error: 'Connection not removed' }
    }

    // Deleting a PlaidAccount cascades automatically to SyncedTransaction and PlaidCursor
    // via DB constraints — no manual cleanup of those tables needed.
    await prisma.plaidAccount.deleteMany({
      where: { accessToken, userId: user.id },
    })

    revalidateTag(`user-accounts-${user.id}`, { expire: 0 })

    return { success: true }
  } catch (error) {
    console.error('removeAccountAction failed', error)
    return { success: false, error: 'Failed to remove account' }
  }
}
