# Tummy's production image (healthspec.md §3). Built by GitHub Actions, never
# on the 1 GB VPS: `next build` needs more memory than the box has.

# Build with the repo's own Bun for installs, and Node for Next itself, which
# is what it runs on in production.
FROM node:22-slim AS build
COPY --from=oven/bun:1.4.2 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM node:22-slim
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    PHOTO_DIR=/data/photos \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
# output: "standalone" is the server plus only the dependencies it imports.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Migrations run from this image on every deploy, before the new server
# starts; `postgres` is already in the standalone node_modules.
COPY --from=build /app/db/migrations ./db/migrations
COPY --from=build /app/scripts/migrate.mjs /app/scripts/sql.mjs /app/scripts/env.mjs ./scripts/
RUN mkdir -p /data/photos && chown -R node:node /data
USER node
EXPOSE 3000
CMD ["node", "server.js"]
