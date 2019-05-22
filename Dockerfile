FROM node:12-alpine

WORKDIR /usr/src/app

COPY package.json package-lock.json ./
RUN npm install
COPY . .

ENV config "/data/config.json"
VOLUME ["/data"]

CMD [ "npm", "run", "start" ]