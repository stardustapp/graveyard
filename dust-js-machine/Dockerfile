FROM node:10-alpine

WORKDIR /app
ADD drivers drivers
ADD package.json .
ADD package-lock.json .
ADD src src
ADD default-www default-www

RUN npm ci && \
    cd src/engines/http-server && npm ci && cd -

ARG GitHash=""
ENV DUST_GIT_HASH="${GitHash}"
