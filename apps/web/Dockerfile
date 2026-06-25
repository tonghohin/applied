FROM node:alpine AS base
RUN apk update && apk add --no-cache libc6-compat
WORKDIR /app

FROM base AS pruner
RUN npm install -g turbo@^2
COPY . .
RUN turbo prune web --docker

FROM base AS installer
RUN npm install -g pnpm
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

FROM base AS builder
RUN npm install -g pnpm
COPY --from=installer /app .
COPY --from=pruner /app/out/full/ .
COPY --from=pruner /app/tsconfig.json ./tsconfig.json
ARG NEXT_PUBLIC_BASE_URL=http://localhost:3000
ENV NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL
RUN pnpm turbo build --filter=web

FROM base AS runner
ENV NODE_ENV=production
RUN addgroup --system nodejs && adduser --system --ingroup nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "apps/web/server.js"]
