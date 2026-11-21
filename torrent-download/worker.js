import { connect } from 'cloudflare:sockets';
import { clientIdentity, httpUrl, loadTorrent, readBytes, readTorrent, torrentLimit } from './torrent.js';
import { TorrentTransfer } from './peer.js';

const route = '/torrent-download';
const pttime = 'https://www.pttime.org';
const downloadPath = '/download.php';
const cookieName = 'pttime_source';
const torrentTtl = 21600;

const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

export default {
  async fetch(request, env, ctx) {
    const { origin, pathname } = new URL(request.url);
    if (pathname === route || pathname === route + '/') {
      if (request.method === 'GET') return downloadPage();
      return message('请使用 GET。', 405, { Allow: 'GET' });
    }
    if (pathname === route + '/download') return openDownload(request, origin);

    const legacy = /^\/torrent-download\/file\/(\d{1,20})(?:(\/ready)|\/file\/(\d{1,7}))?$/.exec(pathname);
    const job = /^\/torrent-download\/job\/([0-9a-f]{32})\/(ready|file\/(\d{1,7}))$/.exec(pathname);
    if (!legacy && !job) return message('找不到该地址。', 404);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return message('请使用 GET 或 HEAD。', 405, { Allow: 'GET, HEAD' });
    }
    const base = legacy ? route + '/file/' + legacy[1] : route + '/job/' + job[1];
    const ready = legacy ? Boolean(legacy[2]) : job[2] === 'ready';
    const index = legacy ? Number(legacy[3] ?? 0) : Number(job[3]);
    return serveDownload(request, ctx, origin, base, ready, index, legacy?.[1], job?.[1], env?.UDP_DISCOVERY);
  },
};

async function openDownload(request, origin) {
  if (request.method !== 'POST') return message('请使用 POST。', 405, { Allow: 'POST' });
  const requestOrigin = request.headers.get('Origin');
  const sameOriginNavigation = requestOrigin === 'null' && request.headers.get('Sec-Fetch-Site') === 'same-origin';
  if (requestOrigin && requestOrigin !== origin && !sameOriginNavigation) {
    return message('请从下载页提交。', 403);
  }
  try {
    const contentType = request.headers.get('Content-Type') ?? '';
    let form;
    if (contentType.startsWith('multipart/form-data;')) {
      const body = await readBytes(request.body, torrentLimit + 8192);
      form = await new Response(body, { headers: { 'Content-Type': contentType } }).formData();
    } else if (contentType.split(';')[0] === 'application/x-www-form-urlencoded') {
      form = new URLSearchParams(new TextDecoder().decode(await readBytes(request.body, 8192)));
    } else {
      return fileError(request, '请粘贴种子链接或上传 .torrent 文件。', 415, route + '/');
    }

    const input = form.get('url');
    const upload = form.get('torrent');
    const source = typeof input === 'string' ? httpUrl(input.trim()) : null;
    const hasUpload = upload && typeof upload.stream === 'function' && upload.size > 0;
    if (hasUpload && source) throw new Error('请选择一个种子链接或文件。');
    if (!hasUpload && !source) throw new Error('请粘贴公开 HTTP(S) 种子链接或上传 .torrent 文件。');

    const credentials = source && parseSource(source.href);
    if (credentials) {
      const { id, uid, passkey } = credentials;
      const base = route + '/file/' + id;
      return redirectToReady(base, cookieName + '=' + id + '.' + uid + '.' + passkey, 86400);
    }

    const raw = hasUpload
      ? await readBytes(upload.stream(), torrentLimit)
      : await readTorrent(source);
    const meta = await loadTorrent(raw);
    const token = crypto.randomUUID().replaceAll('-', '');
    const base = route + '/job/' + token;
    try {
      await saveTorrent(origin, token, raw);
    } catch {
      if (!source) throw new Error('种子暂存失败，请重试上传。');
    }
    const cookie = source
      ? 'bt_url=' + hexInfoHash(meta) + '.' +
        btoa(source.href).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
      : null;
    return redirectToReady(base, cookie);
  } catch (error) {
    return fileError(request, safeError(error, '读取种子失败。'), 400, route + '/');
  }
}

