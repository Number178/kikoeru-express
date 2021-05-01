# This dockerfile generates a single-container application
# It copies build artifacts the from front-end image
# If you want to separate the front-end from the back-end, it should work as well

FROM node:14-alpine as build-dep

# Create app directory
WORKDIR /usr/src/kikoeru

RUN apk update && apk add python make gcc g++ 

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./
RUN npm ci --only=production

# Build SPA and PWA
FROM node:14 as build-frontend
WORKDIR /frontend
# @quasar/app v1 requires node-ass, which takes 30 minutes to compile libsass in CI for arm64 and armv7
# So I prebuilt the binaries for arm64 and armv7
# @quasar/app v2 no longer uses this deprecated package, so this line will be removed in the future
ENV SASS_BINARY_SITE="https://github.com/umonaca/node-sass/releases/download"
RUN npm install -g @quasar/cli
ARG FRONTEND_VERSION="unstable"
# Workaround docker cache
# https://stackoverflow.com/questions/36996046/how-to-prevent-dockerfile-caching-git-clone
ADD https://api.github.com/repos/kikoeru-project/kikoeru-quasar/git/refs/heads/unstable /tmp/version.json
RUN git clone -b ${FRONTEND_VERSION} https://github.com/kikoeru-project/kikoeru-quasar.git .
RUN npm ci
RUN quasar build && quasar build -m pwa

# Final stage
FROM node:14-alpine
ENV IS_DOCKER=true
WORKDIR /usr/src/kikoeru

# Copy build artifacts
COPY --from=build-dep /usr/src/kikoeru /usr/src/kikoeru
ARG FRONTEND_TYPE="pwa"
COPY --from=build-frontend /frontend/dist/${FRONTEND_TYPE} /usr/src/kikoeru/dist

# Bundle app source
COPY . .

# Tini
RUN apk add --no-cache tini
ENTRYPOINT ["/sbin/tini", "--"]

# 持久化
VOLUME [ "/usr/src/kikoeru/sqlite", "/usr/src/kikoeru/config", "/usr/src/kikoeru/covers"]

EXPOSE 8888
CMD [ "node", "app.js" ]
