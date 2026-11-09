@AGENTS.md

# Tummy

A food (and soon training) tracker for Bunny and Bear, split out of the
Bunnybear photo app (`../tigerbear`). Read before changing anything:

- `healthspec.md`: the product, the build order (§12), what's settled (§15).
- `mcpspec.md`: the MCP server for Claude and ChatGPT.
- `ARCHITECTURE.md`: Bunnybear's patterns, which this app copies.
- `deploy/README.md`: production and how it deploys.

**Production:** https://tummy.habitnpc.com, a Vultr VPS in Tokyo
(`deploy@104.156.238.74`) running Postgres, the app and Caddy in Docker
compose at `/srv/tummy`. Every push to `main` builds, smoke-tests and
deploys through GitHub Actions; there is no other way code reaches the box.
Backups go to Cloudflare R2 nightly.

**Locally:** `bun install`, `bun run setup` against a local Postgres, then
`bun run dev`. `bunx tsc --noEmit` and `bun run lint` before committing.

**Where the code is:** domain logic in `src/lib/health/` (route handlers and
the MCP tools are thin wrappers over it), screens in `src/app/(app)/`, their
components in `src/components/health/`.