function redirectToReady(base, cookie, age = torrentTtl) {
  const headers = { ...privateHeaders, Location: base + '/ready' };
  if (cookie) {
    headers['Set-Cookie'] = cookie + '; Path=' + base + '; Max-Age=' + age +
      '; HttpOnly; Secure; SameSite=Lax';
  }
  return new Response(null, { status: 303, headers });
}

function torrentKey(origin, token) {
  return new Request(origin + route + '/.torrent/' + token);
}

function saveTorrent(origin, token, raw) {
  return caches.default.put(torrentKey(origin, token), new Response(raw, {
    headers: { 'Cache-Control': 'max-age=' + torrentTtl },
  }));
}

async function jobTorrent(request, origin, token) {
  const cached = await caches.default.match(torrentKey(origin, token)).catch(() => undefined);
  if (cached) return readBytes(cached.body, torrentLimit);
  const cookie = request.headers.get('Cookie')?.match(
    /(?:^|;\s*)bt_url=([a-f0-9]{40})\.([a-z0-9_-]{1,3000})(?:;|$)/i,
  );
  const source = cookie && httpUrl(atob(cookie[2].replaceAll('-', '+').replaceAll('_', '/')));
  if (!source) return null;
  const raw = await readTorrent(source);
  if (hexInfoHash(await loadTorrent(raw)) !== cookie[1]) throw new Error('种子链接的内容已变化，请重新添加。');
  await saveTorrent(origin, token, raw).catch(() => {});
  return raw;
}

