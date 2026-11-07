# 部署文档（方案 A：Render + Neon + Cloudflare R2）

对应手册 §8。本文只讲「怎么操作」；变量含义见手册 §8.3，上线验收清单见 §8.5，本文第 6 节把清单里每一项写成了可直接粘贴的命令。

> 顺序很重要：**先把视频和台词灌进 Neon / R2，再部署服务**。服务启动时不会检查数据，顺序反了只是搜出来没有视频。

## 0. 准备

- 本机：`node` 22、`ffmpeg`（`brew install ffmpeg node@22`）。
- 账号：Cloudflare（R2）、Neon、GitHub、Render。
- 仓库：代码推到 GitHub 私有仓库。推送前确认 `git status` 里没有 `raw/`、`work/`、`.env`（它们已在 `.gitignore`，不要改）。

## 1. Cloudflare R2

1. R2 → Create bucket，名字 `tbbt-media`，**保持私有**。
   - 不要点 Public access 里的「Allow Access」，也不要绑定公开的自定义域名；`r2.dev` 子域保持 Disabled。
2. R2 → Manage API Tokens → Create API token：
   - 权限选 **Object Read & Write**；
   - 范围选「Apply to specific buckets only」，只勾 `tbbt-media`；
   - 创建后记下 `Access Key ID` 和 `Secret Access Key`（**只显示一次**）。
3. 在 R2 概览页右侧记下 `Account ID`。
4. 设用量提醒：Cloudflare 控制台 → Notifications → Add → 选 R2 相关的用量通知（存储量、请求数）。
5. 不要把 Secret 贴进聊天、截图或任何会进 git 的文件；只写进本机 `.env` 和 Render 的环境变量。
6. **（M8 截图导出）CORS**：蒙版内「截图」用 canvas 读取预签名视频，需要在桶上允许**站点域名**跨域 `GET`。**列表缩略图 JPEG 不依赖此项**（见手册 §7.9）。
   - R2 → bucket `tbbt-media` → **Settings** → **CORS policy**，示例（把 `https://你的服务.onrender.com` 换成 Render 域名或自定义域）：

   ```json
   [
     {
       "AllowedOrigins": ["https://你的服务.onrender.com", "http://localhost:5173"],
       "AllowedMethods": ["GET", "HEAD"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag", "Content-Length", "Content-Type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   - 本地开发走 Vite 代理时视频同源，可不配 CORS 也能在 `localhost` 试截图；上线 R2 播放地址直连对象域时必须配置。
   - 未配置时：**播放不受影响**（主播放器不设 `crossOrigin`）；仅「截图」会提示无法加载画面。按上文补 CORS 后刷新再试。

## 2. Neon

1. 在项目里找到两条连接串：
   - **池化**（主机名带 `-pooler`）→ 服务运行时用，填 Render 的 `DATABASE_URL`；
   - **直连**（不带 `-pooler`）→ 迁移与管线用，填本机 `.env` 的 `DATABASE_URL_UNPOOLED`。
2. 建表（只需做一次，可重复执行）：

   ```bash
   npm run db:migrate
   ```

   迁移里已经包含 `CREATE EXTENSION pg_trgm`，不用在控制台单独启用。
3. 在 Neon 控制台设用量提醒（Billing / Usage 相关通知）。

## 3. 灌入语料（在本机执行）

本机 `.env` 需要这些变量（模板见 `.env.example`）：

```
DATABASE_URL=...            # 池化
DATABASE_URL_UNPOOLED=...   # 直连
STORAGE_DRIVER=r2
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=tbbt-media
```

```bash
npm run db:migrate                   # 确保已有 lines.frame_key（002）
npm run pipeline -- transcode        # S1：转码（耗时最长）
npm run pipeline -- ingest --clean   # S2～S4：解析、对齐、入库
npm run pipeline -- upload           # S5：整集 mp4 上传到 R2
npm run pipeline -- thumbnails       # S5.5：截帧 JPEG 上传 + 写 frame_key；可先 `--only S01E01` 试跑
npm run pipeline -- qa               # S6：看 work/qa-report.md，不合格的集修好后重跑
```

- `ingest` 要在 `transcode` 之后跑：只有 `work/mp4` 里已有对应文件的集，才会在库里登记视频。
- `upload` 可以随时中断、反复重跑：已存在且大小一致的文件会跳过，转码后文件变了会自动覆盖，`--force` 强制全部重传。单个文件失败不会中断整批，末尾会汇总，重跑同一条命令即可补齐。
- `upload` 结束时会自动校验「work/mp4 的文件」与「库里登记的视频」是否一一对应。
- `thumbnails` 依赖 `work/mp4`、库里已有台词与 `video_key`，以及对象存储凭据（与 `upload` 相同）。线上列表与蒙版优先用 `thumbnailUrl`（小 JPEG）；未跑 `thumbnails` 时前端会回退为 `<video>` seek。

## 4. 部署到 Render

1. Render → New → Web Service → 连接 GitHub 仓库。
2. 配置：
   - Language / Runtime：**Docker**（读取仓库根目录的 `Dockerfile`）；
   - Region：**Singapore**（离大陆最近的免费区域；如果用户在海外，选离用户近的）；
   - Instance Type：Free；
   - Health Check Path：`/healthz`；
   - Auto-Deploy：开（合并到默认分支后自动部署）。
3. Environment Variables：

   | 变量 | 值 |
   |---|---|
   | `DATABASE_URL` | Neon **池化**连接串 |
   | `STORAGE_DRIVER` | `r2` |
   | `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | 第 1 步记下的值 |
   | `PUBLIC_BASE_URL` | 服务的外部地址，如 `https://xxx.onrender.com`（部署后才知道，先填预期值，拿到真实域名后改一次） |
   | `VITE_COMPLAINT_EMAIL` | （可选）投诉联系邮箱；**构建时**写入前端页脚（格式 `name@example.com`，等号两侧勿加空格） |

   `NODE_ENV=production` 已写在 Dockerfile 里，`PORT` 由 Render 注入，都不用填。本地开发时 `VITE_*` 读仓库根目录的 `.env` / `.env.local`，改后需重启 `npm run dev`。
