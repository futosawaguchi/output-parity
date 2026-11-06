# The showcase for the judges (README「審査用の公開環境」): the bundled samples only.
# No PHP or Python inside on purpose: the showcase runs no programs (lib/showcase.ts).
# Needs at run time: KAWARIME_ACCESS_CODE (turns the showcase on) and ANTHROPIC_API_KEY,
# both set as secrets on the host, never in this file or the image.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
# runs/ is written when Claude judges again or looks for a cause, so the app's own user owns the tree.
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 3000
# One instance only: jobs are held in memory, and one job runs at a time (lib/jobs.ts).
CMD ["sh", "-c", "exec node_modules/.bin/next start -H 0.0.0.0 -p ${PORT:-3000}"]
