FROM node:24-alpine AS build
WORKDIR /app
COPY web/package.json web/yarn.lock ./
RUN yarn install --frozen-lockfile
COPY web/ ./
RUN yarn build

FROM node:24-alpine
WORKDIR /app
COPY --from=build /app/.output ./.output
ENV PORT=3158
EXPOSE 3158
CMD ["node", ".output/server/index.mjs"]
