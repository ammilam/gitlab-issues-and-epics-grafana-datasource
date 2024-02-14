# Build Arguments
ARG NODE_VERSION=20.11-bullseye-slim

# Build Image
FROM node:$NODE_VERSION AS build

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --omit=dev --only=production

# Production Image
FROM node:$NODE_VERSION AS production
ENV NODE_ENV production

WORKDIR /usr/src/app

COPY --from=build /usr/src/app/node_modules ./node_modules
COPY . .

EXPOSE 8080
CMD ["npm", "run", "server"]
