// Comment box that sits under a Wall Template in a Job. Server component: the form posts straight to the given action.
export default function WallComments({ title, comments, action, hidden }: { title: string; comments: { id: number; who: string; body: string; created_at: any }[]; action?: (f: FormData) => Promise<void>; hidden: Record<string, string | number> }) {
  return (<div className="card" style={{ marginTop: 6 }}><b>Comments · {title}</b>
    {comments.length === 0 && <div className="mut" style={{ fontSize: '.85rem' }}>No comments yet.</div>}
    {comments.map(c => <div key={c.id} style={{ margin: '4px 0' }}><b>{c.who}</b> <span className="mut" style={{ fontSize: '.75rem' }}>{new Date(c.created_at).toISOString().slice(0, 16).replace('T', ' ')}</span><div style={{ whiteSpace: 'pre-wrap' }}>{c.body}</div></div>)}
    {action && <form action={action} className="row">{Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}<input name="body" placeholder="Add a comment about this wall" required maxLength={2000} style={{ flex: 1 }} /><button className="sec">Post</button></form>}</div>);
}
