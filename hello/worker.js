// 示例子项目：静态页面在 public/，其余请求由这里处理。
// 注意 request 的路径是完整路径，带 /hello 前缀。
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/hello/api/time") {
      return Response.json({ now: new Date().toISOString() });
    }
    return new Response("Not Found\n", { status: 404 });
  },
};
