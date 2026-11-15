# netfree

[Netfree](https://github.com/gpt6astramax/Netfree)（用 Tandem 框架做的流媒体演示）的构建产物，用来在线预览。

- 这里没有源码，源码在 Netfree 仓库。
- `public/` 是 Netfree `npm run build` 的 `dist/`，只把 `index.html` 改名为 `app.html`：页面在 `/netfree/app`。
- `worker.js` 把 `/netfree/` 302 到 `/netfree/app`，不增加历史记录。
- 这个 Worker 不支持 Durable Object，所以 Netfree 的 Agent 不在这里，AI 小球没有模型。片库、搜索、海报都在浏览器本地，不受影响。控制台里连 `/netfree/ws` 失败的报错就是因为这个，属于正常。

更新：在 Netfree 里 `npm run build`，把 `dist/` 换到这里的 `public/`，再把 `index.html` 改名为 `app.html`，然后推送。