function hexInfoHash(meta) {
  return Array.from(meta.infoHash, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function serveDownload(request, ctx, origin, base, ready, index, id, token, udpNamespace) {
  let transfer;
  try {
    let raw;
    if (id) {
      const stored = request.headers.get('Cookie')?.match(
        /(?:^|;\s*)pttime_source=(\d{1,20})\.(\d{1,20})\.([a-f0-9]{32})(?=;|$)/i,
      );
      if (!stored || stored[1] !== id) {
        return fileError(request, '请先从下载页打开这个种子。', 401, route + '/');
      }
      const source = new URL(downloadPath, pttime);
      source.search = new URLSearchParams({ id, passkey: stored[3], uid: stored[2] });
      raw = await readTorrent(source);
    } else {
      raw = await jobTorrent(request, origin, token);
      if (!raw) return fileError(request, '种子暂存已过期，请重新粘贴链接或上传文件。', 404, route + '/');
    }

    const meta = await loadTorrent(raw);
    if (ready) return readyPage(meta, base, Boolean(id));
    const file = meta.files[index];
    if (!file) return fileError(request, '种子里没有这个文件。', 404, base + '/ready');
    const range = byteRange(request.headers.get('Range'), file.size);
    if (!range) {
      return message('请求的区间超出文件范围。', 416, { 'Content-Range': 'bytes */' + file.size });
    }

    const size = range.end - range.start + 1;
    const headers = {
      ...privateHeaders,
      'Accept-Ranges': 'bytes',
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': disposition(file.filename),
      'Content-Length': String(size),
    };
    const status = range.partial ? 206 : 200;
    if (range.partial) headers['Content-Range'] = 'bytes ' + range.start + '-' + range.end + '/' + file.size;
    if (request.method === 'HEAD') return new Response(null, { status, headers });
    if (size === 0) return new Response(new Uint8Array(), { status, headers });

    const client = await clientIdentity(meta, origin);
    const deadline = Date.now() + 55000;
    transfer = new TorrentTransfer(
      meta, connect, client, meta.pttime ? caches.default : undefined,
      udpNamespace?.getByName('bt-discovery'),
    );
    await transfer.start(deadline);
    let position = file.offset + range.start;
    const end = file.offset + range.end;
    const firstIndex = Math.floor(position / meta.pieceLength);
    const lastIndex = Math.floor(end / meta.pieceLength);
    const read = pieceWindow(transfer, firstIndex, lastIndex, deadline);
    let first = await read(firstIndex);

    const body = new ReadableStream({
      async pull(controller) {
        try {
          const pieceIndex = Math.floor(position / meta.pieceLength);
          const piece = first ?? await read(pieceIndex);
          first = null;
          const offset = position - pieceIndex * meta.pieceLength;
          const length = Math.min(piece.length - offset, end - position + 1);
          controller.enqueue(piece.subarray(offset, offset + length));
          position += length;
          if (position > end) {
            controller.close();
            ctx.waitUntil(transfer.finish(size === meta.size ? 'complete' : size === file.size ? 'file' : 'range'));
          }
        } catch (error) {
          controller.error(error);
          ctx.waitUntil(transfer.finish());
        }
      },
      cancel() {
        return transfer.finish();
      },
    }, { highWaterMark: 0 });

    const output = new FixedLengthStream(size);
    ctx.waitUntil(body.pipeTo(output.writable).catch(() => transfer.finish()));
    return new Response(output.readable, { status, headers });
  } catch (error) {
    if (transfer) ctx.waitUntil(transfer.finish());
    const reason = safeError(error, '无法从 BT 节点读取这个文件。');
    return fileError(request, reason, reason.includes('下载相同种子') ? 409 : 502,
      ready ? route + '/' : base + '/ready');
  }
}

function pieceWindow(transfer, first, last, deadline) {
  const pending = new Map();
  const limit = Math.max(1, Math.min(32, Math.floor(48 * 1024 * 1024 / transfer.meta.pieceLength)));
  let next = first;
  function fill() {
    while (pending.size < limit && next <= last) {
      const index = next++;
      const timeout = index === first ? deadline : Date.now() + 110000;
      pending.set(index, transfer.piece(index, timeout).then(
        data => ({ data }),
        error => ({ error }),
      ));
    }
  }
  fill();
  return async index => {
    const result = await pending.get(index);
    const data = result.error && index !== first
      ? await transfer.piece(index, Date.now() + 90000)
      : result.data;
    if (!data) throw result.error;
    pending.delete(index);
    fill();
    return data;
  };
}

function safeError(error, fallback) {
  return error?.message?.replace(/https?:\/\/\S+|[0-9a-f]{32,}/gi, '[已隐藏]') || fallback;
}

function byteRange(header, size) {
  if (header === null) return { start: 0, end: size - 1, partial: false };

  const match = /^bytes=(\d{0,16})-(\d{0,16})$/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;

  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    return { start: Math.max(0, size - suffix), end: size - 1, partial: true };
  }
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) return null;
  return { start, end: Math.min(end, size - 1), partial: true };
}

