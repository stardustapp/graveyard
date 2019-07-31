FROM node:12-alpine AS builder
RUN apk add --no-cache python2 build-base curl

WORKDIR /app
ADD package*.json ./
RUN npm ci --only=production


FROM node:12-alpine

COPY --from=builder /app/ /app/
WORKDIR /app
ADD web/ web/
ADD src/ src/

ARG GitHash=""
ENV DUST_GIT_HASH="${GitHash}"
