FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node udp-relay.mjs torrent.js ./
USER node
EXPOSE 8080
CMD ["node", "/app/udp-relay.mjs"]
