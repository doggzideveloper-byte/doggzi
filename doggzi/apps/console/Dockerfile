# Build context: the doggzi/ workspace root (docker-compose sets it), so packages/ui is available.
FROM node:22-alpine AS build
WORKDIR /ws
COPY package.json package-lock.json ./
COPY packages/ui/package.json packages/ui/
COPY apps/console/package.json apps/console/
RUN npm ci --workspace @doggzi/console --include-workspace-root=false
COPY packages/ui packages/ui
COPY apps/console apps/console
RUN npm run build -w @doggzi/console

FROM nginx:1.27-alpine
COPY --from=build /ws/apps/console/dist /usr/share/nginx/html
COPY apps/console/nginx.console.conf /etc/nginx/conf.d/default.conf
