// Dev site only: a thin strip under the top banner showing which build is running, so a finished deployment is easy to spot.
import pkg from '../package.json';
export default function DevVersion() {
  const [sha, at] = (process.env.DEV_BUILD_INFO ?? 'local|').split('|');
  const when = at ? new Date(at).toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  return <div className="devver" role="status">Dev build v{pkg.version}-{sha}{when ? ` · built ${when}` : ''}</div>;
}
