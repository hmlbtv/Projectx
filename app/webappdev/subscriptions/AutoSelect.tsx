'use client';
// A dropdown inside a GET form that applies as soon as a choice is made.
export default function AutoSelect({ name, value, label, options }: { name: string; value: string; label: string; options: [string, string][] }) {
  return (<select name={name} defaultValue={value} aria-label={label} onChange={e => e.currentTarget.form?.requestSubmit()}>{options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>);
}
