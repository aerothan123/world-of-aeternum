#!/usr/bin/env node
// Wyndlewood Discord server admin: a small, idempotent REST tool that brings
// the community server in line with a declarative spec (roles, categories,
// channels, topics, slow mode, read-only announcement channels, icon) and
// posts prepared messages with images or audio clips.
//
// Usage (run from the repo root):
//   node scripts/discord/server_admin.mjs whoami
//   node scripts/discord/server_admin.mjs apply  [spec.json] [--prune-defaults]
//   node scripts/discord/server_admin.mjs icon   <image.png>
//   node scripts/discord/server_admin.mjs post   <channel-name> <message.md> [image or audio file ...]
//
// Env: DISCORD_BOT_TOKEN (required), DISCORD_GUILD_ID (optional: defaults to
// the single guild the bot is in whose name matches spec.serverName).
// The token is read from the environment only and is never printed.
// Zero dependencies: built-in fetch, FormData and Blob (Node 18+).

import { readFileSync } from 'node:fs';
import { basename, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://discord.com/api/v10';
const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SPEC = resolve(HERE, 'wyndlewood_server.json');

// Permission bits (Discord docs, "Bitwise Permission Flags").
const P = {
  VIEW_CHANNEL: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  SEND_MESSAGES_IN_THREADS: 1n << 38n,
  CREATE_PUBLIC_THREADS: 1n << 35n,
  ADD_REACTIONS: 1n << 6n,
};
const CHANNEL_TYPE = { text: 0, voice: 2, category: 4 };
const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
};

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  console.error('DISCORD_BOT_TOKEN is not set.');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One request at a time; honour 429 retry_after and the per-route bucket.
async function api(method, path, { json, form, reason } = {}) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const headers = { Authorization: `Bot ${token}`, 'User-Agent': 'WyndlewoodServerAdmin (local, 1.0)' };
    if (reason) headers['X-Audit-Log-Reason'] = encodeURIComponent(reason);
    let body;
    if (json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(json);
    } else if (form) {
      body = form;
    }
    const res = await fetch(API + path, { method, headers, body });
    if (res.status === 429) {
      const data = await res.json().catch(() => ({}));
      const wait = Math.ceil((Number(data.retry_after) || 1) * 1000) + 250;
      console.log(`  rate limited, waiting ${wait} ms`);
      await sleep(wait);
      continue;
    }
    const remaining = res.headers.get('x-ratelimit-remaining');
    const resetAfter = Number(res.headers.get('x-ratelimit-reset-after') || 0);
    if (remaining === '0' && resetAfter > 0) await sleep(Math.ceil(resetAfter * 1000));
    if (res.status === 204) return null;
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const msg = data && data.message ? data.message : text;
      throw new Error(`${method} ${path} failed: ${res.status} ${msg}`);
    }
    return data;
  }
  throw new Error(`${method} ${path}: gave up after repeated rate limits`);
}

function loadSpec(path) {
  return JSON.parse(readFileSync(path || DEFAULT_SPEC, 'utf8'));
}

async function findGuild(spec) {
  if (process.env.DISCORD_GUILD_ID) return api('GET', `/guilds/${process.env.DISCORD_GUILD_ID}`);
  const guilds = await api('GET', '/users/@me/guilds');
  const want = (spec && spec.serverName) || 'Wyndlewood';
  const hits = guilds.filter((g) => g.name === want);
  if (hits.length !== 1) {
    throw new Error(`Bot is in ${hits.length} guild(s) named "${want}". Set DISCORD_GUILD_ID.`);
  }
  return api('GET', `/guilds/${hits[0].id}`);
}

const colorInt = (hex) => (hex ? Number.parseInt(String(hex).replace('#', ''), 16) : 0);
const norm = (s) => String(s).toLowerCase();

