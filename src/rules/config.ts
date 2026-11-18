/**
 * Every tunable number for the simulation and the rule engine lives here,
 * so behaviour can be adjusted without hunting through the code.
 */

/** Chi classification, relative to the inlet speed u_in. */
export const CHI = {
  /** More than this × u_in is sha chi (rushing). */
  shaAbove: 0.7,
  /** Slower than this × u_in is si chi (stagnant). In between is sheng (healthy). */
  siBelow: 0.08,
  /**
   * Chi spreads from moving air into the space around it, halving every this
   * many cm (walls and furniture block it). 0 turns spreading off.
   */
  spreadHalfDistanceCm: 60,
  /**
   * The bed is solid in 2D, so no chi flows *over* it. We measure the chi
   * mix in a band this wide around the bed instead (where a sleeper's head
   * and body meet the room's air).
   */
  bedZoneCm: 30,
  /** Stagnant regions at least this big are reported (0.5 m² = 5000 cm²). */
  minStagnantAreaCm2: 5000,
  /** A stagnant region "is in a corner" if it reaches within this distance of a room corner. */
  cornerRadiusCm: 60,
};

/** Simulation settings. Lengths in cm, speeds in lattice units (cells per step). */
export const SIM = {
  /**
   * Reference chi speed u_in (lattice units): roughly how fast chi comes through an
   * unobstructed door. Kept low (≈ 0.05–0.08) so the solver stays stable. The chi
   * classes are measured relative to this.
   */
  inletSpeed: 0.06,
  /**
   * How chi enters through the main door:
   *  - 'pressure': the door holds slightly higher pressure than the room and chi
   *    flows in as fast as the room allows, so blocking the path slows everything down.
   *  - 'velocity': chi is pushed in at exactly inletSpeed, however blocked the room is.
   */
  inletMode: 'pressure' as 'pressure' | 'velocity',
  /** Steps over which the inlet pressure/speed ramps up from 0, to avoid a startup shock. */
  inletRampSteps: 300,
  quality: {
    /**
     * tau sets the "thickness" (viscosity) of chi: higher spreads the stream out more.
     * inletPressure is tuned so an unobstructed door gives about inletSpeed.
     */
    standard: { cellCm: 5, tau: 0.9, inletPressure: 0.025 },
    /**
     * Half-size cells. Viscosity in lattice units must double to keep the
     * same look (same Reynolds number), hence the larger tau.
     */
    high: { cellCm: 2.5, tau: 1.3, inletPressure: 0.024 },
  },
  /** Fraction of velocity removed per step in porous cells (plants, chairs). */
  porousDrag: 0.3,
  settle: {
    /** Measure the mean speed every N steps... */
    sampleEvery: 50,
    /** ...and call the flow settled when the last K samples vary by less than `tolerance` (relative). */
    windowSamples: 12,
    tolerance: 0.01,
    /** Don't call it settled before this many steps; give up waiting after maxSteps. */
    minSteps: 1500,
    maxSteps: 9000,
  },
};

/** Category weights for the overall score (they add up to 100). */
export const WEIGHTS = {
  bed: 35,
  arrows: 15,
  mirrors: 10,
  flow: 20,
  clutter: 10,
  elements: 10,
  bagua: 0, // information only in v1
} as const;

export const CATEGORY_LABELS = {
  bed: 'Bed position',
  arrows: 'Poison arrows',
  mirrors: 'Mirrors',
  flow: 'Chi flow',
  clutter: 'Clutter & clearance',
  elements: 'Elements & yin/yang',
  bagua: 'Bagua map',
} as const;

/** Score labels: at least this score earns the label. */
export const SCORE_LABELS = [
  { min: 85, label: 'Harmonious' },
  { min: 70, label: 'Good' },
  { min: 50, label: 'Needs attention' },
  { min: 0, label: 'Unsettled' },
] as const;

/**
 * Rule thresholds and penalties. Penalties are points taken off the
 * rule's *category* (each category starts at 100), not the overall score.
 */
