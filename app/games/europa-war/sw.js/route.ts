import manifest from "../strategy/map-assets.json";
import { EUROPA_OFFLINE_VERSION } from "../strategy/offline-protocol";
import { SIMULATION_WORKER_PATH } from "../strategy/worker-bootstrap";

// Cache only this public game page, immutable Next assets and its terrain image.
const worker = `
const VERSION = ${JSON.stringify(EUROPA_OFFLINE_VERSION)};
const TERRAIN = ${JSON.stringify(manifest.terrain.url)};
const BOOTSTRAP = ${JSON.stringify(SIMULATION_WORKER_PATH)};
const PAGE = '/games/europa-war';
const PREFIX = 'xarmy-europa-pack-v2-';
const INDEX = 'xarmy-europa-pack-index-v2';
const LEGACY = 'xarmy-europa-offline-v1';
const POINTER = PAGE + '/__active_pack__';
const COMPLETE = PAGE + '/__complete_pack__';
let preparing = Promise.resolve();
self.addEventListener('install', e => { e.waitUntil(self.skipWaiting()); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });
async function activePack() {
    const pointer = await (await caches.open(INDEX)).match(POINTER);
    return pointer ? await pointer.text() : null;
}
async function packNames() {
    const active = await activePack();
    const names = await caches.keys();
    return [...new Set([active, ...names.filter(name => name.startsWith(PREFIX)), names.includes(LEGACY) ? LEGACY : null].filter(Boolean))];
}
async function prunePacks(active, previous) {
    const names = await caches.keys();
    const keep = new Set([active]);
    if (previous && previous !== active && await (await caches.open(previous)).match(COMPLETE))
        keep.add(previous);
    if (keep.size === 1) {
        for (const name of names.slice().reverse()) {
            if (name !== active && name.startsWith(PREFIX) && await (await caches.open(name)).match(COMPLETE)) {
                keep.add(name);
                break;
            }
        }
    }
    await Promise.all(names.filter(name => (name.startsWith(PREFIX) && !keep.has(name)) || name === LEGACY).map(name => caches.delete(name)));
}
async function cachedAsset(request) {
    for (const name of await packNames()) {
        const cache = await caches.open(name);
        if (name !== LEGACY && !await cache.match(COMPLETE))
            continue;
        const hit = await cache.match(request);
        if (hit)
            return hit;
    }
}
async function cachedPage() {
    for (const name of await packNames()) {
        const cache = await caches.open(name);
        if (name !== LEGACY && !await cache.match(COMPLETE))
            continue;
        const page = await cache.match(PAGE);
        if (page)
            return page;
    }
}
function localAsset(value) {
    if (typeof value !== 'string')
        throw new Error('Invalid asset');
    const url = new URL(value, self.location.origin);
    if (url.origin !== self.location.origin || !url.pathname.startsWith('/_next/static/'))
        throw new Error('Non-public asset');
    return url.href;
}
function bootstrapEntry(value) {
    try {
        const url = new URL(value, self.location.origin);
        if (url.origin !== self.location.origin || url.pathname !== BOOTSTRAP || url.hash || [...url.searchParams.keys()].length !== 1)
            return null;
        const entryValue = url.searchParams.get('entry');
        if (!entryValue)
            return null;
        const entry = new URL(entryValue, self.location.origin);
        return entry.origin === self.location.origin && entry.pathname.startsWith('/_next/static/chunks/') && entry.pathname.endsWith('.js') && !entry.search && !entry.hash ? entry.href : null;
    } catch {
        return null;
    }
}
function workerAsset(value) {
    if (typeof value !== 'string')
        throw new Error('Invalid worker asset');
    if (bootstrapEntry(value))
        return new URL(value, self.location.origin).href;
    return localAsset(value);
}
async function cachePack(data) {
    if (data.version !== VERSION || !Array.isArray(data.assets) || !Array.isArray(data.workerAssets) || !data.workerAssets.length || data.terrain !== TERRAIN)
        throw new Error('Incomplete pack description');
    const main = data.assets.map(localAsset);
    const simulation = data.workerAssets.map(workerAsset);
    if (!main.some(value => new URL(value).pathname.endsWith('.js')) || simulation.some(value => !new URL(value).pathname.endsWith('.js')))
        throw new Error('Missing script');
    const entries = simulation.map(bootstrapEntry).filter(Boolean);
    if (entries.length !== 1 || !simulation.includes(entries[0]))
        throw new Error('Missing scoped worker or its immutable entry');
    const applicationScripts = new Set(main.filter(value => new URL(value).pathname.endsWith('.js') && !simulation.includes(value)));
    const assets = [...new Set([...main, ...simulation, new URL(TERRAIN, self.location.origin).href])].sort();
    if (assets.length > 256)
        throw new Error('Too many assets');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(assets)));
    const name = PREFIX + Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
    const cache = await caches.open(name);
    // A previously completed identical pack also works after an offline reload.
    if (await cache.match(COMPLETE) && await cache.match(PAGE) && (await Promise.all(assets.map(url => cache.match(url)))).every(Boolean))
        return;
    const previous = await activePack();
    try {
        // A failed update never replaces the pointer to the last complete pack.
        for (const url of assets) {
            if (await cache.match(url))
                continue;
            const hit = await cachedAsset(url);
            const response = hit || await fetch(url, { credentials: 'same-origin' });
            if (!response.ok)
                throw new Error('Asset download failed');
            await cache.put(url, response);
        }
        const page = await fetch(PAGE, { headers: { Accept: 'text/html' }, cache: 'no-cache' });
        if (!page.ok || !page.headers.get('content-type')?.includes('text/html'))
            throw new Error('Page download failed');
        const html = await page.clone().text();
        // A deployment changing while the pack downloads must not mix two builds.
        const references = html.matchAll(/<(?:script|link)\\b[^>]*?\\b(?:src|href)=["']([^"']+)["']/gi);
        let hasApplicationScript = false;
        for (const match of references) {
            const url = new URL(match[1].replace(/&amp;/g, '&'), self.location.origin);
            if (url.origin === self.location.origin && url.pathname.startsWith('/_next/static/') && !assets.includes(url.href))
                throw new Error('Page build changed');
            if (/^<script\\b/i.test(match[0]) && applicationScripts.has(url.href))
                hasApplicationScript = true;
        }
        if (!hasApplicationScript)
            throw new Error('Page has no current application script');
        await cache.put(PAGE, page);
        await cache.put(COMPLETE, new Response(VERSION));
        await (await caches.open(INDEX)).put(POINTER, new Response(name));
        // Cleanup happens only after activation and cannot invalidate that commit.
        await prunePacks(name, previous).catch(() => { });
    }
    catch (error) {
        if (name !== previous)
            await caches.delete(name);
        throw error;
    }
}
self.addEventListener('message', e => {
    const reply = type => e.ports?.[0]?.postMessage({ type, version: VERSION, terrain: TERRAIN });
    if (e.data?.type === 'EUROPA_PING') {
        reply('EUROPA_VERSION');
        return;
    }
    if (e.data?.type !== 'EUROPA_CACHE')
        return;
    preparing = preparing.catch(() => { }).then(async () => {
        try {
            await cachePack(e.data);
            reply('EUROPA_READY');
        }
        catch {
            reply('EUROPA_FAILED');
        }
    });
    e.waitUntil(preparing);
});
self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET')
        return;
    const url = new URL(e.request.url);
    if (url.origin !== self.location.origin)
        return;
    if (e.request.mode === 'navigate' && (url.pathname === PAGE || url.pathname === PAGE + '/')) {
        e.respondWith(fetch(e.request).catch(async () => await cachedPage() || new Response('Çevrimdışı oyun paketi henüz indirilmedi. İlk açılışta internet bağlantısı gerekir.', { status: 503, headers: { 'Content-Type': 'text/plain;charset=utf-8' } })));
    }
    else if (url.pathname.startsWith('/_next/static/') || bootstrapEntry(url.href) || /^\\/games\\/europa-war\\/terrain-[a-f0-9]{12}\\.webp$/.test(url.pathname)) {
        // Older completed packs can still reference an earlier immutable terrain URL.
        e.respondWith((async () => await cachedAsset(e.request) || fetch(e.request))());
    }
});
`;

export function GET() {
  return new Response(worker, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache",
      "Service-Worker-Allowed": "/games/europa-war",
    },
  });
}
