'use client';

import { useState, type FormEvent } from 'react';
import { Panel } from '@/components/primitives/panel';
import { Button } from '@/components/primitives/button';
import { Field, Input } from '@/components/primitives/input';
import { useAdminSecret } from '@/lib/hooks/use-admin-secret';

/**
 * Wrap any admin page so it only renders when an admin secret is stashed in
 * sessionStorage. Unauthenticated users see a prompt.
 */
export function AdminAuthGate({ children }: { children: React.ReactNode }) {
  const { secret, loaded, set, clear } = useAdminSecret();
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!loaded) return null;

  if (!secret) {
    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError(null);
      const trimmed = input.trim();
      if (!trimmed) {
        setError('Enter a secret');
        return;
      }
      // Probe with a lightweight admin call to validate the secret.
      try {
        const res = await fetch('/api/admin/targets', {
          headers: { Authorization: `Bearer ${trimmed}` },
        });
        if (res.status === 401) {
          setError('Wrong secret');
          return;
        }
        if (!res.ok) {
          setError(`Unexpected response: ${res.status}`);
          return;
        }
        set(trimmed);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };

    return (
      <div className="min-h-[60vh] grid place-items-center px-4">
        <Panel className="w-full max-w-md">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <h1 className="text-panel mb-1">Admin</h1>
              <p className="text-[13px] text-muted leading-relaxed">
                Paste the admin secret to edit targets, TVs, and other
                operational config. This will be replaced by a real sign-in
                when auth ships.
              </p>
            </div>
            <Field label="Secret">
              <Input
                type="password"
                autoFocus
                placeholder="CRON_SECRET"
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
            </Field>
            {error && <div className="text-[12px] text-down">{error}</div>}
            <Button type="submit" variant="primary">
              Unlock
            </Button>
          </form>
        </Panel>
      </div>
    );
  }

  return (
    <>
      {children}
      <div className="fixed bottom-4 right-4 z-50">
        <Button size="sm" variant="ghost" onClick={clear}>
          Sign out
        </Button>
      </div>
    </>
  );
}
