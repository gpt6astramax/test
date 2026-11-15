# player

[gpt6astramax/player](https://github.com/gpt6astramax/player) 的测试页：选本地视频（H.265 / AV1）播放，显示视频参数和实时帧率。

`dist/` 是从 player 仓库 `claude/h265-av1-player` 分支拷过来的构建产物。`sw.js` 给页面补上 WASM 多线程需要的 COOP/COEP 头（静态托管发不了响应头），所以第一次打开会自动刷新一次。
