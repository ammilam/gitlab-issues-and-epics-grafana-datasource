# Build Arguments
ARG NODE_VERSION=20.11-bullseye-slim

#Build Image
FROM node:$NODE_VERSION AS build
WORKDIR /usr/src/app
COPY package*.json /usr/src/app/
RUN npm ci --omit=dev --only=production

FROM node:$NODE_VERSION

ENV NODE_ENV production
RUN mkdir /.npm && chown node:node /.npm
WORKDIR /usr/src/app
COPY --from=build /usr/src/app/node_modules /usr/src/app/node_modules
COPY . /usr/src/app
RUN chown -R $(id -u node):$(id -g node) /.npm
EXPOSE 8080
CMD ["npm", "run", "server"]
