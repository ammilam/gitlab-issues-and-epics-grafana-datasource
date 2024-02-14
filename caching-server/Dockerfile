# Build Arguments
ARG NODE_VERSION=20.11-bullseye-slim

# Build Image
FROM node:$NODE_VERSION AS build

COPY package*.json /tmp
RUN cd /tmp && npm ci --omit=dev --only=production
RUN mkdir -p /usr/src/app && mv /tmp/node_modules /usr/src/app

# Production Image
FROM node:$NODE_VERSION AS production
ENV npm_config_cache /usr/src/app/.npm
ENV NODE_ENV production
RUN mkdir -p /usr/src/app/.npm && chown -R node:node /usr/src/app
USER node
RUN chown -R node:node /usr/src/app/.npm/

WORKDIR /usr/src/app
COPY --from=build /usr/src/app/node_modules /usr/src/app/node_modules
COPY . /usr/src/app
RUN chown -R node:node /usr/src/app
EXPOSE 8080
CMD ["npm", "run", "server"]
