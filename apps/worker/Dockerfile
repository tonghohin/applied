FROM node:20-slim AS pruner
WORKDIR /app
RUN npm install -g turbo@^2
COPY . .
RUN turbo prune @repo/worker --docker

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN corepack enable
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile
RUN npx playwright install chromium --with-deps
COPY --from=pruner /app/out/full/ .
RUN addgroup --system nodejs \
    && adduser --system --ingroup nodejs worker \
    && chown -R worker:nodejs /app /ms-playwright
USER worker
CMD ["node", "--import", "tsx/esm", "apps/worker/src/index.ts"]
