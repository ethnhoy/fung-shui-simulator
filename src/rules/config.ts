/**
 * Every tunable number for the simulation and the rule engine lives here,
 * so behaviour can be adjusted without hunting through the code.
 */

/** Chi classification, relative to the inlet speed u_in. */
export const CHI = {
  /** Faster than this × u_in is sha chi (rushing). */
  shaAbove: 0.6,
  /** Slower than this × u_in is si chi (stagnant). In between is sheng (healthy). */
  siBelow: 0.08,
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
  /** Speed chi enters through the main door. Kept low (≈ 0.05–0.08) so the solver stays stable. */
  inletSpeed: 0.06,
  /** Steps over which the inlet speed ramps up from 0, to avoid a startup shock. */
  inletRampSteps: 300,
  quality: {
    standard: { cellCm: 5, tau: 0.6 },
    /**
     * Half-size cells. Viscosity in lattice units must double to keep the
     * same look (same Reynolds number), hence the larger relaxation time tau.
     */
    high: { cellCm: 2.5, tau: 0.7 },
  },
  /** Fraction of velocity removed per step in porous cells (plants, chairs). */
  porousDrag: 0.12,
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
