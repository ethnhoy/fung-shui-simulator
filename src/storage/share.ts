/**
 * Share links: the whole layout is packed into the URL after the "#", so a
 * link like https://ethnhoy.github.io/fung-shui-simulator/#room=… opens someone else's bedroom.
 * Nothing is uploaded anywhere; the data lives in the link itself.
 *
 * Encoding: JSON → UTF-8 bytes → base64url (base64 with URL-safe characters).
 */
import type { Layout } from '../model/types';
import { parseLayout } from '../model/validate';

const PREFIX = '#room=';

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export function encodeLayout(layout: Layout): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(layout)));
}

export function decodeLayout(encoded: string): Layout {
  return parseLayout(JSON.parse(new TextDecoder().decode(fromBase64Url(encoded))));
}

/** A full link to the current page with the layout in the hash. */
export function shareUrl(layout: Layout, base: string = location.href): string {
  return base.split('#')[0] + PREFIX + encodeLayout(layout);
}

/** If the page was opened from a share link, return that layout (or null). */
export function layoutFromHash(hash: string = location.hash): Layout | null {
  if (!hash.startsWith(PREFIX)) return null;
  try {
    return decodeLayout(hash.slice(PREFIX.length));
  } catch (err) {
    console.warn('Share link could not be read.', err);
    return null;
  }
}
