import { rows } from '@/lib/db';
import { signIn } from '@/lib/actions';
export const dynamic = 'force-dynamic';
export default async function SignIn() {
  const users = await rows('select id,name,email,role from users order by id');
  return (<div className="card"><h1>Sign in (demo)</h1>
    <p className="mut">Demo mode: pick a seeded user to try each role. Real email-invite login is a later phase.</p>
    {users.map((u: any) => (<form key={u.id} action={signIn} className="row"><input type="hidden" name="id" value={u.id} />
      <button>{u.name}</button><span className="tag">{u.role}</span><span className="mut">{u.email}</span></form>))}</div>);
}
