I want to build "Chi Flow", a feng shui bedroom simulator, as a personal portfolio project. Read CLAUDE.md in this folder first. It has the full spec, tech stack, feng shui rules and the way I'd like you to work with me.

Quick summary: the user draws their bedroom in 2D (walls, door, windows, bed, nightstands, desk, wardrobe, mirror, plants, and so on). Then they press Simulate and watch chi flow through the room like a wind tunnel simulation: particles stream in from the door, and the floor is coloured by rushing (sha), healthy (sheng) and stagnant (si) chi. A report scores the room using Western feng shui rules and explains what's good, what's bad and how to fix it, with clickable highlights and one-click fixes.

About me: I've only done basic Java and Python. I'm new to TypeScript, npm and web development. Please:
- Check that Node.js (LTS) and Git are installed. If not, tell me exactly how to install them for my operating system and wait for me.
- Explain new ideas briefly, comparing them to Java or Python where that helps.
- Keep the code readable and well commented. I want to understand it and talk about it in interviews.

How to work:
1. Start by giving me a short plan: the milestones below, the main files you'll create, and anything in CLAUDE.md you think should change. Wait for my OK.
2. Then build one milestone at a time. At the end of each one: run the tests, start the dev server, tell me exactly what to click to check it works, and commit to git.

Milestones:
- **M1 – Project setup and room editor:** Vite + TypeScript scaffold. Rectangle and L-shaped rooms with real dimensions, doors and windows on walls, the furniture palette, drag/rotate/resize, snapping, undo/redo, autosave, JSON import/export, and a sample bedroom that loads on first visit.
- **M2 – Chi flow simulation:** turn the layout into a grid, run the LBM solver in a Web Worker, draw particles and streaklines plus the chi-type heatmap, and add play/pause/reset controls.
- **M3 – Rule engine:** every bedroom rule in CLAUDE.md, with tests, plus scoring.
- **M4 – Report and fixes:** the report panel, click-to-highlight, "Try this fix", the best-spot heatmap while dragging the bed, and before/after comparison.
- **M5 – Polish and deploy:** the About panel and disclaimer, a responsive layout, a README written for my portfolio, and deployment to GitHub Pages with a GitHub Actions workflow. Walk me through creating the GitHub repo.
