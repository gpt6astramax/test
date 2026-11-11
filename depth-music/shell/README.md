# 景深翻页 · Expo 外壳

一个最小的 Expo 应用：全屏 WebView，打开 https://test.gpt6astramax.workers.dev/depth-music/ 。

- WebView 铺满整个屏幕，状态栏透明。页面自己按 `env(safe-area-inset-*)` 避让状态栏和 Home 指示条，和主屏幕 App 一样。
- WebView 自己的滚动、回弹、缩放、前进后退手势都关掉了，手势全由页面负责。
- User-Agent 末尾带 `DepthMusicShell`，页面据此知道自己在 App 里（不加 Safari 专用的顶部纯色条）。
- Expo SDK 58，可以直接用 Expo Go 打开。

在电脑上运行（手机和电脑连同一个网络，手机装 Expo Go）：

```bash
cd depth-music/shell
npm install
npx expo start
```

终端里出现二维码，iPhone 用相机扫，安卓用 Expo Go 扫。不在同一个网络时用 `npx expo start --tunnel`。
