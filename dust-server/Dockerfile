FROM node:10-alpine
RUN apk add --no-cache python2 build-base curl

WORKDIR /app
ADD nodejs nodejs
RUN cd nodejs && npm ci

ADD manifest.json .
ADD src src
ADD vendor vendor

ARG GitHash=""
ENV DUST_GIT_HASH="${GitHash}"
RUN node nodejs test-http
