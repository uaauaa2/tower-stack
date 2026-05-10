# Tower Stack 🏗️

A Tower Bloxx-style casual web game. A crane swings a block on a cable — tap to drop it, stack blocks as high as you can. Physics-based landing with swing momentum. Perfect timing = combos. Miss 3 times and the game ends. After each round, your tower joins a growing city skyline.

**[Play Now](https://uaauaa2.github.io/tower-stack/)**

---

## How to Play

1. **Tap / Click / Press Space** to drop the swinging block
2. Time it right to land on the tower
3. **Perfect placement** (centered ±3px) builds your combo multiplier
4. **Off-center** placements make the tower wobble
5. **Miss** (less than 30% overlap) costs a life — 3 misses = game over
6. After game over, your tower joins your city skyline

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Rendering | HTML5 Canvas 2D |
| Logic | Vanilla JavaScript (ES2020+) |
| Styling | Inline CSS |
| Persistence | localStorage |
| Dependencies | **None** |

Single file: `index.html` (~53KB). No build step. No frameworks.

---

## Running Locally

```bash
# Clone the repo
git clone https://github.com/uaauaa2/tower-stack.git
cd tower-stack

# Option 1: Open directly
open index.html

# Option 2: Local server (for full compatibility)
python3 -m http.server 8000
# Open http://localhost:8000
```

---

## Deployment

Deployed to GitHub Pages:

```bash
git push origin master  # auto-deploys
```

Live at: `https://uaauaa2.github.io/tower-stack/`

---

## Project Structure

```
tower-stack/
├── .specify/
│   └── memory/
│       └── constitution.md      # Project principles (C-01 through C-06)
├── specs/
│   └── 001-tower-stack/
│       ├── spec.md              # Feature specification
│       ├── plan.md              # Implementation plan
│       ├── tasks.md             # Task list with phases
│       ├── research.md          # Technical research decisions
│       ├── data-model.md        # Entity definitions & schemas
│       ├── quickstart.md        # Validation guide
│       └── contracts/
│           └── storage-contract.md  # localStorage API contract
├── constitution.md              # Project constitution (root copy)
├── index.html                   # Complete game (HTML + CSS + JS)
├── SPEC.md                      # Combined specification (source of truth)
├── ENGINEERING.md               # Technical architecture reference
├── README.md                    # This file
├── CONTRIBUTING.md              # Contribution guide
└── CHANGELOG.md                 # Version history
```

---

## Spec Kit Workflow

This project uses the Spec Kit documentation structure:

1. **constitution.md** — Unbreakable project principles
2. **spec.md** — What and why (user stories, requirements, success criteria)
3. **plan.md** — How (tech stack, architecture, complexity tracking)
4. **tasks.md** — What order (phased task list with dependencies)
5. **research.md** — Technical decisions and rationale
6. **data-model.md** — Entity schemas and relationships
7. **quickstart.md** — Validation scenarios
8. **contracts/** — API/interface contracts

See `CONTRIBUTING.md` for the full workflow.

---

## License

MIT
