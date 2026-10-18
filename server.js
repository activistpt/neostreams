'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const ADMIN_USER = process.env.ADMIN_USER || 'pirata';
const ADMIN_PASS = process.env.ADMIN_PASS || 'neoiptv369!';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.m3u': 'audio/x-mpegurl; charset=utf-8',
  '.m3u8': 'application/vnd.apple.mpegurl; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Range, If-Range',
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    ...CORS_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 64 * 1024) {
        req.destroy();
        reject(new Error('Body too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function upstreamRequest(targetUrl, reqHeaders, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch (e) {
      return reject(new Error('Invalid URL'));
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return reject(new Error('Unsupported protocol'));
    }
    const client = parsed.protocol === 'https:' ? https : http;
    const headers = {
      'User-Agent': reqHeaders['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': '*/*',
    };
    if (reqHeaders['range']) headers['Range'] = reqHeaders['range'];

    const upReq = client.request(
      parsed,
      {
        method: 'GET',
        headers,
        timeout: 20000,
        rejectUnauthorized: false,
      },
      (upRes) => {
        if (
          [301, 302, 303, 307, 308].includes(upRes.statusCode) &&
          upRes.headers.location &&
          maxRedirects > 0
        ) {
          upRes.resume();
          const nextUrl = new URL(upRes.headers.location, parsed).toString();
          return resolve(upstreamRequest(nextUrl, reqHeaders, maxRedirects - 1));
        }
        resolve({ res: upRes, finalUrl: parsed.toString() });
      }
    );
    upReq.on('timeout', () => {
      upReq.destroy(new Error('Upstream timeout'));
    });
    upReq.on('error', reject);
    upReq.end();
  });
}

async function handleProxy(req, res, targetUrl) {
  if (!targetUrl) {
    res.writeHead(400, CORS_HEADERS);
    return res.end('Missing url parameter');
  }
  try {
    const { res: upRes } = await upstreamRequest(targetUrl, req.headers);
    const outHeaders = {
      ...CORS_HEADERS,
      'Cache-Control': 'no-cache',
    };
    if (upRes.headers['content-type']) outHeaders['Content-Type'] = upRes.headers['content-type'];
    if (upRes.headers['content-length']) outHeaders['Content-Length'] = upRes.headers['content-length'];
    if (upRes.headers['content-range']) outHeaders['Content-Range'] = upRes.headers['content-range'];
    if (upRes.headers['accept-ranges']) outHeaders['Accept-Ranges'] = upRes.headers['accept-ranges'];

    res.writeHead(upRes.statusCode || 200, outHeaders);
    upRes.pipe(res);
    req.on('close', () => {
      try { upRes.destroy(); } catch (e) {}
    });
  } catch (e) {
    if (!res.headersSent) {
      res.writeHead(502, { ...CORS_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Proxy error: ' + (e.message || String(e)));
    }
  }
}

async function handleProxyM3u8(req, res, targetUrl) {
  if (!targetUrl) {
    res.writeHead(400, CORS_HEADERS);
    return res.end('Missing url parameter');
  }
  try {
    const { res: upRes, finalUrl } = await upstreamRequest(targetUrl, req.headers);
    let raw = '';
    upRes.setEncoding('utf8');
    for await (const chunk of upRes) {
      raw += chunk;
      if (raw.length > 10 * 1024 * 1024) break;
    }

    const base = new URL(finalUrl);
    const rewritten = raw
      .split(/\r?\n/)
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return line;
        if (trimmed.startsWith('#')) {
          return line.replace(/URI="([^"]+)"/g, (_, uri) => {
            try {
              const abs = new URL(uri, base).toString();
              return `URI="/proxy?url=${encodeURIComponent(abs)}"`;
            } catch (e) {
              return `URI="${uri}"`;
            }
          });
        }
        try {
          const abs = new URL(trimmed, base).toString();
          const isM3u8 = /\.m3u8(\?|$)/i.test(abs);
          return (isM3u8 ? '/proxy/m3u8?url=' : '/proxy?url=') + encodeURIComponent(abs);
        } catch (e) {
          return line;
        }
      })
      .join('\n');

    res.writeHead(200, {
      ...CORS_HEADERS,
      'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(rewritten);
  } catch (e) {
    if (!res.headersSent) {
      res.writeHead(502, { ...CORS_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('M3U8 proxy error: ' + (e.message || String(e)));
    }
  }
}

function serveStatic(req, res, pathname) {
  let relPath = pathname === '/' ? '/index.html' : pathname;
  let safePath = path.normalize(path.join(ROOT, relPath));
  if (!safePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.stat(safePath, (err, stat) => {
    if (err || !stat.isFile()) {
      safePath = path.join(ROOT, 'index.html');
    }
    const ext = path.extname(safePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': contentType });
    fs.createReadStream(safePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS);
      return res.end();
    }

    const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (u.pathname === '/api/health') {
      return sendJson(res, 200, { ok: true, service: 'neostreams', time: Date.now() });
    }

    if (u.pathname === '/api/auth' && req.method === 'POST') {
      const body = await readJsonBody(req).catch(() => ({}));
      const user = String(body.user || '').trim();
      const pass = String(body.pass || '');
      if (
        (user === 'pirata' && pass === 'neoiptv369!') ||
        (user === ADMIN_USER && pass === ADMIN_PASS) ||
        (user === 'admin' && pass === 'neostreams') ||
        (user === 'ptlegion' && pass === 'neostreams')
      ) {
        const token = crypto.randomBytes(24).toString('hex');
        const exp = Date.now() + 30 * 24 * 60 * 60 * 1000;
        return sendJson(res, 200, { ok: true, token, exp, user, expires: null, guest: false });
      }
      return sendJson(res, 401, { error: 'Utilizador ou password incorretos.' });
    }

    if (u.pathname === '/api/source') {
      const m3uFile = path.join(ROOT, 'playlists', 'custom-pt.m3u');
      if (fs.existsSync(m3uFile)) {
        res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'audio/x-mpegurl; charset=utf-8', 'Cache-Control': 'no-store' });
        return fs.createReadStream(m3uFile).pipe(res);
      }
      res.writeHead(404, CORS_HEADERS);
      return res.end('Source not found');
    }

    if (u.pathname === '/api/playlists') {
      const pFile = path.join(ROOT, 'playlists', 'playlists.json');
      const list = JSON.parse(fs.readFileSync(pFile, 'utf8'));
      if (process.env.EXTRA_PLAYLIST_URL) {
        list.splice(1, 0, {
          id: 'prsc-live',
          name: process.env.EXTRA_PLAYLIST_NAME || 'PRSC Live (Xtream)',
          url: process.env.EXTRA_PLAYLIST_URL,
        });
      }
      return sendJson(res, 200, list);
    }

    if (u.pathname === '/proxy') {
      return await handleProxy(req, res, u.searchParams.get('url'));
    }

    if (u.pathname === '/proxy/m3u8') {
      return await handleProxyM3u8(req, res, u.searchParams.get('url'));
    }

    serveStatic(req, res, u.pathname);
  } catch (e) {
    if (!res.headersSent) {
      res.writeHead(500, { ...CORS_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Internal Server Error');
    }
  }
});

server.listen(PORT, () => {
  console.log(`NeoStreams a correr em http://localhost:${PORT}`);
});