function disposition(filename) {
  const fallback = filename.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const utf8 = encodeURIComponent(filename).replace(/['()*]/g, char => '%' + char.charCodeAt(0).toString(16));
  return 'attachment; filename="' + fallback + '"; filename*=UTF-8\'\'' + utf8;
}

function parseSource(input) {
  const source = URL.canParse(input) ? new URL(input) : null;
  if (!source || source.origin !== pttime || source.pathname !== downloadPath ||
      source.username || source.password) return null;
  const id = source.searchParams.get('id');
  const uid = source.searchParams.get('uid');
  const passkey = source.searchParams.get('passkey');
  if (!/^\d{1,20}$/.test(id) || !/^\d{1,20}$/.test(uid) || !/^[a-f0-9]{32}$/i.test(passkey)) return null;
  return { id, uid, passkey };
}

function message(text, status, headers) {
  return new Response(text, {
    status,
    headers: { ...privateHeaders, 'Content-Type': 'text/plain; charset=utf-8', ...headers },
  });
}

function fileError(request, reason, status, back) {
  const navigation = request.headers.get('Sec-Fetch-Mode') === 'navigate' ||
    request.headers.get('Accept')?.includes('text/html');
  if (request.method === 'HEAD' || !navigation) return message(reason, status);

  const hint = status === 409
    ? '<p>先暂停同一种子的其他下载，在 PTTime 资源页点「小扫把」，再回来重试。</p>'
    : '';
  const html = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>下载未开始</title>' +
    '<style>:root{color-scheme:light dark;font:16px/1.5 system-ui,sans-serif}' +
    'main{max-width:36rem;margin:12vh auto;padding:0 1.25rem}</style></head>' +
    '<body><main><h1>下载未开始</h1><p>' + escapeText(reason) + '</p>' + hint +
    '<p><a href="' + back + '">返回下载页</a></p></main></body></html>';
  return new Response(html, {
    status,
    headers: {
      ...privateHeaders,
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; style-src 'unsafe-inline'",
    },
  });
}

function escapeText(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function readyPage(meta, base, legacy) {
  const nonce = crypto.randomUUID();
  const files = meta.files.map((file, index) => {
    const size = file.size >= 1e9 ? (file.size / 1e9).toFixed(2) + ' GB'
      : file.size >= 1e6 ? (file.size / 1e6).toFixed(2) + ' MB'
      : file.size >= 1e3 ? (file.size / 1e3).toFixed(2) + ' KB' : file.size + ' B';
    const target = legacy && index === 0 ? base : base + '/file/' + index;
    return '<li><p class="file">' + escapeText(file.path) + '</p><p>' + size +
      '</p><p><a href="' + target + '" data-download>下载文件</a></p></li>';
  }).join('\n');
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>下载原文件</title>
<style>
  :root { color-scheme: light dark; font: 16px/1.5 system-ui, sans-serif; }
  body { margin: 0; }
  main { max-width: 36rem; margin: 12vh auto 0; padding: 0 1.25rem; }
  h1 { font-size: 1.65rem; }
  .file { overflow-wrap: anywhere; }
  ul { padding: 0; list-style: none; }
  li + li { border-top: 1px solid #8886; padding-top: .5rem; }
  a { display: inline-block; background: #1059d2; color: white; text-decoration: none; padding: .8rem 1.2rem; border-radius: .65rem; }
  output { display: block; min-height: 1.5em; }
</style>
</head>
<body>
<main>
  <h1>下载原文件</h1>
  <p><output id="status" role="status"></output></p>
  <ul>FILE_LIST</ul>
</main>
<script nonce="NONCE">
  document.querySelector('ul').addEventListener('click', event => {
    if (event.target.closest('[data-download]')) {
      document.getElementById('status').textContent = '正在并行连接 BT 节点。首片校验通过后，浏览器会开始下载。';
    }
  });
</script>
</body>
</html>`;
  return new Response(html.replace(/FILE_LIST|NONCE/g, token => ({
    FILE_LIST: files, NONCE: nonce,
  })[token]), {
    headers: {
      ...privateHeaders,
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; " +
        "style-src 'unsafe-inline'; script-src 'nonce-" + nonce + "'",
    },
  });
}

function downloadPage() {
  const nonce = crypto.randomUUID();
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BT 文件下载</title>
<style>
  :root { color-scheme: light dark; font: 16px/1.5 system-ui, sans-serif; }
  main { max-width: 32rem; margin: 12vh auto 0; padding: 0 1rem; }
  label { display: block; margin-top: 1rem; }
  input, button { box-sizing: border-box; padding: .7rem; margin-top: .5rem; font: inherit; }
  input { display: block; width: 100%; }
</style>
</head>
<body>
<main>
  <h1>BT 文件下载</h1>
  <form action="/torrent-download/download" method="post" enctype="multipart/form-data" autocomplete="off">
    <label for="url">种子链接</label>
    <input id="url" name="url" type="url" maxlength="2048" spellcheck="false" placeholder="https://example.com/video.torrent">
    <label for="torrent">或上传 .torrent 文件</label>
    <input id="torrent" name="torrent" type="file" accept=".torrent,application/x-bittorrent">
    <button type="submit">查看文件</button>
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
