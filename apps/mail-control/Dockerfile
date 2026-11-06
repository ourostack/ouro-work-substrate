FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/work-protocol/package.json packages/work-protocol/package.json
COPY apps/mail-control/package.json apps/mail-control/package.json
RUN npm install
COPY tsconfig.base.json vitest.config.ts ./
COPY packages/work-protocol packages/work-protocol
COPY apps/mail-control apps/mail-control
RUN npm run build --workspace @ouro.bot/work-protocol && npm run build --workspace @ouro/mail-control

FROM node:22-slim AS runtime
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json* ./
COPY --from=build /app/packages/work-protocol/package.json packages/work-protocol/package.json
COPY --from=build /app/packages/work-protocol/dist packages/work-protocol/dist
COPY --from=build /app/apps/mail-control/package.json apps/mail-control/package.json
COPY --from=build /app/apps/mail-control/dist apps/mail-control/dist
RUN npm install --omit=dev --ignore-scripts
EXPOSE 8080
ENTRYPOINT ["node", "apps/mail-control/dist/index.js"]

