# Build Arguments
ARG NODE_VERSION=20.11-bullseye-slim

# Build Image
FROM node:$NODE_VERSION AS build
COPY package*.json /tmp
RUN cd /tmp && npm ci --omit=dev --only=production
RUN mkdir -p /usr/src/app && mv /tmp/node_modules /usr/src/app

# Production Image
FROM node:$NODE_VERSION AS production
WORKDIR /usr/src/app
# RUN mkdir -p /usr/src/app/ && chown -R node:node /usr/src/app
# RUN mkdir -p /usr/src/app/.npm/_cacache/tmp && chown -R node:node /usr/src/app/.npm/_cacache
# RUN mkdir -p /usr/src/app/.npm/_logs && chown -R node:node /usr/src/app/.npm/_logs
# RUN mkdir -p /usr/src/app/data && chown -R node:node /usr/src/app/data

ENV npm_config_cache /usr/src/app/.npm
USER node

ENV NODE_ENV production
# USER node

COPY --from=build /usr/src/app/node_modules /usr/src/app/node_modules
COPY . /usr/src/app
EXPOSE 8080
CMD ["npm", "run", "server"]
