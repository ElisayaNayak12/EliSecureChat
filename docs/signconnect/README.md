# SignConnect AI documentation

SignConnect AI is being built into the ELiSecureChat monorepo, phase by phase, following
`Sigin Language AI based Video Chat.docx`.

| Document | Contents |
|---|---|
| [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) | Environment check, gap analysis (Working / Prototype / Mock / Not implemented), phase plan and acceptance criteria |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Current vs. target architecture, translation pipelines, decisions |
| [DATABASE_DESIGN.md](DATABASE_DESIGN.md) | PostgreSQL schema and mapping from the JSON store |
| [API_DOCUMENTATION.md](API_DOCUMENTATION.md) | Endpoints added by SignConnect phases |
| [AI_MODEL_ARCHITECTURE.md](AI_MODEL_ARCHITECTURE.md) | AI pipeline plan and evaluation requirements |
| [DATASET_LICENSES.md](DATASET_LICENSES.md) | Candidate datasets and the licence review checklist |
| [SECURITY.md](SECURITY.md) | Honest security and privacy status |
| [CHANGELOG.md](CHANGELOG.md) | What changed, by date |
| [phase-reports/](phase-reports/) | Completion report per phase |

## Commands

```bash
npm install                                   # once, at the repo root
npm run dev                                   # backend :3000, web :5173, admin :5174
npm --workspace @secure-chat/backend test     # backend tests (node:test via tsx)
npm run backend:build && npm run web:build && npm run admin:build
```
