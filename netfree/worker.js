// Netfree's built page is in public/ (app.html: the page). This file only does what static files cannot:
//   /netfree, /netfree/      → /netfree/app (a redirect: the browser adds no history entry for it)
//   /netfree/index.html      the page (the service worker keeps it under this name)
// Everything else that is not a file is not here: Netfree's Agent (a Durable Object) does not run in this Worker,
// so the page goes on without it (the AI ball has no model).
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/netfree' || url.pathname === '/netfree/') {
      return Response.redirect(new URL('/netfree/app' + url.search, url), 302);
    }
    if (url.pathname === '/netfree/index.html') {
      return env.ASSETS.fetch(new Request(new URL('/netfree/app', url), request));
    }
    return new Response('Not Found\n', { status: 404 });
  },
};
