/**
 * The Layout data model: everything needed to describe one bedroom.
 *
 * All lengths are in centimetres. Origin is the room's top-left corner,
 * x grows to the right, y grows downwards, rotation is in degrees clockwise.
 *
 * A Layout is plain JSON (no classes, no methods), so it can be saved to
 * localStorage, exported to a file, or sent to a Web Worker unchanged.
 * We treat it as an *immutable value*: code never edits a Layout in place,
 * it builds a new one (see layoutOps.ts). That makes undo/redo trivial.
 */

export interface Point {
  x: number;
  y: number;
}

export type RoomShape = 'rectangle' | 'lshape';
export type Corner = 'top-left' | 'top-right' | 'bottom-right' | 'bottom-left';

export interface Room {
  shape: RoomShape;
  /** Bounding-box size of the room interior (cm). */
  width: number;
  depth: number;
  /** For L-shapes: which corner is cut out, and how big the cut is. */
  notch: { corner: Corner; width: number; depth: number };
  wallThickness: number;
}

export type OpeningKind = 'door' | 'window';

export interface Opening {
  id: string;
  kind: OpeningKind;
  /** Index into roomWalls(room). Wall 0 is the top wall, then clockwise. */
  wallIndex: number;
  /** Distance from the wall's start vertex to the opening's centre (cm). */
  offset: number;
  width: number;
  isOpen: boolean;
  /** Doors only: the "mouth of chi". Exactly one door should have this. */
  isMainEntrance: boolean;
  /** Doors only: which end of the opening the hinge is at (along the wall direction). */
  hinge: 'start' | 'end';
  /** Doors only: true if the door swings into the room. */
  swingsInward: boolean;
}

export type FurnitureType =
  | 'bed'
  | 'nightstand'
  | 'desk'
  | 'chair'
  | 'wardrobe'
  | 'dresser'
  | 'bookshelf'
  | 'cabinet'
  | 'mirror'
  | 'plant'
  | 'rug'
  | 'tv'
  | 'lamp'
  | 'waterFeature'
  | 'column';

/** The five feng shui elements. */
export type Element = 'Wood' | 'Fire' | 'Earth' | 'Metal' | 'Water';
export const ELEMENTS: Element[] = ['Wood', 'Fire', 'Earth', 'Metal', 'Water'];

/** How an item affects chi flow in the simulation. */
export type Solidity = 'solid' | 'porous' | 'none';

export type HeightClass = 'low' | 'medium' | 'tall';

export interface Furniture {
  id: string;
  type: FurnitureType;
  /** Size variant, e.g. 'queen' for a bed or 'large' for a plant. Empty if not applicable. */
  variant: string;
  /** Optional user-facing name; falls back to the catalog label. */
  label: string;
  /** Centre of the item (cm). Using the centre makes rotation simple. */
  x: number;
  y: number;
  /** Size along the item's own x axis (side to side) and y axis (back to front). */
  width: number;
  depth: number;
  /** Degrees clockwise. At 0 the item's front faces down (+y). */
  rotation: number;
  /** Height above the floor (cm). The low/medium/tall class is derived from this. */
  heightCm: number;
  solidity: Solidity;
  element: Element;
  sharpCorners: boolean;
}

export interface Layout {
  /** Bumped if the format changes, so old saved files can be migrated. */
  version: 1;
  name: string;
  room: Room;
  openings: Opening[];
  furniture: Furniture[];
}
