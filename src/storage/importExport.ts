/**
 * Export the layout as a .json file download, and import one back.
 */
import type { Layout } from '../model/types';
import { parseLayout } from '../model/validate';

/** Trigger a browser download of the layout as pretty-printed JSON. */
export function exportLayout(layout: Layout): void {
  const blob = new Blob([JSON.stringify(layout, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = layout.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'bedroom';
  a.download = `fung-shui-${safeName}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Read a user-chosen file and turn it into a Layout.
 * `async` functions return a Promise (like a Java Future); `await` waits for it.
 */
export async function importLayoutFile(file: File): Promise<Layout> {
  const text = await file.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`"${file.name}" isn't valid JSON.`);
  }
  return parseLayout(json);
}
