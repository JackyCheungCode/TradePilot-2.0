FROM node:22-alpine
ENV NODE_ENV=production PORT=8787 CLAMD_HOST=clamav CLAMD_PORT=3310
WORKDIR /app
COPY server.mjs ./server.mjs
USER node
EXPOSE 8787
CMD ["node", "server.mjs"]
