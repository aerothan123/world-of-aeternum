// A loopback TCP tap for measuring what a native client really puts on the wire:
// it forwards 127.0.0.1:<listen> to 127.0.0.1:<target>, logs each WebSocket
// upgrade's negotiated Sec-WebSocket-Extensions (is permessage-deflate on?),
// and counts the bytes in both directions per connection.
//
//   node scripts/unreal/ws_tap.mjs --listen 8791 --target 8790 --log tap.jsonl
//
// Loopback only on both sides, by construction.

import { appendFileSync } from 'node:fs';
import net from 'node:net';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}
const listen = Number(arg('listen', '8791'));
const target = Number(arg('target', '8790'));
const log = arg('log');

function emit(obj) {
  const line = JSON.stringify({ at: new Date().toISOString(), ...obj });
  console.log(line);
  if (log) appendFileSync(log, `${line}\n`);
}

let nextId = 1;
net
  .createServer((client) => {
    const id = nextId++;
    const t0 = Date.now();
    const upstream = net.connect(target, '127.0.0.1');
    let up = 0;
    let down = 0;
    let head = '';
    let sawHead = false;
    let ws = false;
    client.on('data', (d) => {
      up += d.length;
      upstream.write(d);
    });
    upstream.on('data', (d) => {
      down += d.length;
      if (!sawHead) {
        head += d.toString('latin1');
        const end = head.indexOf('\r\n\r\n');
        if (end >= 0) {
          sawHead = true;
          const lines = head.slice(0, end).split('\r\n');
          ws = /^HTTP\/1\.1 101/.test(lines[0]);
          if (ws) {
            const ext = lines.find((l) => /^sec-websocket-extensions:/i.test(l));
            emit({
              id,
              event: 'upgrade',
              status: lines[0],
              extensions: ext ? ext.split(':')[1].trim() : null,
            });
          }
        }
      }
      client.write(d);
    });
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      const s = (Date.now() - t0) / 1000;
      if (ws)
        emit({
          id,
          event: 'close',
          seconds: s,
          upBytes: up,
          downBytes: down,
          downKBps: Number((down / 1024 / s).toFixed(2)),
        });
      client.destroy();
      upstream.destroy();
    };
    client.on('close', close);
    upstream.on('close', close);
    client.on('error', close);
    upstream.on('error', close);
    // A periodic sample so a long session can be read while it runs.
    const timer = setInterval(() => {
      if (ws)
        emit({
          id,
          event: 'sample',
          seconds: (Date.now() - t0) / 1000,
          upBytes: up,
          downBytes: down,
        });
    }, 10000);
    client.on('close', () => clearInterval(timer));
  })
  .listen(listen, '127.0.0.1', () => emit({ event: 'listening', listen, target }));
