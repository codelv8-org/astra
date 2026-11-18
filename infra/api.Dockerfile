FROM node:24-bookworm-slim
RUN npm install --global pnpm@11.25.0
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build:api
USER node
EXPOSE 7443
CMD ["pnpm", "--filter", "@crewnest/api", "start"]
