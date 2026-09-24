// Minimal Foundry document/API doubles; no renderer or game-system emulation.
export class Collection extends Map {
  [Symbol.iterator]() { return this.values(); }
  find(fn) { return [...this.values()].find(fn); }
  filter(fn) { return [...this.values()].filter(fn); }
  map(fn) { return [...this.values()].map(fn); }
}
export function getProperty(value, path) {
  return path.split('.').reduce((current, key) => current?.[key], value);
}
export function setProperty(value, path, next) {
  const keys = path.split('.'), last = keys.pop();
  for (const key of keys) value = value[key] ??= {};
  if (last.startsWith('-=')) delete value[last.slice(2)];
  else value[last] = next;
  return true;
}
function mergeObject(base, changes, { inplace = true } = {}) {
  const result = inplace ? base : structuredClone(base);
  for (const [key, value] of Object.entries(changes)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) result[key] = mergeObject(result[key] ?? {}, value);
    else result[key] = value;
  }
  return result;
}
export function world() {
  const trace = { updates: [], creates: [], deletes: [], sounds: [], sockets: [], events: [], notifications: [] };
  const once = new Map(), listeners = new Map(), settings = new Map();
  let sequence = 0;
  globalThis.FormApplication = class {};
  globalThis.Hooks = {
    once: (name, fn) => once.set(name, fn),
    on(name, fn) { const list = listeners.get(name) ?? []; list.push(fn); listeners.set(name, list); return list.length; },
    off() {}, callAll: (...args) => trace.events.push(args)
  };
  const gm = { id: 'gm', active: true, isGM: true, targets: new Set(),
    updateTokenTargets(ids) { this.targets = new Set(ids.map(id => canvas.tokens.get(id))); } };
  globalThis.game = {
    user: gm, users: new Collection([[gm.id, gm]]), modules: new Map([['easy-traps', {}]]),
    system: { id: 'dnd5e' }, actors: new Collection(), scenes: new Collection(), paused: false,
    settings: {
      register: (_module, key, config) => settings.set(key, config), registerMenu() {},
      get: (_module, key) => settings.get(key)?.default,
      set: async (_module, key, value) => settings.set(key, { default: value })
    },
    socket: { emit: (...args) => trace.sockets.push(args), on() {} },
    togglePause: async value => { game.paused = value; }
  };
  globalThis.foundry = { utils: { deepClone: structuredClone, getProperty, setProperty, mergeObject, randomID: () => `id${++sequence}` } };
  globalThis.ChatMessage = { create: async data => { trace.events.push(['chat', data]); return data; } };
  globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, OWNER: 3 }, GRID_TYPES: { SQUARE: 1 } };
  globalThis.ui = { notifications: Object.fromEntries(['info', 'warn', 'error'].map(level => [level, message => trace.notifications.push([level, message])])) };
  globalThis.requestAnimationFrame = fn => queueMicrotask(fn);
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  globalThis.document = { querySelectorAll: () => [] };
  const scene = {
    id: 'scene', grid: { size: 100, distance: 5, units: 'ft', type: 1 },
    tiles: new Collection(), tokens: new Collection(), walls: new Collection(), templates: new Collection(),
    async createEmbeddedDocuments(type, data) {
      trace.creates.push([type, structuredClone(data)]);
      return data.map(entry => doc(type, entry));
    },
    async deleteEmbeddedDocuments(type, ids, options) {
      trace.deletes.push([type, ids, options]);
      for (const id of ids) collection(type).delete(id);
    },
    async updateEmbeddedDocuments(type, updates) {
      for (const update of updates) await collection(type).get(update._id).update(update);
    }
  };
  const collection = type => scene[{ Tile: 'tiles', Token: 'tokens', Wall: 'walls', MeasuredTemplate: 'templates' }[type]];
  function doc(type, data) {
    const id = data._id ?? `doc${++sequence}`;
    const result = {
      flags: {}, ...structuredClone(data), id, uuid: `Scene.scene.${type}.${id}`, documentName: type, parent: scene,
      getFlag(module, key) { return this.flags[module]?.[key]; },
      async update(changes, options) {
        trace.updates.push([id, structuredClone(changes), options]);
        for (const [key, value] of Object.entries(changes)) setProperty(this, key, value);
        return this;
      }
    };
    collection(type).set(id, result);
    return result;
  }
  globalThis.canvas = {
    ready: false, scene, grid: { size: 100, sizeX: 100, sizeY: 100 },
    dimensions: { sceneX: 0, sceneY: 0, sceneWidth: 2000, sceneHeight: 2000, size: 100, distance: 5 },
    tokens: { placeables: [], controlled: [], get(id) { return this.placeables.find(token => token.id === id); } },
    sounds: { emitAtPosition: (...args) => { trace.sounds.push(args); return Promise.resolve(); } }
  };
  game.scenes.set(scene.id, scene);
  function token(id, x = 0, extra = {}) {
    const document = doc('Token', { _id: id, x, y: 0, width: 1, height: 1, actorId: `actor-${id}`, ...extra });
    document.actor = { id: document.actorId };
    const object = { id, document, x, y: 0, w: 100, h: 100 };
    document.object = object; canvas.tokens.placeables.push(object);
    return document;
  }
  function trap(flags = {}) {
    return doc('Tile', { x: 0, y: 0, width: 100, height: 100, hidden: true, flags: {
      'easy-traps': { kind: 'alarm-grid', armed: true, alarm: { chat: { mode: 'off' } }, ...flags }
    } });
  }
  return { trace, once, listeners, settings, gm, scene, doc, token, trap };
}
