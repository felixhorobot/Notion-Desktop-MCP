# For MCP directories (e.g. Glama) that start the server to list its tools.
# The tools themselves need a Notion Desktop app in debug mode on the same machine, so in a
# container the server starts and answers introspection, but tool calls report that Notion is not running.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server ./server
COPY skills ./skills
COPY launcher ./launcher
CMD ["node", "server/start.mjs"]
