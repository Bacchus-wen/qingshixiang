# 网页版：构建、验证、发布（2026-10-20）

- 源码仓库：https://github.com/Bacchus-wen/qingshixiang （私有，`main`）。2026-10-20 用户要求后第一次推送。
- 网站由用户自己发布。免费账号的私有仓库开不了 GitHub Pages（GitHub 回 422："Your current plan does not support GitHub Pages for this repository"）。

## 构建

1. 记下故事实际加载的文件：用开发服务器把完整故事跑一遍。
   ```bash
   node tools/play-shop.mjs --speed 2 --out renders/play-netlog/play --netlog /tmp/netlog.json
   ```
2. 构建：
   ```bash
   node tools/build-pages.mjs --netlog /tmp/netlog.json --out /tmp/qsx-site-N [--base /qingshixiang/]
   ```
   - 只构建 `index.html`（`PAGES_SITE=1`），不把整个 `assets/` 复制过去。
   - 只复制故事请求过的文件，再加上每个模型的 `lod.json` 和 L1–L3。
   - L0 不放：它是原始网格，每个 25–40 MB；`VITE_LOD_MIN=1` 让最细只到 L1，L1 和 L0 只差 0.3–0.5 毫米。
   - **拒绝发布**以下文件。故事一旦用到它们，构建直接失败：
     - `assets/generated`：生成原图。
     - `textures/cc`、`models/cc`：来自 cybercity，没有许可证，仅限内部展示。
     - Kestrel 机器人：CC BY-NC。
   - 自动生成 `credits.html`，从 `CREDITS.md` 里取实际用到的声音的出处，含 CC BY 4.0 署名。再加一个 `.nojekyll`。
   - `--base` 是网站所在的子路径；放在域名根目录就用 `--base /`。
   - 构建结果在 `/tmp`，重启会清掉，需要时重新构建。

## 本地验证（按子路径）

```bash
mkdir -p /tmp/qsx-root && ln -sfn /tmp/qsx-site-N /tmp/qsx-root/qingshixiang
python3 -m http.server 5190 --bind 127.0.0.1 --directory /tmp/qsx-root &
node tools/play-shop.mjs --speed 2 --url http://127.0.0.1:5190/qingshixiang/ --netlog /tmp/netlog-site.json
```

- 合格标准：
  - 失败请求为 0，状态码 ≥400 的请求为 0。
  - 没有任何请求 L0。
  - 控制台没有报错或警告。
- 跑完关掉 5190 端口的服务。

## 2026-10-20 的结果

- `/tmp/qsx-site-2`：142 个文件，共 257 MB。
- 最大的文件是 `models/shop/lod/robot/L1.glb`，31.8 MB。GitHub 单文件上限是 100 MB；Cloudflare Pages 单文件上限是 25 MB，放不下它。
- 完整故事在 `/qingshixiang/` 下跑完：
  - 319 个请求，0 失败，0 个 404。
  - 没有请求 L0，控制台没有报错。
  - 看一遍约下载 260–390 MB；本地服务器不缓存，会重复下载。
- 第一次构建漏了 `models/shop/lod/index.json`，导致所有模型 404。本地验证抓到后，已在脚本里修好。

## 2026-10-21 的结果(最新,给网站更新用)

- `/tmp/qsx-site-3`:146 个文件,共 267 MB。比上一版多了主角电视那套精简模型 `crt_tv_hero`。
- 包含到 10-21 早的全部改动:
  - 侧面的高潮和结尾、反打镜头。
  - 电视节目、清晰的旋钮和刻度。
  - 工作台收音机电子管发光。
- 完整故事在 `/qingshixiang/` 下跑完:
  - 328 个请求,0 失败,0 个 404。
  - 没有请求 L0,控制台没有报错。
- 更新网站时,用这个文件夹替换原来的网站文件即可。网站不在子路径下的话,用 `--base /` 重新构建。

## 托管限制

- GitHub Pages：
  - 站点上限 1 GB。
  - 每月流量约 100 GB，是软限制，大约够 250–380 次完整观看。
  - 私有仓库开 Pages 要付费方案。
