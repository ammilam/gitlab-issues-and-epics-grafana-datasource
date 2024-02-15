ARG NODE_VERSION=20.11-bullseye-slim

FROM node:$NODE_VERSION AS build
WORKDIR /usr/src/app
COPY package*.json /usr/src/app/
RUN npm ci --only=production


FROM node:$NODE_VERSION AS production

ENV NODE_ENV production

WORKDIR /usr/src/app
ENV npm_config_cache /usr/src/app/.npm

ENV PATH /usr/src/app/node_modules/.bin:$PATH

COPY --from=build --chown=node:node /usr/src/app/node_modules /usr/src/app/node_modules
RUN mkdir -p /usr/src/app && chown -R node:node /usr/src/app
RUN mkdir -p /usr/src/app/.npm && chown -R node:node /usr/src/app/.npm
RUN mkdir -p  /usr/src/app/.npm/_cacache && chown -R node:node  /usr/src/app/.npm/_cacache
RUN mkdir -p  /usr/src/app/.npm/_logs && chown -R node:node  /usr/src/app/.npm/_logs
USER node

COPY . /usr/src/app

CMD ["npm", "run", "server"]