async function applyRoles(guild, spec) {
  const roles = await api('GET', `/guilds/${guild.id}/roles`);
  const byName = new Map(roles.map((r) => [norm(r.name), r]));
  for (const want of spec.roles || []) {
    const have = byName.get(norm(want.name));
    const body = { name: want.name, color: colorInt(want.color), hoist: !!want.hoist, mentionable: !!want.mentionable };
    if (!have) {
      const made = await api('POST', `/guilds/${guild.id}/roles`, { json: body, reason: 'server spec' });
      byName.set(norm(made.name), made);
      console.log(`  + role ${want.name}`);
    } else if (have.color !== body.color || have.hoist !== body.hoist || have.mentionable !== body.mentionable) {
      const upd = await api('PATCH', `/guilds/${guild.id}/roles/${have.id}`, { json: body, reason: 'server spec' });
      byName.set(norm(upd.name), upd);
      console.log(`  ~ role ${want.name}`);
    }
  }
  return byName;
}

function overwritesFor(guild, roleByName, ch) {
  const out = [];
  if (ch.readOnly) {
    // @everyone can read and react but not post; listed roles can post.
    out.push({ id: guild.id, type: 0, allow: (P.VIEW_CHANNEL | P.ADD_REACTIONS).toString(), deny: (P.SEND_MESSAGES | P.SEND_MESSAGES_IN_THREADS | P.CREATE_PUBLIC_THREADS).toString() });
    for (const rn of ch.postRoles || []) {
      const role = roleByName.get(norm(rn));
      if (role) out.push({ id: role.id, type: 0, allow: (P.SEND_MESSAGES | P.SEND_MESSAGES_IN_THREADS).toString(), deny: '0' });
    }
  }
  return out;
}

async function applyChannels(guild, spec, roleByName, pruneDefaults) {
  let channels = await api('GET', `/guilds/${guild.id}/channels`);
  const find = (name, type, parentId) =>
    channels.find((c) => norm(c.name) === norm(name) && c.type === type && (parentId === undefined || (c.parent_id || null) === parentId));

  let catPos = 0;
  for (const cat of spec.categories || []) {
    let catCh = find(cat.name, CHANNEL_TYPE.category);
    if (!catCh) {
      catCh = await api('POST', `/guilds/${guild.id}/channels`, { json: { name: cat.name, type: CHANNEL_TYPE.category }, reason: 'server spec' });
      channels.push(catCh);
      console.log(`  + category ${cat.name}`);
    }
    if (catCh.position !== catPos) {
      await api('PATCH', `/channels/${catCh.id}`, { json: { position: catPos }, reason: 'server spec' });
    }
    catPos++;

    let pos = 0;
    for (const ch of cat.channels || []) {
      const type = CHANNEL_TYPE[ch.type || 'text'];
      const name = type === CHANNEL_TYPE.text ? ch.name.toLowerCase().replace(/\s+/g, '-') : ch.name;
      // Match inside this category first, then anywhere (so a channel made elsewhere moves in).
      let have = find(name, type, catCh.id) || find(name, type);
      const body = { name, parent_id: catCh.id, position: pos };
      if (type === CHANNEL_TYPE.text) {
        body.topic = ch.topic || null;
        body.rate_limit_per_user = ch.slowmode || 0;
      }
      const ow = overwritesFor(guild, roleByName, ch);
      if (ow.length) body.permission_overwrites = ow;
      if (!have) {
        have = await api('POST', `/guilds/${guild.id}/channels`, { json: { ...body, type }, reason: 'server spec' });
        channels.push(have);
        console.log(`  + ${ch.type || 'text'} ${name}`);
      } else {
        await api('PATCH', `/channels/${have.id}`, { json: body, reason: 'server spec' });
        console.log(`  ~ ${ch.type || 'text'} ${name}`);
      }
      pos++;
    }
  }

  if (pruneDefaults) {
    channels = await api('GET', `/guilds/${guild.id}/channels`);
    for (const d of spec.pruneDefaults || []) {
      const cat = d.category ? channels.find((c) => c.type === CHANNEL_TYPE.category && norm(c.name) === norm(d.category)) : null;
      const target = channels.find(
        (c) => c.type === CHANNEL_TYPE[d.type || 'text'] && norm(c.name) === norm(d.name) && (!d.category || (cat && c.parent_id === cat.id)),
      );
      if (target) {
        await api('DELETE', `/channels/${target.id}`, { reason: 'remove empty default' });
        console.log(`  - ${d.type || 'text'} ${d.name}${d.category ? ` (in ${d.category})` : ''}`);
      }
    }
    // Remove categories the spec does not list once they are empty.
    channels = await api('GET', `/guilds/${guild.id}/channels`);
    const keep = new Set((spec.categories || []).map((c) => norm(c.name)));
    for (const c of channels.filter((x) => x.type === CHANNEL_TYPE.category && !keep.has(norm(x.name)))) {
      if (!channels.some((x) => x.parent_id === c.id)) {
        await api('DELETE', `/channels/${c.id}`, { reason: 'remove empty default category' });
        console.log(`  - category ${c.name}`);
      }
    }
  }
}

