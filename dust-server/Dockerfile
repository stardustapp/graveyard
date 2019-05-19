FROM node:10-alpine
RUN apk add --no-cache python2 build-base curl

WORKDIR /app
ADD nodejs nodejs
ADD manifest.json .
ADD src src
ADD vendor vendor

RUN cd nodejs && npm ci && cd - && \
    cd src/engines/http-server && npm ci && cd -

ARG GitHash=""
ENV DUST_GIT_HASH="${GitHash}"
RUN node nodejs test-http
