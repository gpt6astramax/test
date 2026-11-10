// 根 Worker：只做一件事 —— 按 URL 第一段把请求分发给对应的子项目。
//   /map/...  ->  map/ 文件夹
// 子项目清单由 build.mjs 扫描生成，这里不需要手动登记。
import { workers, projects } from "./.build/routes.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const name = url.pathname.split("/")[1];

    if (!name) return home();

    const project = projects.find((p) => p.name === name);
    if (!project) return new Response(`没有名为 "${name}" 的子项目\n`, { status: 404 });

    // 1. 静态文件优先
    const canBeStatic = request.method === "GET" || request.method === "HEAD";
    if (project.static && canBeStatic) {
      const res = await env.ASSETS.fetch(request);
      if (res.status !== 404 || !project.worker) return res;
    }

    // 2. 交给子项目自己的 worker.js
    const handler = workers[name];
    if (!handler?.fetch) return new Response("Not Found\n", { status: 404 });
    try {
      return await handler.fetch(request, env, ctx);
    } catch (err) {
      // 一个子项目出错不影响其他子项目
      console.error(`[${name}]`, err);
      return new Response(`子项目 "${name}" 抛出异常：\n\n${err?.stack ?? err}\n`, { status: 500 });
    }
  },
};

function home() {
  const items = projects
    .map((p) => `<li><a href="/${p.name}/">/${p.name}</a></li>`)
    .join("\n");
  const html = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>test</title>
<style>body{font:16px/1.7 system-ui,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem}</style>
<h1>test</h1>
<p>测试专用 Worker。每个子文件夹是一个独立子项目：</p>
<ul>
${items || "<li>（还没有子项目）</li>"}
</ul>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
