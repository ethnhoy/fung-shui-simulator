import { describe, expect, it } from 'vitest';
import { sampleLayout } from '../../src/model/sample';
import { LayoutError, parseLayout } from '../../src/model/validate';

describe('parseLayout', () => {
  it('accepts a layout that went through JSON', () => {
    const l = sampleLayout();
    expect(parseLayout(JSON.parse(JSON.stringify(l)))).toEqual(l);
  });

  it('rejects things that are not layouts, with a readable message', () => {
    expect(() => parseLayout('hello')).toThrow(LayoutError);
    expect(() => parseLayout({ version: 2 })).toThrow(/version/);
    expect(() => parseLayout({ version: 1, room: {}, openings: [], furniture: [] })).toThrow(/width/);
  });

  it('rejects unknown furniture types', () => {
    const l = JSON.parse(JSON.stringify(sampleLayout()));
    l.furniture[0].type = 'trampoline';
    expect(() => parseLayout(l)).toThrow(/trampoline/);
  });

  it('fills in missing optional fields from the catalog', () => {
    const l = JSON.parse(JSON.stringify(sampleLayout()));
    delete l.furniture[1].element;
    delete l.furniture[1].heightCm;
    const parsed = parseLayout(l);
    expect(parsed.furniture[1]).toMatchObject({ element: 'Wood', heightCm: 55 });
  });
});
