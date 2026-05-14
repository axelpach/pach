FROM node:20-slim

WORKDIR /app

RUN npm install -g pnpm@8.15.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY portal/package.json ./portal/
COPY server/package.json ./server/

RUN pnpm install --filter portal... --frozen-lockfile

COPY portal ./portal
COPY tools ./tools

ARG VITE_ZERO_SERVER_URL
ARG VITE_API_URL

ENV VITE_ZERO_SERVER_URL=$VITE_ZERO_SERVER_URL
ENV VITE_API_URL=$VITE_API_URL

RUN pnpm --filter portal build

EXPOSE 4173

CMD ["pnpm", "--filter", "portal", "preview"]
