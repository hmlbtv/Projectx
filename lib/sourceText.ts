// A Source Set is a list of source names plus a category for each (name -> category). In text, one source per line: "Category | Source name"; a line without "|" has no category.
export function parseSources(txt: string, max = 500): { names: string[]; cats: Record<string, string> } {
  const names: string[] = [], cats: Record<string, string> = {};
  for (const raw of String(txt ?? '').split('\n')) {
    const line = raw.trim(); if (!line) continue;
    const i = line.indexOf('|'), cat = i >= 0 ? line.slice(0, i).trim().slice(0, 60) : '', name = (i >= 0 ? line.slice(i + 1) : line).trim().slice(0, 120);
    if (!name || names.some(n => n.toLowerCase() === name.toLowerCase())) continue;
    names.push(name); if (cat) cats[name] = cat; if (names.length >= max) break;
  }
  return { names, cats };
}
export const sourcesToText = (names: string[], cats: Record<string, string> | null | undefined) => (names ?? []).map(n => (cats?.[n] ? `${cats[n]} | ${n}` : n)).join('\n');
