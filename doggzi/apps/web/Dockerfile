# Build context: the doggzi/ workspace root (docker-compose sets it), so packages/ui is available.
FROM node:22-alpine AS build
WORKDIR /ws
COPY package.json package-lock.json ./
COPY packages/ui/package.json packages/ui/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @doggzi/web --include-workspace-root=false
COPY packages/ui packages/ui
COPY apps/web apps/web
RUN npm run build -w @doggzi/web

FROM nginx:1.27-alpine
COPY --from=build /ws/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.spa.conf /etc/nginx/conf.d/default.conf
