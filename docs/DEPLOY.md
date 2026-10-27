# 网页版：构建、验证、发布（2026-10-20）

- 源码仓库：https://github.com/Bacchus-wen/qingshixiang （私有，`main`）。2026-10-20 用户要求后第一次推送。
- 网站由用户自己发布。免费账号的私有仓库开不了 GitHub Pages（GitHub 回 422："Your current plan does not support GitHub Pages for this repository"）。

## Vercel(2026-10-27)

- **怎么部署:** 用户把仓库接到了 Vercel,团队 theodore-album、项目 alley。每次推送 `main`,Vercel 就从仓库构建一次(`vite build`,即 `npm run build`),部署状态会回写到 GitHub 的提交上。
- **查状态:** `gh api repos/Bacchus-wen/qingshixiang/commits/<sha>/status`。
- **访问:** 部署地址有 Vercel 登录保护,外人打不开,我们也看不到实际页面。
- **要求一:提交必须署用户的 GitHub 账号。**
  - 提交要署 `Bacchus-wen <74724186+Bacchus-wen@users.noreply.github.com>`。
  - 10-22、10-23、10-26 三次推送,提交署的是本机默认的 "Theodore",Vercel 认不出是谁的账号,部署被拦下("Deployment was blocked" / "GitHub couldn't verify an account for the commit")。
  - 10-27 经用户同意,改写了全部 369 个提交的署名并强推。旧历史备份在 `~/Backups/新游戏-before-author-rewrite-2026-10-27.git`。
  - 现在仓库本地配置里已设好这个身份。
- **要求二:网页版用到的模型文件必须在仓库里。**
  - Vercel 只能拿到仓库里的文件。
  - 以前分级模型的 `L*.glb` 全部不进仓库。那时 Vercel 的构建显示"成功",但页面一打开就停在"核心系统初始化失败:eye",27 个模型文件 404。
  - 现在 L1–L3 进仓库(81 个文件,294 MB),最细的 L0(约 1 GB)仍留在本地。正式构建从不加载 L0。
  - 验证方法:从仓库重新克隆一份,构建后用新玩家脚本完整玩一遍,0 个缺失文件、0 个报错,五家店都找到,一直到字卡。
  - 构建产物约 428 MB:除了 L1–L3,`assets/` 里所有已进仓库的文件都会被复制进去。
- **流量:** 完整看一遍要下载约 260–390 MB(见下文),免费方案的每月流量用得很快。

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

## 中英文(2026-10-22)

- 同一个网站两种语言:`?lang=en` 英文,`?lang=zh` 中文;不带参数时跟浏览器语言走(中文浏览器看中文,其余看英文)。标题页左上角有切换链接。
- 只翻译对观众说的话:标题、操作提示、片尾字、重看、出错提示、模型检视模式的名称和说明。街上的招牌、告示和"拆"是场景的一部分,不翻。代码在 `src/ui/i18n.js`。
- 构建同时生成 `credits.html`(中文)和 `credits-en.html`(英文),两页互相链接。
- 最近一次构建:`/tmp/qsx-site-5`(268.5 MB,147 个文件,`--base /qingshixiang/`,含 Codex 两轮评审后的英文定稿),按下面的方法用英文和中文各跑完整个故事:各 327 个请求,0 失败,0 报错,没有请求 L0。

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
