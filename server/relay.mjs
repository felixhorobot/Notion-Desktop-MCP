// In-process CDP relay in front of Notion's debug port :9222.
// Why: Notion keeps a hidden blank page target (url "") that never answers CDP commands, which makes
// Playwright's connectOverCDP hang forever. The relay hides such targets from Playwright.
// It also drops Playwright's prefers-color-scheme override, which would flip Notion to light theme.
import http from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';

export const UP = 'localhost:9222';
const log = (...a) => console.error('[notion-cdp-relay]', ...a); // stdout belongs to MCP stdio
// Ghosts: url-less pages, and untitled file:// renderer pages (the Tab Bar has a title); neither answers CDP.
// Limit: decided once at attach time; track targetInfoChanged if Notion starts using them later
const isGhost = info => info && info.type === 'page' && (!info.url || (info.url.startsWith('file:') && !info.title));

/** Starts the relay on a free localhost port; resolves to that port. */
export function startRelay() {
  let port;
  const server = http.createServer(async (req, res) => {
    try {
      const r = await fetch(`http://${UP}${req.url}`);
      let body = await r.text();
      if (req.url.startsWith('/json')) {
        let j = JSON.parse(body);
        if (Array.isArray(j)) j = j.filter(t => !isGhost(t));
        body = JSON.stringify(j).replaceAll(`ws://${UP}/`, `ws://localhost:${port}/`);
      }
      res.writeHead(r.status, { 'content-type': 'application/json' }).end(body);
    } catch (e) {
      res.writeHead(502).end(`Notion debug port ${UP} unreachable (${e.message})`);
    }
  });

  new WebSocketServer({ server }).on('error', () => {}).on('connection', (client, req) => {
    const up = new WebSocket(`ws://${UP}${req.url}`, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
    const ghostSessions = new Set(), ghostTargets = new Set(), ownIds = new Set();
    let nextOwnId = 1e9;
    const pending = [];
    up.on('open', () => { for (const m of pending.splice(0)) up.send(m); });
    client.on('message', raw => {
      let s = raw.toString();
      if (s.includes('"Emulation.setEmulatedMedia"')) {
        const m = JSON.parse(s);
        m.params = { ...m.params, features: [] };
        s = JSON.stringify(m);
      }
      up.readyState === WebSocket.OPEN ? up.send(s) : pending.push(s);
    });

    up.on('message', raw => {
      const s = raw.toString();
      const m = JSON.parse(s);
      if (ownIds.delete(m.id)) return;
      if (m.sessionId && ghostSessions.has(m.sessionId)) return;
      const p = m.params;
      if (m.method === 'Target.attachedToTarget' && isGhost(p.targetInfo)) {
        ghostSessions.add(p.sessionId); ghostTargets.add(p.targetInfo.targetId);
        const id = nextOwnId++; ownIds.add(id);
        up.send(JSON.stringify({ id, method: 'Target.detachFromTarget', params: { sessionId: p.sessionId }, ...(m.sessionId && { sessionId: m.sessionId }) }));
        log('hid unresponsive blank target', p.targetInfo.targetId.slice(0, 8));
        return;
      }
      if (m.method?.startsWith('Target.') && p && (ghostTargets.has(p.targetId) || ghostTargets.has(p.targetInfo?.targetId) || ghostSessions.has(p.sessionId))) return;
      if (m.result?.targetInfos) m.result.targetInfos = m.result.targetInfos.filter(t => !isGhost(t));
      client.send(m.result?.targetInfos ? JSON.stringify(m) : s);
    });
    const end = () => { client.close(); up.close(); };
    up.on('close', end); client.on('close', end);
    up.on('error', e => { log('upstream error', e.message); end(); });
    client.on('error', end);
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, 'localhost', () => { port = server.address().port; log(`relay ${port} -> ${UP}`); resolve(port); });
  });
}
