FROM node:24-bookworm-slim AS build
RUN npm install --global pnpm@11.25.0
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build:web
FROM nginx:1.28-alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY infra/web.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 443
