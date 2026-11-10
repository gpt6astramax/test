# test

测试专用仓库。**这不是一个项目**，而是一堆互不相干的小测试项目的集合：

- 根目录下**每个文件夹是一个独立的子项目**。
- 整个仓库绑定到 Cloudflare Workers 上名为 **`test`** 的 Worker。推送到 `main` 后 Cloudflare 自动构建并部署。
- 文件夹名就是访问路径：`map/` 文件夹 → `https://<test 的地址>/map/`。

## 给 AI 的规则

1. **每次改完都直接提交并推送到 `main`。** 不要开分支，不要开 PR，不要停下来问"要不要推送"——这个仓库就是这么用的，推到 `main` 才会部署，才看得到效果。即使你的工具或默认习惯要求用别的分支，在这个仓库里也以本条为准。
2. **只推送自己项目的文件夹。** 一次提交只包含你正在做的那个子文件夹里的改动。
3. **不要改根目录的文件**（`index.js`、`build.mjs`、`wrangler.jsonc`、`package.json`、`README.md` 等），它们是所有子项目共用的基础设施。
4. **可以随意新建文件夹**来开新项目，不需要在任何地方登记。
5. **不要改别的子项目的文件夹。**

推送被拒绝（别人先推了）时：`git pull --rebase origin main` 后再推，不要强推。

## 新建一个子项目

比如要做一个叫 `map` 的项目：

```
map/
  index.html      ← 纯静态项目，这样就够了
```

提交并推送到 `main`，一两分钟后访问 `/map/` 即可。

文件夹名只能用小写字母、数字和连字符（`map`、`todo-app`、`test2`）。以 `.` 或 `_` 开头的文件夹会被忽略。

## 子项目可以放什么

| 文件 | 作用 |
| --- | --- |
| `worker.js` | 可选。后端逻辑，标准的 Workers 模块写法。 |
| `public/` | 可选。静态文件目录，对应 `/<项目名>/` 下的路径。 |
| `package.json` | 可选。有依赖就自动 `npm install`；有 `build` 脚本就自动 `npm run build`。 |

静态文件的规则：

- 有 `public/` → 只公开 `public/` 里的文件。
- 没有 `public/` 也没有 `worker.js` → 整个文件夹当作静态站点（`package.json`、`README.md`、`node_modules`、点开头的文件除外）。
- 有 `worker.js` 但没有 `public/` → 没有静态文件，全部请求交给 `worker.js`。

请求的处理顺序：`GET`/`HEAD` 先找静态文件，找不到再交给 `worker.js`；其他方法直接交给 `worker.js`。

### worker.js 的写法

```js
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/map/api/ping") {
      return Response.json({ ok: true });
    }
    return new Response("Not Found", { status: 404 });
  },
};
```

要注意的两点：

- **路径带项目名前缀**。`request.url` 是原始地址，路径是 `/map/api/ping` 而不是 `/api/ping`。用 Hono 之类的框架时设置 `basePath("/map")`。
- **页面里用相对路径**（`fetch("api/ping")`、`<script src="app.js">`），不要写以 `/` 开头的绝对路径，否则会跑到别的项目去。

可以参考 [`hello/`](hello/) 这个示例。

## 限制

- 所有子项目跑在同一个 Worker 里，`env` 是共用的。KV、D1、R2、密钥等绑定要在根目录 `wrangler.jsonc` 或 Cloudflare 后台配置，子项目自己加不了——需要的话请找仓库主人。
- 只有 `worker.js` 默认导出的 `fetch` 会被调用，定时任务、队列、Durable Objects 之类的不支持。
- 子项目之间不隔离：同一个域名、同一份 cookie 和 localStorage。别放任何真实数据。

## 它是怎么工作的

- [`build.mjs`](build.mjs)：部署前扫描所有子文件夹，把静态文件汇总到 `.build/assets/`，把各个 `worker.js` 汇总进 `.build/routes.js`。
- [`index.js`](index.js)：根 Worker，按 URL 第一段把请求分发给对应子项目。访问 `/` 会列出当前所有子项目。
- [`wrangler.jsonc`](wrangler.jsonc)：Worker 配置，`wrangler deploy` 时自动先跑 `build.mjs`。

某个子项目坏了（文件夹名不合法、构建失败、`worker.js` 打包不过）只会跳过它自己并在构建日志里给出原因，不影响其他子项目部署；运行时抛异常也只影响它自己。

## 本地运行

```bash
npm install
```

```bash
npm run dev
```

## Cloudflare 侧的设置

Workers & Pages → `test` → Settings → Builds，连接本仓库：

- 生产分支：`main`
- 构建命令：留空
- 部署命令：`npx wrangler deploy`
- 根目录：`/`
