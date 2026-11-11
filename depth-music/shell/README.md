# 景深翻页 · Expo 外壳

一个最小的 Expo 应用：全屏 WebView 显示景深翻页的网页。网页存在手机上，打开就显示、离线也能用；网页更新时，App 在后台自己下载变了的文件。

## 显示

- WebView 铺满整个屏幕，状态栏透明。页面自己按 `env(safe-area-inset-*)` 避让状态栏和 Home 指示条，和主屏幕 App 一样。
- WebView 自己的滚动、回弹、缩放、前进后退手势都关掉了，手势全由页面负责。
- User-Agent 末尾带 `DepthMusicShell`，页面据此知道自己在 App 里（不加 Safari 专用的顶部纯色条）。
- 页面按网站地址 `https://test.gpt6astramax.workers.dev/depth-music/` 载入，所以设置（localStorage）和在网站上是同一个来源。

## 热更新

网页照常写、照常推送部署，什么都不用多做。

1. 网页构建（`depth-music/app` 的 `npm run build`）时，会顺带生成 `app-manifest.json`：页面要用的每个文件和它的 SHA-256。库（React 等）单独一个文件，平时只改页面代码时，只有约 80 KB（压缩后约 29 KB）的页面文件变。
2. App 每次启动，先用手机上已有的版本立刻显示；同时在后台看一眼 `app-manifest.json`，只下载手机上没有的文件，逐个校验哈希，校验不过就整版不要。回到前台时也会看（最多 5 分钟一次）。
3. 下载完按这一版的更新级别处理。级别写在 `depth-music/app/release.json`：

   ```json
   { "medium": 0, "urgent": 0, "note": "" }
   ```

   | 想要的效果 | 怎么写 |
   | --- | --- |
   | 轻量更新：静默，下次打开 App 时生效 | 什么都不改（默认） |
   | 中等更新：下载完弹提示，用户选「更新」或「下次打开 App 时生效」 | `medium` 加 1；`note` 写给用户看的一句话（可不写） |
   | 紧急更新：下载完立即刷新 | `urgent` 加 1 |

   数字只增不减。App 拿新版的数字和自己正在显示的那版比，所以中间跳过了几版也不会漏掉一次升级要求。

中等更新的提示由页面自己画（顶部的玻璃卡片，`app/src/ui/UpdateNotice.web.jsx`），跟着深浅色走；如果正在显示的旧页面还不认识这个提示，App 就用系统对话框问。

## 安装包里自带的那份网页

`snapshot.js` 是打包进 App 的一份网页，新装的用户第一次打开就用它，不用联网。它只在发布新安装包前更新一下，让新用户起点近一点（不更新也行，第一次联网时会补下载差异）：

```bash
cd depth-music/app && npm run build && cd ../shell && npm run snapshot
```

## 在电脑上运行

手机和电脑连同一个网络，手机装 Expo Go：

```bash
cd depth-music/shell
npm install
npx expo start
```

终端里出现二维码，iPhone 用相机扫，安卓用 Expo Go 扫。
