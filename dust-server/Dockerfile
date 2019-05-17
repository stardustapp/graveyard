FROM node:10-alpine
RUN apk add --no-cache python2 build-base

WORKDIR /app
ADD nodejs nodejs
RUN cd nodejs && npm ci

ADD manifest.json .
ADD src src
ADD vendor vendor
ADD .git .git
RUN apk add --no-cache git curl

RUN node nodejs test-http
