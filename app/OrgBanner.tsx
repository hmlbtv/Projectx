'use client';
import { useEffect, useState } from 'react';
// Slim bar showing which organization this session is working in, plus a short "Switched to …" confirmation right after a switch.
export default function OrgBanner({ name, role, hue }: { name: string; role: string; hue: number }) {
  const [msg, setMsg] = useState('');
  useEffect(() => {
    try {
      const m = document.cookie.match(/(?:^|; )tp-switched=([^;]*)/);
      if (m) { setMsg('Switched to ' + decodeURIComponent(m[1])); document.cookie = 'tp-switched=; Max-Age=0; Path=/; SameSite=Lax'; const t = setTimeout(() => setMsg(''), 4000); return () => clearTimeout(t); }
    } catch { /* ignore */ }
  }, [name]);
  return (<>
    <div role="status" style={{ background: `hsl(${hue} 55% 28%)`, color: '#fff', fontSize: 13, padding: '5px 20px', borderBottom: `3px solid hsl(${hue} 70% 55%)` }}>
      Working in <b>{name}</b>, as {role}</div>
    {msg && <div role="alert" style={{ position: 'fixed', top: 64, left: '50%', transform: 'translateX(-50%)', zIndex: 50, background: '#10361f', color: '#d5f5e0', border: '1px solid #2c7a4b', borderRadius: 8, padding: '8px 16px', fontSize: 14, boxShadow: '0 4px 14px rgba(0,0,0,.35)' }}>{msg}</div>}
  </>);
}
