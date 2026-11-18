# CLAUDE.md — Chi Flow (Feng Shui Bedroom Simulator)

Claude Code reads this file at the start of every session. It holds the project's fixed decisions and the feng shui rule spec. If something here conflicts with a later request, ask before changing direction.

## About the developer
- Beginner web developer. Has done basic Java and Python, and is new to TypeScript, npm and web tooling.
- Explain new concepts briefly when they first come up (e.g. "a Web Worker is like a background thread in Java").
- Prefer clear, readable code over clever code. Comment the *why*, especially in the physics and rule code.
- Before installing anything or running unfamiliar commands, say what it does in one line.
- After each milestone, give exact steps to run and test it, and what I should see.

## Project summary
A personal portfolio web app. The user draws their **bedroom** in 2D, places furniture, and runs a "wind tunnel" style simulation that visualises chi as a fluid. A rule engine scores the room using **Western (BTB/form school) feng shui** and produces a report on what's good, what's bad and how to fix it.

Scope for v1: **one bedroom, 2D top-down, Western method, no backend, no accounts.**
Out of scope for v1: multiple rooms or whole homes, compass/Flying Star/classical schools, 3D, logins, payments.

## Tech stack (fixed)
- **TypeScript + Vite**, no UI framework (vanilla TS + DOM for panels).
- **Konva** for the editor layer (select, drag, rotate, resize handles).
- **Plain Canvas 2D** layer for flow rendering (heatmap and particles) under the editor layer.
- **Web Worker** runs the fluid solver so the UI never freezes.
- **Vitest** for unit tests (rule engine and geometry helpers).
- Keep dependencies minimal. Ask before adding any library not listed here.
- Static site: `npm run build` → `/dist`, deployed to **GitHub Pages** via a GitHub Actions workflow. The repo is `chi-flow`, so Vite's `base` must be `/chi-flow/` for the production build.

## Commands
- `npm install` installs dependencies
- `npm run dev` starts the local dev server
- `npm test` runs the tests
- `npm run build` creates the production build in /dist
- `npm run preview` previews the production build locally

## Folder structure
```
src/
  main.ts              app entry, mode switching (Edit / Simulate)
  model/               data types: Room, Wall, Opening, Furniture, Layout (serialisable JSON)
  editor/              Konva editor, tools, snapping, undo/redo
  sim/                 LBM solver (worker), rasteriser (layout -> grid), particles, renderer
  rules/               one file per rule + scoring.ts + config.ts (all thresholds and weights)
  report/              report panel UI, issue highlighting, suggested fixes
  storage/             localStorage autosave, JSON import/export, URL share encoding
  ui/                  toolbar, palette, panels, styles
tests/                 Vitest tests mirroring src/rules and geometry helpers
```
Rules must not depend on the renderer. The sim and the rule engine both read the same `Layout` model.

## Units and coordinates
- Store everything in **centimetres** internally. Display metric by default with an imperial toggle.
- Origin at the top-left of the room, x to the right, y down. Rotation in degrees, clockwise.

## Data model (summary)
- `Room`: rectangle or L-shape (an L is a rectangle with one corner "notch" cut out), plus wall thickness. The wall polygon is *derived* from these parameters (`roomPolygon()`), listed clockwise starting with the top wall. Wall `i` runs from vertex `i` to vertex `i+1`.
- `Opening`: door or window on wall `wallIndex`, centred `offset` cm from that wall's start, with width and `isOpen`. Doors also have `hinge` ('start' | 'end' end of the opening) and `swingsInward` (default true). Exactly one door has `isMainEntrance = true` (the "mouth of chi").
- `Furniture`: type, variant (bed size, plant size), x, y (centre), width, depth, rotation, `heightCm` (a number in cm), `solidity` (solid | porous | none), `element` (Wood/Fire/Earth/Metal/Water, defaulted from type, editable), `sharpCorners` flag.
  - The height class (low/medium/tall) is *derived* from `heightCm` with thresholds in config, so the two can never disagree.
  - Facing is *derived* from rotation: at rotation 0 an item's front points down (+y). For a bed, the head is the back edge (−y) and the person lying down faces +y.
