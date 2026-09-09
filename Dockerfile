# ---- build stage: compiles the React PWA and the TypeScript server ----------
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --no-audit --no-fund
COPY server server
COPY web web
RUN npm run build --workspace web && npm run build --workspace server

# ---- runtime stage: production dependencies only ----------------------------
FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/web/dist web/dist
ENV PORT=8080
EXPOSE 8080
USER node
CMD ["node", "server/dist/index.js"]
