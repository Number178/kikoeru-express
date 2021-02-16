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

COPY --from=build-dep /usr/src/kikoeru /usr/src/kikoeru

# Bundle app source
COPY . .

# Make it easier for me to pack things up on Windoze
RUN find /usr/src/kikoeru/dist -type d -exec chmod 755 {} \; && find /usr/src/kikoeru/dist -type f -exec chmod 644 {} \;

# Tini
RUN apk add --no-cache tini
ENTRYPOINT ["/sbin/tini", "--"]

# 持久化
VOLUME [ "/usr/src/kikoeru/sqlite", "/usr/src/kikoeru/config", "/usr/src/kikoeru/covers"]

EXPOSE 8888
CMD [ "node", "app.js" ]