4. 点 Deploy。首次构建约几分钟。
5. 服务**启动失败**时先看 Render 日志，配置错误会在第一行直接说明原因（见第 7 节）。
6. 可选：用 UptimeRobot 每 5 分钟请求一次 `https://xxx.onrender.com/healthz`，避免免费实例休眠后首次打开要等数十秒。

## 5. 域名与 `PUBLIC_BASE_URL`

分享链接由 `PUBLIC_BASE_URL` 拼成。部署完成拿到真实域名后，把它填进 Render 的 `PUBLIC_BASE_URL` 并重新部署，否则「生成链接」得到的地址是错的。

## 6. 上线验证（对应手册 §8.5）

先设置变量（后面所有命令都用它们）：

```bash
BASE=https://xxx.onrender.com      # 你的服务地址
```

### 6.1 `/healthz` 与匿名搜索

```bash
curl -i $BASE/healthz
# 期望：200 {"ok":true}

curl -i "$BASE/api/search?q=hello"
# 期望：200（手册 §4.2：不设站点口令，不应因「未登录」返回 401）

curl -i "$BASE/api/discover"
# 期望：200，items 长度不超过 9
```

### 6.1.1 限流（手册 §6）

`POST /api/shares` 同一 IP 每分钟 10 次。下面第 11 次应是 429，响应头带 `Retry-After`，响应体 `error.code` 为 `RATE_LIMITED`。请求体不合法也会计数。

```bash
for i in $(seq 1 11); do
  curl -s -D - -o /dev/null -X POST "$BASE/api/shares" \
    -H 'content-type: application/json' \
    -d '{"lineIds":[1]}' | head -n 1
done
# 期望：前 10 次不是 429（多为 400），第 11 次 HTTP/1.1 429
```

`GET /api/shares/<有效或无效 id>` 同一 IP 每分钟 60 次，第 61 次 429（与 `GET /api/search` 同级）。

```bash
for i in $(seq 1 61); do
  curl -s -D - -o /dev/null "$BASE/api/shares/abcd1234" | head -n 1
done
# 期望：第 61 次 HTTP/1.1 429
```

### 6.1.2 搜索性能（M7）

预热后在本机或线上跑基准（P95 目标 &lt; 300ms）：

```bash
BASE=$BASE BENCH_Q=penny BENCH_N=100 npm run bench:search -w server
```

### 6.2 搜索、播放

