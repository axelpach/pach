FROM node:20-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssh-client \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@8.15.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json ./server/
COPY portal/package.json ./portal/

RUN pnpm install --frozen-lockfile

COPY pach.config.ts drizzle.config.ts tsconfig.json ./
COPY db ./db
COPY server ./server

ARG PACH_RELEASE_ID
ENV NODE_ENV=production
ENV PORT=3002
ENV PACH_RELEASE_ID=$PACH_RELEASE_ID
EXPOSE 3002

CMD ["sh", "server/scripts/deploy-start.sh"]
