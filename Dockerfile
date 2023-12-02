# This dockerfile generates a single-container application
# It copies build artifacts the from front-end image
# If you want to separate the front-end from the back-end, it should work as well

FROM node:14-alpine as build-dep

# Create app directory
WORKDIR /usr/src/kikoeru

RUN apk add --update --no-cache curl py-pip
RUN apk update && apk add python3 make gcc g++ 

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./
RUN npm ci --only=production

# Final stage
FROM node:14-alpine
ENV IS_DOCKER=true
WORKDIR /usr/src/kikoeru

# Copy build artifacts
COPY --from=build-dep /usr/src/kikoeru /usr/src/kikoeru
COPY dist /usr/src/kikoeru/dist

# Bundle app source
COPY . .

# Tini
RUN apk add --no-cache tini ffmpeg
ENTRYPOINT ["/sbin/tini", "--"]

# 持久化
VOLUME [ "/usr/src/kikoeru/sqlite", "/usr/src/kikoeru/config", "/usr/src/kikoeru/covers"]

EXPOSE 8888
CMD [ "node", "app.js" ]
