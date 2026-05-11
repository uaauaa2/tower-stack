# Contributing to Tower Stack

Thanks for your interest! Here's how to contribute.

---

## Spec Kit Workflow

This project follows the Spec Kit documentation structure. All features are specified before implementation:

### Document Hierarchy

1. **`SPEC.md`** — Source of truth. Combined spec with constitution, requirements, mechanics, tasks.
2. **`ENGINEERING.md`** — Technical architecture, systems detail, test matrix.
3. **`specs/001-tower-stack/`** — Spec Kit breakdown:
   - `spec.md` — User stories, requirements, success criteria
   - `plan.md` — Tech stack, architecture, complexity tracking
   - `tasks.md` — Phased task list with status
   - `research.md` — Technical decision rationale
   - `data-model.md` — Entity schemas
   - `quickstart.md` — Validation scenarios
   - `contracts/` — Interface contracts
4. **`.specify/memory/constitution.md`** — Unbreakable project principles (C-01 through C-06)

### Workflow

1. **Read the spec** — Check `SPEC.md` and `specs/001-tower-stack/spec.md` for requirements.
2. **Check tasks** — Find an uncompleted task in `specs/001-tower-stack/tasks.md`.
3. **Implement** — Follow the architecture in `ENGINEERING.md`.
4. **Validate** — Run through `specs/001-tower-stack/quickstart.md` scenarios.
5. **Update docs** — Mark task complete, update CHANGELOG.md.

---

## Branch Conventions

| Branch | Purpose |
|--------|---------|
| `master` | Production (auto-deploys to GitHub Pages) |
| `feature/TXX-description` | New feature (e.g., `feature/T17-telegram-sdk`) |
| `fix/description` | Bug fix |
| `docs/description` | Documentation only |

---

## PR Process

1. Fork or create a feature branch
2. Make changes (keep them focused — one task per PR)
3. Validate with quickstart scenarios
4. Update `tasks.md` — mark task `[x]`
5. Update `CHANGELOG.md` — add entry under "Unreleased"
6. Submit PR with description referencing the task number

---

## Code Style

- Vanilla JavaScript (ES2020+). No frameworks.
- Single file (`index.html`). All HTML + CSS + JS in one file.
- No build step required.
- Follow existing patterns in the codebase.

---

## Constitution Principles

Every contribution must respect these principles:

- **C-01:** Single tap input — no multi-touch or gestures
- **C-02:** Mobile first — portrait orientation, touch primary
- **C-03:** Zero dependencies — no npm packages, no CDN libs (except Telegram SDK)
- **C-04:** Performance budget — < 150KB, < 2s load, 60fps
- **C-05:** Telegram ready — must work in Telegram Mini App
- **C-06:** Data local first — localStorage, no backend required

---

## Questions?

Check `SPEC.md` for game mechanics details, or `ENGINEERING.md` for technical architecture.
