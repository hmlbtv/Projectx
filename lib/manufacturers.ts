// Multiviewer manufacturers the site admin can import MV Layouts from. Each one turns what it is given (nothing for a built-in database, or the text of an uploaded layout/config file)
// into plain layouts: a name and its tiles (x, y, w, h and the monitor number n, on the 1920x1080 frame). To add a manufacturer, add an entry here with its own reader.
export type ImportedLayout = { name: string; tiles: any[] };
export type Manufacturer = {
  id: string; name: string;
  about: string;
  file?: { accept: string; hint: string }; // present when the manufacturer is imported from an uploaded file
  read: (fileText?: string) => Promise<ImportedLayout[]>;
};

export const MANUFACTURERS: Manufacturer[] = [
  { id: 'kaleido', name: 'Kaleido',
    about: '47 layouts from the Kaleido (KMX) database: even grids, one-big-plus-small, and with-timecode variants. Each monitor is placed and sized as in Kaleido and numbered left to right, top to bottom. Clock-only layouts are left out, and clocks inside layouts are not added as monitors.',
    read: async () => (await import('../data/kaleido-layouts.json')).default as ImportedLayout[] },
];
