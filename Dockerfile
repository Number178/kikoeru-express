# This dockerfile generates a single-container application
# It copies build artifacts the from front-end image
# If you want to separate the front-end from the back-end, it should work as well

# Use build-args to set a specific version
# Example: if you want to use the build artifacts from muveex/kikoeru-quasar:v0.6.0, then you should set this to "v0.6.0"
ARG FRONTEND_VERSION="unstable"
FROM muveex/kikoeru-quasar:${FRONTEND_VERSION} as frontend

FROM node:14-alpine as build-dep

# Create app directory
WORKDIR /usr/src/kikoeru

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

RUN apk update && apk add python make gcc g++ && npm ci --only=production
# If you are building your code for production
# RUN npm ci --only=production

FROM node:14-alpine

ENV IS_DOCKER=true

WORKDIR /usr/src/kikoeru

# Copy build artifacts
COPY --from=build-dep /usr/src/kikoeru /usr/src/kikoeru
COPY --from=frontend /var/www /usr/src/kikoeru/dist

# Bundle app source
COPY . .

# Tini
RUN apk add --no-cache tini
ENTRYPOINT ["/sbin/tini", "--"]

# 持久化
VOLUME [ "/usr/src/kikoeru/sqlite", "/usr/src/kikoeru/config", "/usr/src/kikoeru/covers"]

EXPOSE 8888
CMD [ "node", "app.js" ]
