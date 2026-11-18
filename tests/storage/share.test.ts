import { describe, expect, it } from 'vitest';
import { sampleLayout } from '../../src/model/sample';
import { decodeLayout, encodeLayout, layoutFromHash, shareUrl } from '../../src/storage/share';

describe('share links', () => {
  it('round-trips a layout through the URL encoding', () => {
    const l = sampleLayout();
    l.name = 'Ünïcödé bedroom ☯';
    expect(decodeLayout(encodeLayout(l))).toEqual(l);
  });

  it('uses only URL-safe characters', () => {
    expect(encodeLayout(sampleLayout())).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('builds a link and reads it back from the hash', () => {
    const url = shareUrl(sampleLayout(), 'https://example.com/chi-flow/#old');
    expect(url.startsWith('https://example.com/chi-flow/#room=')).toBe(true);
    expect(layoutFromHash(url.slice(url.indexOf('#')))).toEqual(sampleLayout());
  });

  it('ignores missing or broken links', () => {
    expect(layoutFromHash('')).toBeNull();
    expect(layoutFromHash('#room=not-valid!!')).toBeNull();
  });
});
