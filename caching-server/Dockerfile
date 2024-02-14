# Build Arguments
ARG NODE_VERSION=20.11-alpine

#Build Image
FROM node:$NODE_VERSION AS build
WORKDIR /usr/src/app
COPY package*.json /usr/src/app/
RUN npm ci --omit=dev --only=production

FROM node:$NODE_VERSION

ENV NODE_ENV production
RUN mkdir .npm
RUN chown -R 472:472 ".npm"
WORKDIR /usr/src/app
COPY --from=build /usr/src/app/node_modules /usr/src/app/node_modules
COPY . /usr/src/app
EXPOSE 8080
RUN npm cache clean --force
USER node
CMD ["npm", "run", "server"]
