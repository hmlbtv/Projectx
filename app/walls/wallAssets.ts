import type { PaletteItem } from '../designer/assets';
// The Wall Designer canvas is 1600 x 900 units; one unit is 4 mm, so the canvas is a 6.4 m x 3.6 m wall. Large monitors are the true screen size for the diagonal; Sony monitors and speakers are outer cabinet sizes, rounded, so close but not manufacturer-exact:
// change a size in Properties if your unit is different.
export const WALL_W = 1600, WALL_H = 900;
const u = (mm: number) => Math.round(mm / 4);
const M = (type: string, label: string, wmm: number, hmm: number, group: string): PaletteItem => ({ type, label, w: u(wmm), h: u(hmm), group });
// Large monitors are drawn at their true screen size: the 16:9 picture area for the diagonal (width = diagonal x 0.8716, height = diagonal x 0.4903), no bezel.
const S = (d: number): PaletteItem => ({ type: 'mon' + d, label: `Monitor ${d}" (16:9)`, w: u(d * 25.4 * 0.8716), h: u(d * 25.4 * 0.4903), group: 'Large monitors' });
export const WALL_PALETTE: PaletteItem[] = [
  ...[24, 26, 28, 32, 43, 55, 65, 75, 85].map(d => S(d)),
  M('bvm14', 'Sony BVM 14" (4:3)', 380, 385, 'Sony BVM / PVM'), M('pvm14', 'Sony PVM 14" (4:3)', 394, 390, 'Sony BVM / PVM'), M('pvm17', 'Sony PVM/BVM 17" (16:9)', 460, 330, 'Sony BVM / PVM'),
  M('bvm25', 'Sony BVM 24.5" (16:9)', 610, 430, 'Sony BVM / PVM'), M('bvm31', 'Sony BVM 31" 4K (16:9)', 770, 520, 'Sony BVM / PVM'),
  M('g8020', 'Genelec 8020', 189, 298, 'Speakers'), M('g8030', 'Genelec 8030', 237, 350, 'Speakers'), M('g8040', 'Genelec 8040', 237, 350, 'Speakers'), M('g8050', 'Genelec 8050', 286, 480, 'Speakers'),
  M('tc', 'Timecode clock', 400, 110, 'Clocks'), M('tcl', 'Timecode clock (large)', 640, 170, 'Clocks'),
];
