/**
 * One-off diagnostic. Pulls every active membership, filters to the
 * specified legacy membershipTypeIds (default = the two that showed up
 * as "Other" in the bucketed view), resolves their customer names, and
 * returns the list. Delete once we've decided what to do with them.
 *
 *   GET /api/admin/debug-legacy-memberships
 *   GET /api/admin/debug-legacy-memberships?typeIds=124857182,10200447
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  collectResource,
  fetchResourcePage,
} from '@/lib/sync/servicetitan/raw-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const query = req.nextUrl.searchParams.get('secret');
  return bearer === secret || query === secret;
}

interface StMembership {
  id: number;
  membershipTypeId?: number | null;
  customerId?: number | null;
  status?: string;
  active?: boolean;
  from?: string;
}

interface StCustomer {
  id: number;
  name?: string;
  email?: string;
  phoneSettings?: unknown;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  } | null;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const typeIdsParam = req.nextUrl.searchParams.get('typeIds') ?? '124857182,10200447';
  const legacyIds = new Set(
    typeIdsParam
      .split(',')
      .map((s) => Number(s.trim()))
      .filter(Number.isFinite),
  );

  try {
    // Pull every active membership. ~4.3K rows at pageSize=500 → ~9 calls.
    const memberships = await collectResource<StMembership>({
      path: '/memberships/v2/tenant/{tenant}/memberships',
      query: { status: 'Active' },
      pageSize: 500,
    });
    const targets = memberships.filter(
      (m) => m.membershipTypeId != null && legacyIds.has(m.membershipTypeId),
    );

    // For each target, fetch the customer record.
    const customersById = new Map<number, StCustomer | null>();
    for (const m of targets) {
      if (!m.customerId || customersById.has(m.customerId)) continue;
      try {
        const page = await fetchResourcePage<StCustomer>({
          path: `/crm/v2/tenant/{tenant}/customers/${m.customerId}`,
          pageSize: 1,
        });
        // Single-resource fetch returns the record directly — the generic
        // iterator treats it as a one-item page.
        customersById.set(m.customerId, (page as unknown as StCustomer) ?? null);
      } catch {
        customersById.set(m.customerId, null);
      }
    }

    const rows = targets.map((m) => {
      const cust = m.customerId ? customersById.get(m.customerId) : null;
      return {
        membershipId: m.id,
        typeId: m.membershipTypeId,
        from: m.from?.slice(0, 10) ?? null,
        customerId: m.customerId,
        customerName: cust?.name ?? null,
        customerEmail: cust?.email ?? null,
        customerAddress: cust?.address
          ? [cust.address.street, cust.address.city, cust.address.state]
              .filter(Boolean)
              .join(', ')
          : null,
      };
    });

    return NextResponse.json({
      ok: true,
      legacyTypeIds: Array.from(legacyIds),
      activeMembershipsScanned: memberships.length,
      matches: rows.length,
      rows,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