export const RULES = {
  bed: {
    /** Pillow point: this far in from the head end, along the bed's centre line. */
    pillowInsetCm: 30,
    /** The door must be within this total field of view from the pillow (±80°). */
    fieldOfViewDeg: 160,
    /** The head end counts as "against a wall" if within this distance. */
    wallContactCm: 10,
    /** A window this close to the bed counts as "beside a window". */
    windowNearCm: 30,
    /** How far into the room the walkway in front of the door extends. */
    walkwayDepthCm: 100,
    /** Double beds and bigger need this much clearance on both long sides. */
    sideClearanceCm: 60,
    /** Beds at least this wide count as double or larger. */
    doubleMinWidthCm: 120,
    /** Ignore this much of each side near the head (that's where nightstands go). */
    sideIgnoreNearHeadCm: 50,
    /** Two nightstands "match" if their sizes differ by at most this. */
    nightstandMatchToleranceCm: 10,
    penalty: {
      doorHidden: -30,
      doorBlocked: -15,
      coffin: -30,
      sameWallAsDoor: -8,
      noWallBehind: -25,
      openingBehind: -20,
      besideWindow: -6,
      inDoorSwing: -15,
      inWalkway: -8,
      tightSide: -8,
      sideAgainstWall: -12,
    },
    bonus: { matchingNightstands: 5 },
    /** The desk check counts half (it's a sub-item of the bed category). */
    desk: { backToDoor: -10, doorToSide: -5 },
    /** When suggesting a better bed spot, step along each wall by this much. */
    searchStepCm: 10,
  },
  arrows: {
    rangeCm: 250,
    /** Corners touching the target (closer than this) don't "aim" across space, so they're ignored. */
    minDistanceCm: 10,
    /** Closer than this is "bad" rather than "warn". */
    badWithinCm: 120,
    maxPenalty: -14,
    bookshelfNearBedCm: 100,
    bookshelfPenalty: -6,
    /** A nightstand more than this much taller than the mattress gets a warning. */
    nightstandToleranceCm: 5,
    nightstandPenalty: -4,
  },
  mirrors: {
    rayLengthCm: 1000,
    /** "Over the bed" = on the head wall within this distance of the headboard. */
    overBedCm: 25,
    penalty: -50,
  },
  flow: {
    rushPenalty: -30,
    bedShaWarn: 0.15,
    bedShaBad: 0.3,
    bedShaWarnPenalty: -15,
    bedShaBadPenalty: -30,
    stagnantPenaltyEach: -5,
    stagnantPenaltyMax: -20,
    /** Share of open floor that should be sheng chi for an overall "good". */
    shengGood: 0.5,
    shengLow: 0.25,
    shengLowPenalty: -10,
  },
  clutter: {
    coverageWarn: 0.55,
    coverageBad: 0.65,
    coverageWarnPenalty: -20,
    coverageBadPenalty: -40,
    walkwayWidthCm: 75,
    noWalkwayPenalty: -40,
    /** Sampling grid for coverage and path-finding. */
    gridCm: 5,
  },
  elements: {
    dominantShare: 0.45,
    dominantPenalty: -15,
    missingTwoPenalty: -20,
    tvPenalty: -15,
    deskPenalty: -10,
    maxLargePlants: 3,
    tooManyPlantsPenalty: -5,
  },
};

/** The five-element cycles (Western feng shui uses them as gentle tips only). */
export const ELEMENT_CYCLES = {
  /** Each element feeds the next: Water nourishes Wood, Wood feeds Fire, ... */
  productive: { Water: 'Wood', Wood: 'Fire', Fire: 'Earth', Earth: 'Metal', Metal: 'Water' },
  /** Each element restrains the next: Water puts out Fire, Fire melts Metal, ... */
  controlling: { Water: 'Fire', Fire: 'Metal', Metal: 'Wood', Wood: 'Earth', Earth: 'Water' },
} as const;

/** Visual settings for particles and the heatmap. */
export const FLOW_VIEW = {
  maxParticles: 700,
  /** Particles emitted per frame per metre of inlet width. */
  emitPerMetre: 9,
  /** Particle trail length in frames. */
  trailLength: 14,
  /** Lattice steps a particle is advanced per animation frame at speed 1×. */
  stepsPerFrame: 22,
  /** Particles disappear after this many frames. */
  maxAge: 900,
};
