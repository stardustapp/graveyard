FROM node:12-alpine
RUN apk add --no-cache python2 build-base curl

WORKDIR /app
ADD package*.json ./
RUN npm ci
ADD web/ web/
ADD src/ src/

ARG GitHash=""
ENV DUST_GIT_HASH="${GitHash}"
