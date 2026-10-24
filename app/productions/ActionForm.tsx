'use client';
import { useActionState } from 'react';
import type { FormState } from '@/lib/actions';
export default function ActionForm({ action, className, children }: { action: (s: FormState, f: FormData) => Promise<FormState>; className?: string; children: React.ReactNode }) {
  const [st, act] = useActionState(action, undefined);
  return (<div><form action={act} className={className}>{children}</form>{st?.error && <div role="alert" style={{ color: 'var(--bad)' }}>{st.error}</div>}</div>);
}
