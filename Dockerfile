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
WORKDIR /app
# Die eine Abhaengigkeit des Pakets: SQLite mit Verschluesselung. Sie ist nativ
# und steckt deshalb nicht im Bundle — npm holt den fertigen Build fuer Alpine
# (musl), genau in der Fassung, die npm/package.json pinnt.
COPY npm/package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
# Laedt sie nicht, bricht der Bau hier ab — besser hier als beim ersten Nutzer.
RUN node -e "new (require('better-sqlite3-multiple-ciphers'))(':memory:').pragma('cipher = sqlcipher')"
COPY --from=build /app/npm/bin/kepta.js /app/bin/kepta.js
RUN chmod +x /app/bin/kepta.js && ln -s /app/bin/kepta.js /usr/local/bin/kepta
# Ein Container hat keinen Schluesselbund: ohne -e KEPTA_DB_KEY=<64 Hex-Zeichen>
# bleibt die Datenbank unverschluesselt (der Server sagt es beim Start).
# Ausserhalb des Containers weiterverwendbar ablegen. Das Verzeichnis muss dem
# unprivilegierten Nutzer gehoeren, sonst scheitert der Start an "unable to open
# database file" — VOLUME allein legt es als root an.
ENV KEPTA_DATA_DIR=/data
RUN mkdir -p /data && chown -R node:node /data
VOLUME ["/data"]
# Kein Root: der Server braucht nichts davon.
USER node
ENTRYPOINT ["kepta"]
