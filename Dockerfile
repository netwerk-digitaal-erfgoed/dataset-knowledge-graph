FROM node:lts-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN NODE_ENV=production npm run compile

FROM adfreiburg/qlever
LABEL org.opencontainers.image.source="https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph"

USER root
RUN curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - \
    && apt-get update \
    && apt-get install -y nodejs tini \
    && rm -rf /var/lib/apt/lists/*
RUN node --version && npm --version

RUN apt-get install adduser -y \
    && adduser --disabled-password --gecos "" node \
    && apt-get remove -y adduser \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /app/
COPY package*.json ./
RUN npm ci
COPY --from=build /app/build /app/build
COPY --from=build /app/queries /app/queries
RUN mkdir /app/output /app/imports && \
    chown node /app/output /app/imports
USER node
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm", "start"]
