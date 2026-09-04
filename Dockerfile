# KEPTA — MCP-Server im Container.
#
# Verzeichnisse wie Glama starten den Server hierueber und pruefen, ob er auf
# Introspektion antwortet. Gebaut wird aus dem Quelltext dieses Repos, nicht aus
# dem npm-Paket: so prueft der Test, was hier liegt, und nicht was zuletzt
# veroeffentlicht wurde.
#
# Bauen:   docker build -t kepta-mcp .
# Starten: docker run --rm -i -v kepta-data:/data kepta-mcp
#
# Der Server spricht stdio — daher -i. Die Datenbank liegt unter /data, damit
# sie einen Neustart des Containers ueberlebt.

FROM node:22-alpine AS build
WORKDIR /app
# Erst die Manifeste: so bleibt die Abhaengigkeitsschicht im Cache, solange sich
# nur Quelltext aendert.
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:npm

FROM node:22-alpine
# node:sqlite ist erst ab 22.13 ohne Flag verfuegbar. Bricht der Bau hier ab,
# ist das Basisabbild zu alt — besser hier als beim ersten Nutzer.
RUN node -e "require('node:sqlite')"
WORKDIR /app
COPY --from=build /app/npm/bin/kepta.js /usr/local/bin/kepta
RUN chmod +x /usr/local/bin/kepta
# Ausserhalb des Containers weiterverwendbar ablegen. Das Verzeichnis muss dem
# unprivilegierten Nutzer gehoeren, sonst scheitert der Start an "unable to open
# database file" — VOLUME allein legt es als root an.
ENV KEPTA_DATA_DIR=/data
RUN mkdir -p /data && chown -R node:node /data
VOLUME ["/data"]
# Kein Root: der Server braucht nichts davon.
USER node
ENTRYPOINT ["kepta"]
