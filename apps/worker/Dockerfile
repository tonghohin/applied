FROM node:slim AS base
WORKDIR /app

FROM base AS pruner
RUN npm install -g turbo@^2
COPY . .
RUN turbo prune @repo/worker --docker

FROM base AS runner
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npm install -g pnpm
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile
RUN pnpm exec playwright install chromium --with-deps
COPY --from=pruner /app/out/full/ .
RUN addgroup --system nodejs \
    && adduser --system --ingroup nodejs worker \
    && chown -R worker:nodejs /app /ms-playwright
USER worker
CMD ["node", "--import", "tsx/esm", "apps/worker/src/index.ts"]
