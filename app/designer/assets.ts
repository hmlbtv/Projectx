// Shared by every designer: what an item on a canvas looks like, and the preset Tile Assets the site admin provides.
export type DAsset = { id: string; type: string; name: string; x: number; y: number; w: number; h: number; props?: Record<string, any> };
export type PropDef = { key: string; label: string; kind: 'text' | 'number' | 'select' | 'area' | 'check' | 'color'; options?: string[]; min?: number; max?: number; when?: string; dflt?: any; rotates?: boolean /* changing it turns the asset's box on its side */ };
export type PaletteItem = { action?: string; group?: string; type: string; label: string; w: number; h: number; props?: Record<string, any>; fields?: PropDef[] };

export const TILE_W = 1920, TILE_H = 1080; // an MV Tile is always a 16:9 frame
export const TILE_ASSETS: PaletteItem[] = [
  { type: 'umd', label: 'UMD', w: 960, h: 132, props: { text: 'SOURCE NAME' }, fields: [{ key: 'text', label: 'Text', kind: 'text' }] },
  { type: 'audio', label: 'Audio meters', w: 132, h: 720, props: { channels: 2 },
    fields: [{ key: 'channels', label: 'Channels', kind: 'number', min: 1, max: 16 }] },
  { type: 'tally', label: 'Tally', w: 120, h: 120, props: { state: 'red', style: 'lamp' },
    fields: [{ key: 'state', label: 'State', kind: 'select', options: ['red', 'green', 'off'] }, { key: 'style', label: 'Style', kind: 'select', options: ['lamp', 'border'] }] },
  { type: 'clock', label: 'Clock / timecode', w: 504, h: 132, props: { format: 'HH:MM:SS' }, fields: [{ key: 'format', label: 'Format', kind: 'select', options: ['HH:MM:SS', 'HH:MM:SS:FF'] }] },
];
export const TILE_TYPES = TILE_ASSETS.map(a => a.type);
const id = () => Math.random().toString(36).slice(2, 8);
export const mk = (type: string, x: number, y: number, w?: number, h?: number, props?: Record<string, any>): DAsset => {
  const p = TILE_ASSETS.find(a => a.type === type)!;
  return { id: id(), type, name: p.label, x, y, w: w ?? p.w, h: h ?? p.h, props: { ...p.props, ...props } };
};
