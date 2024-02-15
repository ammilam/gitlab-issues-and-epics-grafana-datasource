# # Build Arguments
# ARG NODE_VERSION=20.11-bullseye-slim

# # Build Image
# FROM node:$NODE_VERSION AS build
# COPY package*.json /tmp
# RUN cd /tmp && npm ci --omit=dev --only=production
# RUN mkdir -p /usr/src/app && mv /tmp/node_modules /usr/src/app

# # Production Image
# FROM node:$NODE_VERSION AS production
# WORKDIR /usr/src/app

# # Install dumb-init
# RUN apt-get update && apt-get install -y dumb-init
# RUN mkdir -p /usr/src/app/.npm
# ENV npm_config_cache /usr/src/app/.npm

# COPY --from=build /usr/src/app/node_modules /usr/src/app/node_modules
# COPY . /usr/src/app
# EXPOSE 8080

# # Use dumb-init as the entrypoint
# ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# CMD ["npm", "run", "server"]


FROM node:NODE_VERSION AS build
WORKDIR /usr/src/app
COPY package*.json /usr/src/app/
RUN npm ci --only=production

FROM node:$NODE_VERSION AS production

ENV NODE_ENV production
WORKDIR /usr/src/app
COPY --from=build /usr/src/app/node_modules /usr/src/app/node_modules
COPY . /usr/src/app
CMD ["npm", "run", "server"]