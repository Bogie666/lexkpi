'use client';

import { useCallback, useEffect, useState } from 'react';

const KEY = 'lex-kpi-admin-secret-v1';

/**
 * Temporary admin-auth primitive until real Auth.js lands.
 *
 * Stores the shared CRON_SECRET (the same value protecting /api/admin/*
 * and /api/sync/* routes) in sessionStorage so admin-page fetches can
 * attach it as `Authorization: Bearer <secret>`. Cleared by closing the
 * tab or calling `clear()` explicitly.
 *
 * Notes for future self:
 *   - Obvious security issues (shared secret, client-readable) are
 *     expected — this is a pre-auth stop-gap.
 *   - Once Auth.js lands, replace this hook with `useSession()` and
 *     switch the admin API routes to role-based gating.
 */
export function useAdminSecret() {
  const [secret, setSecret] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const v = window.sessionStorage.getItem(KEY);
      if (v) setSecret(v);
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  const set = useCallback((v: string) => {
    window.sessionStorage.setItem(KEY, v);
    setSecret(v);
  }, []);

  const clear = useCallback(() => {
    window.sessionStorage.removeItem(KEY);
    setSecret(null);
  }, []);

  /** Attach Authorization header if we have a secret. */
  const authHeaders = useCallback(
    (base: HeadersInit = {}) => {
      const h = new Headers(base);
      if (secret) h.set('Authorization', `Bearer ${secret}`);
      return h;
    },
    [secret],
  );

  return { secret, loaded, set, clear, authHeaders };
}
