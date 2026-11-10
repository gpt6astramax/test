# f7-music

用 Framework7 React 从零搭的音乐库 demo，起点是官方生成器（create-framework7）的 tabs 模板。页面外壳（根布局、状态栏、安全区、导航栏、底部页签栏、左缘右滑返回）全部是 Framework7 自带的，没有手写。

注意：Framework7 没有 React Native 版本。它的 React 版是 Framework7 React，跑在浏览器和主屏幕 App（PWA）里。

## 目录

| 路径 | 内容 |
| --- | --- |
| `app/` | 源码：Vite + React + Framework7 React |
| `public/` | 构建结果，仓库部署的就是这个文件夹 |

`app/package.json` 不在子项目根目录，所以部署时不会装依赖、不会重新构建；改了源码要在本地构建后把 `public/` 一起提交。

## 构建

```bash
cd f7-music/app
```

```bash
npm install
```

```bash
npm run build
```

## 里面有什么

- 四个页签（发现、搜索、曲库、我的），每个页签是一个独立的 View，有自己的页面栈。
- 曲目页、音乐人页、合集页，用 Framework7 的路由推入，左缘右滑返回。
- “我的”里有深色模式开关（Framework7 的 `setDarkMode`），以及一块屏幕信息：版本时间、是否主屏幕模式、`html` 的类名、安全区、`innerHeight`、`100vh`。顶部或底部显示不对时，截这一块就能看出原因。
- 曲目、音乐人和数据都是虚构的；没有音频，“播放”只是一个状态。
