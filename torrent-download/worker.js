const route = '/torrent-download';
const pttime = 'https://www.pttime.org';
const downloadPath = '/download.php';
const formLimit = 4096;
const torrentLimit = 8 * 1024 * 1024;

const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

export default {
  async fetch(request) {
    const { origin, pathname } = new URL(request.url);

    if (pathname === route || pathname === route + '/') {
      if (request.method === 'GET') return downloadPage();
      return message('请使用 GET。', 405, { Allow: 'GET' });
    }

    if (pathname !== route + '/download') return message('找不到该地址。', 404);
    if (request.method !== 'POST') return message('请使用 POST。', 405, { Allow: 'POST' });
    const requestOrigin = request.headers.get('Origin');
    const sameOriginNavigation = requestOrigin === 'null' && request.headers.get('Sec-Fetch-Site') === 'same-origin';
    if (requestOrigin && requestOrigin !== origin && !sameOriginNavigation) {
      return message('请从下载页提交。', 403);
    }
    if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/x-www-form-urlencoded') {
      return message('请提交 PTTime 下载链接。', 415);
    }

    const form = await readLimited(request.body, formLimit).catch(() => null);
    if (!form) return message('下载链接过长或无法读取。', 400);
    const source = new URLSearchParams(new TextDecoder().decode(form)).get('url');
    const upstream = pttimeDownloadUrl(source);
    if (!upstream) return message('请输入带 id、uid 和 passkey 的 PTTime 下载链接。', 400);

    try {
      const response = await fetch(upstream, {
        cache: 'no-store',
        redirect: 'manual',
        signal: AbortSignal.timeout(15000),
        headers: {
          Accept: 'application/x-bittorrent, application/octet-stream, */*',
          'User-Agent': 'Mozilla/5.0',
        },
      });

      if (response.status !== 200) {
        await response.body?.cancel();
        return message('PTTime 返回 HTTP ' + response.status + '，本次下载失败。', 502);
      }

      const torrent = await readLimited(response.body, torrentLimit);
      if (!torrent || torrent[0] !== 100 || torrent.at(-1) !== 101 ||
          !new TextDecoder().decode(torrent).includes('4:infod')) {
        return message('PTTime 的响应未通过种子文件检查。', 502);
      }

      const id = upstream.searchParams.get('id');
      return new Response(torrent, {
        headers: {
          ...privateHeaders,
          'Content-Type': 'application/x-bittorrent',
          'Content-Disposition': 'attachment; filename="pttime-' + id + '.torrent"',
        },
      });
    } catch (error) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        return message('请求 PTTime 超时。', 504);
      }
      return message('读取 PTTime 种子文件失败。', 502);
    }
  },
};

function pttimeDownloadUrl(source) {
  const supplied = URL.canParse(source) ? new URL(source) : null;
  if (!supplied || supplied.origin !== pttime || supplied.pathname !== downloadPath ||
      supplied.username || supplied.password) return null;

  const id = supplied.searchParams.get('id');
  const uid = supplied.searchParams.get('uid');
  const passkey = supplied.searchParams.get('passkey');

  if (!/^\d{1,20}$/.test(id) || !/^\d{1,20}$/.test(uid) || !/^[a-f0-9]{32}$/i.test(passkey)) {
    return null;
  }

  const url = new URL(downloadPath, pttime);
  url.search = new URLSearchParams({ id, passkey, uid });
  return url;
}

async function readLimited(body, limit) {
  if (!body) return null;

  const reader = body.getReader();
  const chunks = [];
  let length = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function message(text, status, headers) {
  return new Response(text, {
    status,
    headers: { ...privateHeaders, 'Content-Type': 'text/plain; charset=utf-8', ...headers },
  });
}

function downloadPage() {
  const nonce = crypto.randomUUID();
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PTTime 种子下载</title>
<style>
  :root { color-scheme: light dark; font: 16px/1.5 system-ui, sans-serif; }
  main { max-width: 32rem; margin: 12vh auto 0; padding: 0 1rem; }
  label { display: block; }
  input, button { box-sizing: border-box; padding: .7rem; margin-top: .5rem; font: inherit; }
  input { display: block; width: 100%; }
</style>
</head>
<body>
<main>
  <h1>PTTime 种子下载</h1>
  <form action="/torrent-download/download" method="post" autocomplete="off">
    <label for="url">PTTime 下载链接</label>
    <input id="url" name="url" type="url" required maxlength="2048" spellcheck="false">
    <button type="submit">下载 .torrent</button>
  </form>
</main>
<script nonce="NONCE">
  const url = new URLSearchParams(location.hash.slice(1)).get('url');
  if (url) {
    history.replaceState(null, '', location.pathname);
    const field = document.getElementById('url');
    field.value = url;
    field.form.requestSubmit();
  }
</script>
</body>
</html>`;
  return new Response(html.replace('NONCE', nonce), {
    headers: {
      ...privateHeaders,
      'Content-Type': 'text/html; charset=utf-8',
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; " +
        "form-action 'self'; style-src 'unsafe-inline'; script-src 'nonce-" + nonce + "'",
    },
  });
}
