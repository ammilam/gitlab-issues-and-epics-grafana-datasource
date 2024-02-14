# Build Arguments
ARG NODE_VERSION=20.11-bullseye-slim

#Build Image
FROM node:$NODE_VERSION AS build
WORKDIR /usr/src/app
COPY package*.json /usr/src/app/
RUN npm ci --omit=dev --only=production
RUN npm cache clean --force 
FROM node:$NODE_VERSION

ENV NODE_ENV production
WORKDIR /usr/src/app
RUN mkdir .npm
ENV npm_config_cache /usr/src/app/.npm
RUN chown -R node:node /usr/src/app
COPY --from=build /usr/src/app/node_modules /usr/src/app/node_modules
COPY . /usr/src/app
RUN npm cache clean --force 
USER node
EXPOSE 8080
CMD ["npm", "run", "server"]
