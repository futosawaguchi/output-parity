# The showcase for the judges (README「審査用の公開環境」): the bundled samples only.
# No PHP or Python inside on purpose: the showcase runs no programs (lib/showcase.ts).
# Needs at run time: KAWARIME_ACCESS_CODE (turns the showcase on) and ANTHROPIC_API_KEY,
# both set as secrets on the host, never in this file or the image. It will not start without them.

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
# Without the code the app would fall back to the local check, which trusts the Host header; on a
# public address anyone can send that header. Without the key every button a judge may press would
# fail. So the container refuses to start in either case, and says which value is missing.
CMD ["sh", "-c", "if [ -z \"$(printf %s \"$KAWARIME_ACCESS_CODE\" | tr -d '[:space:]')\" ]; then echo 'KAWARIME_ACCESS_CODE が設定されていません。公開環境はアクセスコード無しでは起動しません → 置き場の環境変数に 12 文字以上の値を入れてください' >&2; exit 1; fi; if [ -z \"$(printf %s \"$ANTHROPIC_API_KEY\" | tr -d '[:space:]')\" ]; then echo 'ANTHROPIC_API_KEY が設定されていません。公開環境は API キー無しでは起動しません → 置き場の環境変数（秘密の値）に入れてください' >&2; exit 1; fi; exec node_modules/.bin/next start -H 0.0.0.0 -p ${PORT:-3000}"]
