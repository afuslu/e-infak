# E-İnfak website (Next.js, pnpm monorepo; context: repository root)
FROM node:20-bookworm-slim
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install -g pnpm@8.15.0

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN cd apps/web && NODE_OPTIONS=--max-old-space-size=2048 node_modules/.bin/next build

ENV NODE_ENV=production
WORKDIR /app/apps/web
USER node
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "--port", "3000", "--hostname", "0.0.0.0"]
