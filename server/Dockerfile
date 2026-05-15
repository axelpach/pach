FROM node:20-slim

WORKDIR /app

RUN npm install -g pnpm@8.15.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json ./server/
COPY portal/package.json ./portal/

RUN pnpm install --frozen-lockfile

COPY pach.config.ts drizzle.config.ts tsconfig.json ./
COPY db ./db
COPY server ./server

ENV PORT=3002
EXPOSE 3002

CMD ["sh", "-c", "pnpm db:migrate && pnpm --filter server start"]
