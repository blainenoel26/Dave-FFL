@AGENTS.md

# Dave FFL — notes for agents

- Rules spec: docs/LEAGUE-RULES.md. Build plan and phase status: docs/PLAN.md.
- **Privacy:** owner names and emails must never be committed — not in code, docs, fixtures, test
  names or commit messages. Real roster data lives only in `private/` (gitignored). Committed
  fixtures use `owner01`…`owner12`.
- Commits use the repo-local anonymous identity already configured; do not change it.
- The owner approved pushing project code to origin/main. Never push anything from `private/`.
- Commands: `npm run dev`, `npm test` (Vitest), `npm run typecheck`, `npm run lint`, `npm run build`.
