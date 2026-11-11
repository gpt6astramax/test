# 景深翻页（depth-music）

音乐库 App 的 UI 原型，一份 React Native 代码：网页用 react-native-web，iOS / Android 用 Expo。设计和所有参数见上一层的 [DESIGN.md](../DESIGN.md)。

## 用 Expo Go 打开

```bash
npm install
```

```bash
npx expo start
```

扫终端里的二维码（iPhone 用相机，安卓用 Expo Go）。手机和电脑不在同一个网络时用 `npx expo start --tunnel`。

## 网页版

```bash
npm run dev
```

```bash
npm run build
```

构建结果写到 `../public/`，仓库部署的就是它。

## 文件怎么分

- `index.js`、`app.json`：Expo 入口和配置。
- `src/index.html`、`src/main.jsx`、`vite.config.mjs`：网页入口和构建。
- `src/screens/`、`src/ui/parts.jsx`：页面和内容组件，两端共用。
- `X.web.jsx` / `X.jsx`：同一个组件的网页版和 iOS / Android 版。
