ARG NODE_VERSION=20.11-bullseye-slim

FROM node:$NODE_VERSION AS build
WORKDIR /usr/src/app
COPY --chown=node:node package*.json /usr/src/app/
RUN npm ci --only=production
RUN mkdir -p /usr/src/app/.npm && chown -R node:node /usr/src/app/.npm

FROM node:$NODE_VERSION AS production

ENV NODE_ENV production

WORKDIR /usr/src/app
ENV npm_config_cache /usr/src/app/.npm

COPY . /usr/src/app

COPY --from=build --chown=node:node /usr/src/app/node_modules /usr/src/app/node_modules
RUN mkdir -p /usr/src/app/.npm && chown -R 472:472 "/usr/src/app/.npm"
RUN chown -R node:node /usr/src/app/.npm
RUN mkdir -p /usr/src/app/data && chown -R 472:472 /usr/src/app/data
RUN chown -R 1000:1000 "/usr/src/app/.npm"
RUN chown -R node:node /usr/src/app/data 
RUN chmod -R 777 /usr/src/app/data

EXPOSE 3000
EXPOSE 8080

USER node

CMD ["npm", "run", "server"]
