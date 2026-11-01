import Link from 'next/link';
import { Logo } from './Logo';
import HoldingForm from './HoldingForm';
export default function Holding() {
  return (<div className="auth" style={{ maxWidth: 520 }}>
    <div className="logo"><Logo size={44} tagline /></div>
    <div className="card" style={{ textAlign: 'center' }}>
      <span className="tag" style={{ display: 'inline-block', marginBottom: 10 }}>In development</span>
      <h1 style={{ margin: '0 0 8px' }}>Something new is on its way</h1>
      <p className="mut" style={{ margin: 0 }}>TelePlanner is the quick way to plan monitor walls for live production: assign sources to every tile, share the plan with your crew and print it for the gallery. This site is currently in development.</p></div>
    <div className="card"><h2 style={{ marginTop: 0 }}>Register your interest</h2>
      <p className="mut" style={{ margin: '0 0 12px' }}>Leave your details and we will let you know when it is ready.</p><HoldingForm /></div>
    <p className="mut" style={{ textAlign: 'center' }}><Link href="/signin">Sign in</Link></p></div>);
}
