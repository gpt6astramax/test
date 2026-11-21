import { connect } from 'cloudflare:sockets';
import { clientIdentity, loadTorrent, readBytes } from './torrent.js';
import { TorrentTransfer } from './peer.js';

const route = '/torrent-download';
const pttime = 'https://www.pttime.org';
const downloadPath = '/download.php';
const cookieName = 'pttime_source';

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

    if (pathname === route + '/download') {
      return openDownload(request, origin);
    }

    const file = /^\/torrent-download\/file\/(\d{1,20})(\/ready)?$/.exec(pathname);
    if (!file) return message('找不到该地址。', 404);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return message('请使用 GET 或 HEAD。', 405, { Allow: 'GET, HEAD' });
    }
    return downloadFile(request, ctx, origin, file[1], Boolean(file[2]));
  },
};

async function openDownload(request, origin) {
  if (request.method !== 'POST') return message('请使用 POST。', 405, { Allow: 'POST' });
  const requestOrigin = request.headers.get('Origin');
  const sameOriginNavigation = requestOrigin === 'null' && request.headers.get('Sec-Fetch-Site') === 'same-origin';
  if (requestOrigin && requestOrigin !== origin && !sameOriginNavigation) {
    return message('请从下载页提交。', 403);
  }
  if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/x-www-form-urlencoded') {
    return message('请提交 PTTime 下载链接。', 415);
  }

  const form = await readBytes(request.body, 4096).catch(() => null);
  if (!form) return message('下载链接过长或无法读取。', 400);
  const source = new URLSearchParams(new TextDecoder().decode(form)).get('url');
  const credentials = parseSource(source);
  if (!credentials) return message('请输入带 id、uid 和 passkey 的 PTTime 下载链接。', 400);

  const { id, uid, passkey } = credentials;
  const filePath = route + '/file/' + id;
  return new Response(null, {
    status: 303,
    headers: {
      ...privateHeaders,
      Location: filePath + '/ready',
      'Set-Cookie': cookieName + '=' + id + '.' + uid + '.' + passkey +
        '; Path=' + filePath + '; Max-Age=86400; HttpOnly; Secure; SameSite=Lax',
    },
  });
}

async function downloadFile(request, ctx, origin, id, ready) {
  const filePath = route + '/file/' + id;
  const stored = request.headers.get('Cookie')?.match(
    /(?:^|;\s*)pttime_source=(\d{1,20})\.(\d{1,20})\.([a-f0-9]{32})(?=;|$)/i,
  );
  if (!stored || stored[1] !== id) {
    return fileError(request, '请先从 PTTime 下载页打开这个种子。', 401, route + '/');
  }

  const source = new URL(downloadPath, pttime);
  source.search = new URLSearchParams({ id, passkey: stored[3], uid: stored[2] });

  let transfer;
  try {
    const meta = await loadTorrent(source);
    if (ready) return readyPage(meta, filePath);

    const range = byteRange(request.headers.get('Range'), meta.size);
    if (!range) {
      return message('请求的区间超出文件范围。', 416, { 'Content-Range': 'bytes */' + meta.size });
    }

    const size = range.end - range.start + 1;
    const headers = {
      ...privateHeaders,
      'Accept-Ranges': 'bytes',
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': disposition(meta.filename),
      'Content-Length': String(size),
    };
    const status = range.partial ? 206 : 200;
    if (range.partial) headers['Content-Range'] = 'bytes ' + range.start + '-' + range.end + '/' + meta.size;
    if (request.method === 'HEAD') return new Response(null, { status, headers });

    const client = await clientIdentity(meta, origin);
    transfer = new TorrentTransfer(meta, connect, client, caches.default);
    await transfer.start();
    let position = range.start;
    let firstPiece = await transfer.piece(Math.floor(position / meta.pieceLength));

    const body = new ReadableStream({
      async pull(controller) {
        try {
          const index = Math.floor(position / meta.pieceLength);
          const piece = firstPiece ?? await transfer.piece(index);
          firstPiece = null;
          const offset = position - index * meta.pieceLength;
          const length = Math.min(piece.length - offset, range.end - position + 1);
          controller.enqueue(piece.subarray(offset, offset + length));
          position += length;
          if (position > range.end) {
            controller.close();
            ctx.waitUntil(transfer.finish(size === meta.size ? 'complete' : 'range'));
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
    const publicMessage = error?.message?.replace(/https?:\/\/\S+|[0-9a-f]{32,}/gi, '[已隐藏]');
    const duplicate = publicMessage?.includes('下载相同种子');
    return fileError(
      request,
      publicMessage || '无法从 BT 节点读取这个文件。',
      duplicate ? 409 : 502,
      ready ? route + '/' : filePath + '/ready',
    );
  }
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
  if (request.method !== 'GET' || !navigation) return message(reason, status);

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

function readyPage(meta, filePath) {
  const nonce = crypto.randomUUID();
  const filename = escapeText(meta.filename);
  const size = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(meta.size / 1e9);
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
  a { display: inline-block; background: #1059d2; color: white; text-decoration: none; padding: .8rem 1.2rem; border-radius: .65rem; }
  output { display: block; min-height: 1.5em; }
</style>
</head>
<body>
<main>
  <h1>下载原文件</h1>
  <p class="file">FILE_NAME</p>
  <p>FILE_SIZE GB</p>
  <p><a id="download" href="FILE_PATH">下载文件</a></p>
  <p><output id="status" role="status"></output></p>
</main>
<script nonce="NONCE">
  document.getElementById('download').addEventListener('click', () => {
    document.getElementById('status').textContent = '正在连接 BT 节点并校验首个分片。文件就绪后，浏览器会提示下载。';
  });
</script>
</body>
</html>`;
  return new Response(html.replace(/FILE_NAME|FILE_SIZE|FILE_PATH|NONCE/g, token => ({
    FILE_NAME: filename, FILE_SIZE: size, FILE_PATH: filePath, NONCE: nonce,
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
<title>PTTime 原文件下载</title>
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
  <h1>PTTime 原文件下载</h1>
  <form action="/torrent-download/download" method="post" autocomplete="off">
    <label for="url">PTTime 下载链接</label>
    <input id="url" name="url" type="url" required maxlength="2048" spellcheck="false">
    <button type="submit">打开下载页</button>
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
