# Contributing to COVENANT

Thanks for your interest in contributing!

## Getting Started

1. Fork the repo
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/covenant.git`
3. Install dependencies: `cd covenant && yarn install && cd app && yarn install`
4. Copy env: `cp app/.env.example app/.env` and fill in your credentials
5. Push DB schema: `cd app && npx prisma db push`
6. Run dev server: `cd app && yarn dev`

## Development

- **On-chain program**: `programs/covenant/` (Rust/Anchor)
- **ZK circuit**: `circuits/word_count/` (Rust/SP1)
- **Frontend**: `app/` (Next.js 14/TypeScript)
- **SDK**: `sdk/` (TypeScript)
- **Tests**: `anchor test` (10 passing)

## Pull Requests

1. Create a feature branch: `git checkout -b feat/my-feature`
2. Make changes, ensure `npx next build` passes
3. Commit with conventional commits: `feat:`, `fix:`, `docs:`
4. Push and open a PR against `main`

## Code Style

- TypeScript strict mode
- Prisma for DB access: `import { prisma } from "@/lib/prisma"`
- Dark glass-morphism UI theme
- All API routes handle errors with try/catch

## Issues

- Bug reports: Use the Bug Report template
- Feature requests: Use the Feature Request template
