# E-İnfak website (Next.js, pnpm monorepo; context: repository root)
FROM node:20-bookworm-slim
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install -g pnpm@8.15.0

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
# The build cache is dropped; the server (user node) writes its fetch and image cache there.
RUN cd apps/web && NODE_OPTIONS=--max-old-space-size=2048 node_modules/.bin/next build \
  && rm -rf .next/cache && mkdir .next/cache && chown node:node .next/cache

ENV NODE_ENV=production
WORKDIR /app/apps/web
USER node
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "--port", "3000", "--hostname", "0.0.0.0"]
