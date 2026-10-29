'use client';
import { useRef, useState, type ReactNode } from 'react';

type Site = { id: number; name: string }; type Loc = { id: number; sid: number; lname: string }; type Room = { id: number; sid: number; lid: number; name: string };
// Search plus cascading Site > Location > Room filters. Choosing a value applies straight away; choosing a Site narrows the Locations, and so on.
export default function LibFilters({ q, site, loc, room, f, sort, view, sites, locs, rooms, children }: { q: string; site: number; loc: number; room: number; f: string; sort: string; view: string; sites: Site[]; locs: Loc[]; rooms: Room[]; children?: ReactNode }) {
  const form = useRef<HTMLFormElement>(null);
  const [s, setS] = useState(site || 0), [l, setL] = useState(loc || 0), [r, setR] = useState(room || 0);
  const go = () => setTimeout(() => form.current?.requestSubmit(), 0);
  const lo = locs.filter(x => !s || x.sid === s), ro = rooms.filter(x => (!s || x.sid === s) && (!l || x.lid === l));
  return (<form ref={form} method="get" className="lay-bar">
    <input type="search" name="q" defaultValue={q} placeholder="Search by name, Site, Location or Room" aria-label="Search Wall Templates" />
    <select name="site" value={s || ''} aria-label="Site" onChange={e => { setS(Number(e.target.value) || 0); setL(0); setR(0); go(); }}><option value="">All Sites</option>{sites.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
    <select name="loc" value={l || ''} aria-label="Location" onChange={e => { setL(Number(e.target.value) || 0); setR(0); go(); }}><option value="">All Locations</option>{lo.map(x => <option key={x.id} value={x.id}>{x.lname}</option>)}</select>
    <select name="room" value={r || ''} aria-label="Room" onChange={e => { setR(Number(e.target.value) || 0); go(); }}><option value="">All Rooms</option>{ro.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
    <select name="f" defaultValue={f} aria-label="Filter" onChange={go}><option value="all">All Wall Templates</option><option value="used">Assigned to a Room</option><option value="unused">Not assigned to a Room</option><option value="mv">With multiview templates assigned</option><option value="nomv">No multiview templates assigned</option></select>
    <select name="sort" defaultValue={sort} aria-label="Sort" onChange={go}><option value="name">Name A to Z</option><option value="namez">Name Z to A</option><option value="new">Newest first</option><option value="old">Oldest first</option><option value="most">Most monitors</option><option value="fewest">Fewest monitors</option><option value="rmost">Used in most Rooms</option><option value="rfewest">Used in fewest Rooms</option></select>
    <input type="hidden" name="view" value={view} /><button className="sec small">Apply</button>
    {(q || s || l || r || f !== 'all') && <a className="btn sec small" href={`/walls?view=${view}`}>Clear</a>}
    {children}</form>);
}
