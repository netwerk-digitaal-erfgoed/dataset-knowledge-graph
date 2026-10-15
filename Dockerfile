FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN NODE_ENV=production npm run compile

# No QLever in this image: in production QLever runs in a sidecar of the pod
# (QLEVER_ENV=remote), from the unmodified upstream image.
FROM node:24-alpine
LABEL org.opencontainers.image.source="https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph"

RUN apk add --no-cache tini

ENV NODE_ENV=production
WORKDIR /app/
COPY package*.json ./
RUN npm ci
COPY --from=build /app/build /app/build
COPY --from=build /app/queries /app/queries
RUN mkdir /app/output /app/imports && \
    chown node /app/output /app/imports
USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npm", "start"]
