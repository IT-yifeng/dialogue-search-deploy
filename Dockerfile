# 三个阶段都先拷齐所有 workspace 的 package.json：npm ci 会校验 lock 文件与各 workspace 一致，缺一个就报错
# 阶段 1：构建前端静态文件
FROM node:22-alpine AS web
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY server/package.json server/
COPY pipeline/package.json pipeline/
COPY web/package.json web/
RUN npm ci -w web
COPY web web
# 产出 web/dist
RUN npm run build -w web

# 阶段 2：构建后端
FROM node:22-alpine AS server
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY server/package.json server/
COPY pipeline/package.json pipeline/
COPY web/package.json web/
RUN npm ci -w server
COPY server server
# 产出 server/dist
RUN npm run build -w server

# 阶段 3：运行镜像，只装后端的生产依赖
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY pipeline/package.json pipeline/
COPY web/package.json web/
RUN npm ci -w server --omit=dev && npm cache clean --force
# 产物必须放在 server/dist：server/package.json 声明了 "type": "module"，
# Node 往上找到的第一个 package.json 决定 .js 按 ESM 解析；放到 /app/dist 会找到根 package.json 而按 CJS 解析并报错
COPY --from=server /app/server/dist ./server/dist
# 后端直接托管前端（服务按 cwd=/app 查找 ./public）；注意 Dockerfile 不支持行尾注释，注释必须独占一行
COPY --from=web /app/web/dist ./public
USER node
EXPOSE 8080
CMD ["node", "server/dist/index.js"]
