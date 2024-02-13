# Build Arguments
ARG NODE_VERSION=21.4.0-alpine3.17

#Build Image
FROM node:$NODE_VERSION AS build
WORKDIR /usr/src/app
COPY package*.json /usr/src/app/
RUN npm ci --omit=dev --only=production

FROM node:$NODE_VERSION

ENV NODE_ENV production
RUN apk add --no-cache dumb-init
USER node
WORKDIR /usr/src/app
RUN mkdir /usr/src/app/billing
COPY --from=build /usr/src/app/node_modules /usr/src/app/node_modules
COPY . /usr/src/app
EXPOSE 8080
RUN chown -R node:node /usr/src/app
CMD ["dumb-init", "npm", "run", "server"]
