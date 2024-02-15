ARG NODE_VERSION=20.11-bullseye-slim

FROM node:$NODE_VERSION AS build
WORKDIR /usr/src/app
COPY package*.json /usr/src/app/
RUN npm ci --only=production

# Add this line to change the ownership of the npm cache directory to the current user
RUN chown -R node:node /usr/src/app

FROM node:$NODE_VERSION AS production

ENV NODE_ENV production
WORKDIR /usr/src/app
USER node
COPY --from=build /usr/src/app/node_modules /usr/src/app/node_modules
COPY . /usr/src/app
CMD ["npm", "run", "server"]
