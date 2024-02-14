# Build Arguments
ARG NODE_VERSION=20.11-alpine:8080

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
CMD ["dumb-init", "npm", "run", "server"]