- Furniture types: bed (single/double/queen/king), nightstand, desk, chair, wardrobe, dresser, open bookshelf, closed cabinet, mirror, plant (small/large), rug, TV, lamp, water feature, column.

## Chi flow simulation spec
- **Method:** D2Q9 Lattice Boltzmann (BGK collision), bounce-back walls, stable low-Mach settings (inlet speed ≈ 0.05–0.08 lattice units). Grid cell ≈ 5 cm, so a 4 m × 4 m room is about 80 × 80 cells. Allow a "high quality" 2.5 cm option.
- **Rasteriser** converts the Layout to a grid:
  - walls, closed openings and solid furniture → solid
  - plants → porous cells (apply drag that slows flow, don't block it)
  - rugs → no obstacle
  - low furniture (nightstand, bed) → still solid in 2D
- **Sources and sinks:**
  - Main entrance (open) = velocity inlet, the main source of chi.
  - Open windows and other open doors = open outlets (zero-gradient / pressure boundary).
  - If the main door is the only opening, split the doorway into inflow and outflow halves so chi enters, circulates and returns, and note this in the UI.
  - If the main door is closed, show a message: "Open the door to let chi in."
- **Visuals:** (1) tracer particles and streaklines emitted from the door, fading trails; (2) a toggleable heatmap coloured by chi type; (3) optional velocity arrows. Play / pause / step / reset and a speed slider.
- **Chi classification** per fluid cell, using speed relative to inlet speed `u_in` (thresholds live in `rules/config.ts`):
  - **Sha chi** (rushing, harmful): speed > 0.6 · u_in → red
  - **Sheng chi** (healthy, meandering): between → green/gold
  - **Si chi** (stagnant): speed < 0.08 · u_in, measured once flow has settled → blue-grey
  - "Settled" = mean fluid speed changes by less than a small tolerance over a window of N steps, or a max step count is reached (both in config).
- **Sim statistics passed to the rules:** % of floor area in each class, the class mix over the bed's footprint, and stagnant regions larger than 0.5 m².
  - The bed is solid in 2D, so "over the bed's footprint" is measured in a band around the bed (`CHI.bedZoneCm`, 30 cm).
  - Viscosity (tau) is scaled with cell size so standard and high quality give the same picture.
- The simulation is a visual metaphor and not physical air-flow modelling. Say so in the About panel.

## Rule engine spec (Western bedroom feng shui)
Each rule returns `{ id, status: good|warn|bad, scoreImpact, message, explanation, highlight: shapes[], fix?: SuggestedFix }`.
All thresholds and weights live in `rules/config.ts`. Write tests for every rule.
Results also have a `category`, and a fourth status, `info`, for tips (always 0 impact). Each category starts at 100, adds its results' `scoreImpact` (penalties are negative, bonuses positive) and is clamped to 0..100. Fixes are `{ label, apply(layout) => layout }`.
Sim statistics are an *optional* input. Without them (e.g. the best-spot heatmap), the sim-based checks in rule 4 score neutral and only the geometric checks (like the straight-line rush) run.

### 1. Bed: commanding position (weight 35)
- **Line of sight:** from the pillow point (centre of the head end, 30 cm in), the doorway must be visible. No tall furniture blocks the line, and the door is within about 160° of the direction the person faces lying down.
- **Coffin position (bad):** the bed's long axis, projected from the foot, passes through the doorway.
- **Diagonal placement (good):** the bed is on a wall diagonally across from the door, not on the same wall as the door.
- **Solid wall behind the headboard (bad if missing):** the head end must touch a wall segment with no window or door behind it.
- **Not directly under or in front of a window.**
- **Not in the path of the door swing or the walkway.**
- **Balanced access:** for double or larger beds, ≥ 60 cm clear on both long sides. Warn if one side touches a wall. Bonus for matching nightstands on both sides.

### 2. Poison arrows (weight 15)
- For each sharp convex corner (furniture flagged `sharpCorners`, protruding wall corners, columns), cast a ray along the corner's bisector. If it hits the bed (or a desk chair) within 250 cm, it's an issue. Severity scales with closeness.
- Open bookshelves near the bed get a warning.
- Nightstands taller than the mattress get a warning.
- Fix suggestions: rotate or move the item, soften with a plant or rounded item between, or swap for closed storage.

### 3. Mirrors (weight 10)
- A mirror whose facing direction ray hits the bed, or that sits directly over the bed, is bad. Fix: move it, put it inside a wardrobe door, or cover it at night.
- In 2D, "directly over the bed" means a mirror on the headboard wall within the bed's width.

### 4. Chi flow (weight 20)
- Straight-line rush: raycast from the main door. If it reaches an open window or another door with no obstacle in between, that's bad. Fix: place a plant, screen or furniture in the path.
- Sha chi over the bed footprint above about 15% → warn/bad.
- Large stagnant (si) regions, especially corners → warn. Fix: lamp, plant, or declutter.
- Overall good when most open floor is sheng chi.

### 5. Clutter and clearance (weight 10)
- Furniture covering more than about 55% of floor area → warn. More than 65% → bad.
- A clear walking path at least 75 cm wide from the door to the bed side (grid path-finding on a clearance map).
- Items under the bed can't be modelled in 2D, so give a general tip only.

### 6. Five elements and yin/yang (weight 10)
- Tally elements by count and area. Good if all five are present. Warn if one element dominates (> 45%) or the room is missing 2 or more. Mention controlling-cycle clashes only as tips:
  - Productive cycle: Water → Wood → Fire → Earth → Metal → Water
  - Controlling cycle: Water → Fire → Metal → Wood → Earth → Water
- A bedroom should lean yin. A TV, desk or other active electronics adds yang (warn on TV). Too many plants (> 3 large) gives a mild warning.
- Default elements by type: plant = Wood, lamp/candle = Fire, rug and ceramics = Earth, mirror and metal frames = Metal, water feature = Water. Wardrobe, dresser and bed are editable (default Wood).

### 7. Bagua overlay (information only, weight 0 in v1)
- A 3×3 grid stretched over the room's bounding box, with the bottom row along the main-entrance wall (Western method).
- For an L-shaped room the notch is a "missing area". The report names the missing zone(s) and gives a light tip (e.g. a mirror or plant on the adjoining wall).
- From the entrance looking in:
  - Back row: Wealth (left), Fame (centre), Relationships (right)
  - Middle row: Family (left), Health/centre, Children/Creativity (right)
  - Front row: Knowledge (left), Career (centre), Helpful People/Travel (right)
- The report lists what sits in each zone with light tips (e.g. paired items in Relationships), and the overlay can be toggled.

### Optional: desk in the bedroom
If a desk exists, check its commanding position (can see the door, back not to the door) as a sub-item of rule 1 with half weight. Also add a yang warning.

### Scoring
- Overall 0–100 = weighted sum of category scores. Show category scores as bars.
- Labels: 85+ Harmonious, 70–84 Good, 50–69 Needs attention, below 50 Unsettled.

## Report and UX rules
- The report has three sections: **What's working**, **Issues** (sorted by severity) and **How to improve**.
- Clicking an issue highlights the cause on the plan: the offending ray, corner, mirror line or bed outline.
- "Try this fix" previews the change as a ghost and applies it on confirm (undoable).
- **Best spot heatmap:** while dragging the bed (or desk), shade the floor by the rule score that position would get. Compute it on a coarse grid with rules only, no sim, so it stays fast.
- **Before/after:** keep a snapshot. Show score and flow side by side.
- Two modes: **Edit** and **Simulate**. Changing the layout in Simulate mode re-runs the sim automatically.
- Include a starter sample bedroom that loads on first visit, so the app is impressive immediately.
- About panel: what feng shui is, how chi is modelled, and the disclaimer: "Feng shui is a traditional practice; this tool is for design inspiration, not a scientific or medical claim."
- Visual style: calm, warm and minimal. Accessible colour choices: don't rely on red/green alone; add icons or patterns.

## Portfolio polish
- README with a screenshot or GIF, a live demo link, the features, how the simulation works (short LBM explainer), the tech stack, and run instructions.
- Commit at the end of every milestone with a clear message.
