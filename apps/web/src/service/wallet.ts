/**
 * Wallet Query SoT — balance / plan / billing flag live in TanStack Query, not Redux.
 */

import { useQuery } from '@tanstack/react-query';
import { apiQuery, queryClient } from '@/service/client';
import type { WalletDto } from '@/models/wallet';
import { normalizePlanId, PLAN_CATALOG, type PlanId } from '@/utils/wallet';
import { getToken } from '@/utils/token';

export type WalletSnapshot = {
  tokens: number;
  planId: PlanId;
  planExpiresAt: number | null;
  planLocked: boolean;
  billingEnabled: boolean;
  creditsIncluded: number;
};

function emptyWalletSnapshot(billingEnabled = false): WalletSnapshot {
  return {
    tokens: 0,
    planId: 'free',
    planExpiresAt: null,
    planLocked: false,
    billingEnabled,
    creditsIncluded: PLAN_CATALOG.free.creditsIncluded,
  };
}

export function walletDtoToSnapshot(
  dto: WalletDto | null | undefined,
  billingFallback = false
): WalletSnapshot {
  if (!dto) return emptyWalletSnapshot(billingFallback);
  const planId = normalizePlanId(dto.planId);
  let planExpiresAt: number | null = null;
  if (dto.planExpiresAt != null && Number.isFinite(Number(dto.planExpiresAt))) {
    planExpiresAt = Number(dto.planExpiresAt);
  }
  let billingEnabled = billingFallback;
  if (dto.billingEnabled !== undefined) {
    billingEnabled = Boolean(dto.billingEnabled);
  }
  return {
    tokens: Math.max(0, Math.round(Number(dto.tokens) || 0)),
    planId,
    planExpiresAt,
    planLocked: Boolean(dto.planLocked) && planId !== 'free',
    billingEnabled,
    creditsIncluded: PLAN_CATALOG[planId].creditsIncluded,
  };
}

/** After redeem / spend — refresh me + ledger lists. */
export async function invalidateWalletCache() {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: apiQuery.walletWalletMe.key() }),
    queryClient.invalidateQueries({ queryKey: apiQuery.walletWalletLedger.key() }),
  ]);
}

/** Logout / 401 — drop cached balance so the next account cannot leak. */
export function clearWalletCache() {
  queryClient.removeQueries({ queryKey: apiQuery.walletWalletMe.key() });
  queryClient.removeQueries({ queryKey: apiQuery.walletWalletLedger.key() });
}

/** Authed wallet row — tokens, plan, billingEnabled from `/wallet`. */
export function useWalletMeQuery(enabled?: boolean) {
  const authed = Boolean(getToken());
  return useQuery({
    ...apiQuery.walletWalletMe.queryOptions({
      enabled: enabled ?? authed,
    }),
  });
}

/** Public billing flag from `/auth/config` (works before login). */
export function useAuthBillingConfigQuery() {
  return useQuery({
    ...apiQuery.authAuthConfig.queryOptions(),
    staleTime: 60_000,
  });
}

/** Prefer wallet.me when logged in; else public auth config. */
export function useBillingEnabled(): boolean {
  const authed = Boolean(getToken());
  const configQuery = useAuthBillingConfigQuery();
  const walletQuery = useWalletMeQuery(authed);
  const fromWallet = (walletQuery.data as WalletDto | undefined)?.billingEnabled;
  if (typeof fromWallet === 'boolean') return fromWallet;
  return Boolean((configQuery.data as { billingEnabled?: boolean } | undefined)?.billingEnabled);
}

/** Convenience snapshot for chips / plans / ledger header. */
export function useWalletSnapshot(): WalletSnapshot {
  const authed = Boolean(getToken());
  const configQuery = useAuthBillingConfigQuery();
  // Single wallet query — avoid nested useBillingEnabled() which also subscribed to wallet.
  const walletQuery = useWalletMeQuery(authed);
  const fromWallet = (walletQuery.data as WalletDto | undefined)?.billingEnabled;
  const billingEnabled =
    typeof fromWallet === 'boolean'
      ? fromWallet
      : Boolean((configQuery.data as { billingEnabled?: boolean } | undefined)?.billingEnabled);
  return walletDtoToSnapshot(walletQuery.data as WalletDto | undefined, billingEnabled);
}
