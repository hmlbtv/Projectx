import type { PaletteItem } from '../designer/assets';
// The Wall Designer canvas is 1600 x 900 units; one unit is 4 mm, so the canvas is a 6.4 m x 3.6 m wall. Sizes are outer sizes (including the bezel or cabinet), rounded, so they are close but not manufacturer-exact:
// change a size in Properties if your unit is different.
export const WALL_W = 1600, WALL_H = 900;
const u = (mm: number) => Math.round(mm / 4);
const M = (type: string, label: string, wmm: number, hmm: number, group: string): PaletteItem => ({ type, label, w: u(wmm), h: u(hmm), group });
export const WALL_PALETTE: PaletteItem[] = [
  M('mon24', 'Monitor 24" (16:9)', 550, 320, 'Large monitors'), M('mon32', 'Monitor 32" (16:9)', 730, 420, 'Large monitors'), M('mon43', 'Monitor 43" (16:9)', 970, 555, 'Large monitors'),
  M('mon55', 'Monitor 55" (16:9)', 1240, 705, 'Large monitors'), M('mon65', 'Monitor 65" (16:9)', 1460, 830, 'Large monitors'), M('mon75', 'Monitor 75" (16:9)', 1680, 955, 'Large monitors'), M('mon85', 'Monitor 85" (16:9)', 1905, 1080, 'Large monitors'),
  M('bvm14', 'Sony BVM 14" (4:3)', 380, 385, 'Sony BVM / PVM'), M('pvm14', 'Sony PVM 14" (4:3)', 394, 390, 'Sony BVM / PVM'), M('pvm17', 'Sony PVM/BVM 17" (16:9)', 460, 330, 'Sony BVM / PVM'),
  M('bvm25', 'Sony BVM 24.5" (16:9)', 610, 430, 'Sony BVM / PVM'), M('bvm31', 'Sony BVM 31" 4K (16:9)', 770, 520, 'Sony BVM / PVM'),
  M('g8020', 'Genelec 8020', 189, 298, 'Speakers'), M('g8030', 'Genelec 8030', 237, 350, 'Speakers'), M('g8040', 'Genelec 8040', 237, 350, 'Speakers'), M('g8050', 'Genelec 8050', 286, 480, 'Speakers'),
  M('tc', 'Timecode clock', 400, 110, 'Clocks'), M('tcl', 'Timecode clock (large)', 640, 170, 'Clocks'),
];