function fileBlob(path) {
  const buf = readFileSync(path);
  return new Blob([buf], { type: MIME[extname(path).toLowerCase()] || 'application/octet-stream' });
}

async function setIcon(guild, path) {
  const buf = readFileSync(path);
  const mime = MIME[extname(path).toLowerCase()] || 'image/png';
  await api('PATCH', `/guilds/${guild.id}`, { json: { icon: `data:${mime};base64,${buf.toString('base64')}` }, reason: 'server icon' });
  console.log(`  icon set from ${basename(path)}`);
}

async function post(guild, channelName, mdPath, images) {
  const channels = await api('GET', `/guilds/${guild.id}/channels`);
  const ch = channels.find((c) => c.type === CHANNEL_TYPE.text && norm(c.name) === norm(channelName));
  if (!ch) throw new Error(`No text channel named ${channelName}`);
  const content = readFileSync(mdPath, 'utf8').trim();
  // Discord caps a message at 2000 characters: split on blank lines.
  const chunks = [];
  let cur = '';
  for (const para of content.split(/\n\s*\n/)) {
    const next = cur ? `${cur}\n\n${para}` : para;
    if (next.length > 1900 && cur) {
      chunks.push(cur);
      cur = para;
    } else cur = next;
  }
  if (cur) chunks.push(cur);
  for (let i = 0; i < chunks.length; i++) {
    const last = i === chunks.length - 1;
    if (last && images.length) {
      const form = new FormData();
      const attachments = images.map((p, n) => ({ id: n, filename: basename(p) }));
      form.append('payload_json', JSON.stringify({ content: chunks[i], attachments, allowed_mentions: { parse: [] } }));
      images.slice(0, 10).forEach((p, n) => form.append(`files[${n}]`, fileBlob(p), basename(p)));
      await api('POST', `/channels/${ch.id}/messages`, { form });
    } else {
      await api('POST', `/channels/${ch.id}/messages`, { json: { content: chunks[i], allowed_mentions: { parse: [] } } });
    }
  }
  console.log(`  posted to #${ch.name} (${chunks.length} message(s), ${images.length} image(s))`);
}

const [cmd, ...args] = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const pos = args.filter((a) => !a.startsWith('--'));
try {
  if (cmd === 'whoami') {
    const me = await api('GET', '/users/@me');
    const guilds = await api('GET', '/users/@me/guilds');
    console.log(`bot: ${me.username} (${me.id})`);
    for (const g of guilds) console.log(`  guild: ${g.name} (${g.id})`);
  } else if (cmd === 'apply') {
    const spec = loadSpec(pos[0]);
    const guild = await findGuild(spec);
    console.log(`applying spec to ${guild.name}`);
    const roles = await applyRoles(guild, spec);
    await applyChannels(guild, spec, roles, flags.has('--prune-defaults'));
    if (spec.icon) await setIcon(guild, resolve(dirname(pos[0] || DEFAULT_SPEC), spec.icon));
    console.log('done');
  } else if (cmd === 'icon') {
    const guild = await findGuild(loadSpec());
    await setIcon(guild, pos[0]);
  } else if (cmd === 'post') {
    const guild = await findGuild(loadSpec());
    await post(guild, pos[0], pos[1], pos.slice(2));
  } else {
    console.log('commands: whoami | apply [spec] [--prune-defaults] | icon <file> | post <channel> <file.md> [images...]');
    process.exit(cmd ? 2 : 0);
  }
} catch (e) {
  console.error(String(e.message || e));
  process.exit(1);
}