```bash
curl -s "$BASE/api/search?q=penny" | head
curl -s "$BASE/api/search?q=佩妮" | head
curl -s "$BASE/api/search?q=bazinga%20penny" | head
# 期望：都返回 200（中文、英文、两个词各试一次）

curl -s $BASE/api/lines/<上面结果里的某个 id>/play
# 期望：url 指向 *.r2.cloudflarestorage.com，带 X-Amz-Signature；expiresAt 约为 1 小时后
```

浏览器里（这几项必须亲手点）：

- 随机播 3 条，到点自动暂停，拖动进度条不卡死。
- 刷新 `/s/xxxxxxxx` 能正常打开（不是 404）。
- 无痕窗口打开站点**首页**应直接看到搜索页，**无需**先输入口令。

### 6.3 分享

```bash
curl -X POST $BASE/api/shares -H 'content-type: application/json' \
  -d '{"lineIds":[<id1>,<id2>],"note":"测试"}'
# 期望：201，返回 {id, url}，url 以 PUBLIC_BASE_URL 开头

# 读取分享：匿名可读
curl -i $BASE/api/shares/<id>
curl -i $BASE/api/shares/<id>/lines/<id1>/play
# 期望：都是 200
```

再用无痕窗口打开返回的 `url`，确认能看能播。

### 6.4 R2 桶确认为私有

```bash
curl -i https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com/tbbt-media/tbbt/S01E01.mp4
# 期望：403（没有签名就拿不到对象）
```

同时在 R2 控制台确认：`tbbt-media` 的 Public access 是关闭状态，`r2.dev` 子域是 Disabled。

### 6.5 不被搜索引擎收录

```bash
curl -s $BASE/robots.txt                      # 期望：Disallow: /
curl -sI $BASE/ | grep -i x-robots-tag        # 期望：noindex, nofollow
```

### 6.6 用量提醒

在 Cloudflare 和 Neon 控制台各确认一次已设置提醒（第 1、2 步）。

## 7. 常见问题

| 现象 | 原因与处理 |
|---|---|
| 启动失败：`生产环境不能使用 STORAGE_DRIVER=local` | Render 里 `STORAGE_DRIVER` 没填或填成了 `local`，改为 `r2` |
| 启动失败：仍要求 `SITE_PASSCODE` / `COOKIE_SECRET` | 代码已按手册 §4.2 取消站点口令；若仍报错，说明部署分支未合入最新 `config`/镜像，或对照片段 |
| 启动失败：`STORAGE_DRIVER=r2 时必须设置 R2_…` | 缺哪个变量日志里会写出变量名 |
| 搜得到台词，但点播放提示「该集暂无视频」 | 库里登记了视频但 R2 里没有对象：重跑 `npm run pipeline -- upload`；或 R2 凭据/桶名有误（也可能是 `ingest` 时 `work/mp4` 还没有该集，需要重新 `ingest`） |
| 播放接口返回 500 | 多半是 R2 凭据错误或令牌权限不足；看 Render 日志，`AccessDenied` 就是令牌没给这个桶的读写权限 |
| 视频一直转圈 | 先用 6.2 的 `play` 接口拿到链接，在浏览器地址栏直接打开，能下载说明 R2 没问题，再排查网络（大陆访问海外较慢，见手册 §8.1） |
| 分享链接指向 localhost 或错误域名 | `PUBLIC_BASE_URL` 没改成真实域名，改完重新部署 |
| 首次打开要等几十秒 | Render 免费实例休眠，见第 4 步第 6 点（UptimeRobot） |
| 构建失败：`npm ci` 报 lock 文件不同步 | 本机执行 `npm install` 更新 `package-lock.json` 并提交 |

## 8. 日常运维

- **一旦要收口访问**：需在代码里重新引入认证（见手册 §4.2 说明）；当前部署不包含站点口令。
- **补充语料**：本机依次运行 `transcode`、`ingest --clean`、`upload`、`qa`，不需要重新部署服务。
- **回滚服务**：Render → Events / Deploys → 选择历史版本 Rollback。数据库迁移只前进，改表结构时用「先加列、后迁移、再删列」。
- **备份**：数据库可由 `raw/` 重建，每月 `pg_dump` 一次存到本机即可；视频在 `raw/`（源）和 R2（副本）各有一份。
