# Usamos la imagen oficial de Bun
FROM oven/bun:latest as base
WORKDIR /usr/src/app

# Instalar dependencias 
FROM base AS install
RUN mkdir -p /temp/dev
# En algunas versiones de Bun el lockfile es .lock y en otras .lockb
# Copiamos lo que haya disponible
COPY package.json bun.lock* /temp/dev/
RUN cd /temp/dev && bun install

# Copiamos las dependencias y el código fuente
FROM base AS release
COPY --from=install /temp/dev/node_modules node_modules
COPY . .

# Puerto por defecto
EXPOSE 3000

# Comando para arrancar la API con Hot-Reload (Watch Mode)
ENTRYPOINT [ "bun", "--watch", "run", "src/index.ts" ]
