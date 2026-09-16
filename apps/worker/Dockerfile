FROM node:22-slim AS base
WORKDIR /app

FROM base AS pruner
RUN npm install -g turbo@^2
COPY . .
RUN turbo prune @repo/worker --docker

FROM base AS runner
ARG TARGETARCH
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
# pnpm 12 ships a native binary placed by its (lifecycle) install script; recent
# npm blocks global install scripts by default, so opt pnpm's back in.
RUN npm install -g --allow-scripts=pnpm pnpm@12.3.4
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile
# Bundled Chromium — used by the resume-PDF renderer, and as the headed stealth
# browser's automatic fallback (see packages/automation/src/stealth.ts) on
# platforms without Chrome. Real Google Chrome (materially better stealth than
# Chromium) is added on amd64 only — Chrome has no Linux/arm64 build.
RUN pnpm --filter @repo/automation exec playwright install --with-deps chromium \
    && if [ "$TARGETARCH" = "amd64" ]; then \
         pnpm --filter @repo/automation exec playwright install --with-deps chrome; \
       fi
# Virtual display so the headed browser can launch inside the container.
RUN apt-get update \
    && apt-get install -y --no-install-recommends xvfb \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /tmp/.X11-unix && chmod 1777 /tmp/.X11-unix
COPY --from=pruner /app/out/full/ .
COPY apps/worker/docker-entrypoint.sh ./apps/worker/docker-entrypoint.sh
RUN addgroup --system nodejs \
    && adduser --system --ingroup nodejs --home /home/worker worker \
    && chown -R worker:nodejs /app /ms-playwright /home/worker
USER worker
CMD ["sh", "apps/worker/docker-entrypoint.sh"]
