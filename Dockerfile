FROM node:12-slim

# Create app directory
WORKDIR /usr/src/kikoeru

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

RUN npm ci --only=production
# If you are building your code for production
# RUN npm ci --only=production

# Bundle app source
COPY . .

RUN find /usr/src/kikoeru/dist -type d -exec chmod 755 {} \; && find /usr/src/kikoeru/dist -type f -exec chmod 644 {} \;

# 持久化
VOLUME [ "/usr/src/kikoeru/sqlite", "/usr/src/kikoeru/config", "/usr/src/kikoeru/covers"]

EXPOSE 8888
CMD [ "node", "app.js" ]
