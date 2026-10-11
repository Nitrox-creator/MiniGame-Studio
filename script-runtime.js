export function prepareSceneObjects(blocks = [], importedAssets = new Map()) {
  const items = [];

  for (const block of blocks) {
    const key = block.key ?? `${block.x ?? 0},${block.y ?? 0},${block.z ?? 0}`;
    items.push({
      id: `block:${key}`,
      name: block.type ?? 'block',
      type: 'block',
      position: [Number(block.x ?? 0), Number(block.y ?? 0), Number(block.z ?? 0)],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: block.color ?? '#587c62',
      key
    });
  }

  for (const asset of importedAssets.values()) {
    const position = asset.object?.position?.toArray?.() ?? [0, 0, 0];
    const rotation = asset.object?.rotation?.toArray?.() ?? [0, 0, 0];
    const scale = asset.object?.scale?.toArray?.() ?? [1, 1, 1];
    items.push({
      id: `asset:${asset.id}`,
      name: asset.name ?? 'Modèle importé',
      type: 'asset',
      format: asset.format ?? 'model',
      position: position.slice(0, 3),
      rotation: rotation.slice(0, 3),
      scale: scale.slice(0, 3),
      color: '#8cc6ff',
      assetId: asset.id
    });
  }

  return items;
}

export function buildScriptWorkerSource() {
  return `self.onmessage = async ({ data }) => {
    const commands = [];
    const makeCommand = (action, id, payload = {}) => {
      const command = { action, id, ...payload };
      if (typeof id !== 'string') return null;
      commands.push(command);
      return command;
    };
    const robustNumber = (value, fallback = 0) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const toColor = (value, fallback = '#ffffff') => {
      const stringValue = String(value ?? fallback);
      return /^#[\da-f]{6}$/i.test(stringValue) ? stringValue : fallback;
    };
    const normalizePosition = (value) => {
      const next = Array.isArray(value) ? value.slice(0, 3) : [0, 0, 0];
      return next.map((entry) => robustNumber(entry, 0));
    };
    const objects = Array.isArray(data.objects) ? data.objects.map((item) => ({ ...item })) : [];
    const log = (...values) => postMessage({ type: 'log', values: values.map(String) });
    const api = Object.freeze({
      objects: Object.freeze(objects),
      log,
      get: (id) => objects.find((object) => object.id === id) ?? null,
      find: (predicate) => {
        if (typeof predicate === 'function') return objects.filter((object) => predicate(object));
        if (typeof predicate === 'string') return objects.filter((object) => String(object.name ?? '').toLowerCase().includes(predicate.toLowerCase()));
        if (predicate && typeof predicate === 'object') {
          const keys = Object.keys(predicate);
          return objects.filter((object) => keys.every((key) => object[key] === predicate[key]));
        }
        return [];
      },
      move: (id, x, y, z) => makeCommand('move', id, { values: normalizePosition([x, y, z]) }),
      rotate: (id, degrees) => makeCommand('rotate', id, { value: robustNumber(degrees) }),
      scale: (id, value) => makeCommand('scale', id, { value: robustNumber(value, 1) }),
      color: (id, value) => makeCommand('color', id, { value: toColor(value, '#ffffff') }),
      select: (id) => makeCommand('select', id),
      delete: (id) => makeCommand('delete', id),
      create: (type, position, options = {}) => {
        const normalizedType = typeof type === 'string' && type.trim() ? type.trim() : 'block';
        const payload = typeof position === 'object' && !Array.isArray(position) ? position : {};
        const values = normalizePosition(Array.isArray(position) ? position : payload.position ?? [0, 0, 0]);
        const command = makeCommand('create', 'block:' + values.map((entry) => String(Math.round(entry))).join(','), {
          type: normalizedType,
          position: values,
          color: toColor(payload.color ?? options.color ?? '#587c62', '#587c62'),
          name: typeof payload.name === 'string' ? payload.name : (typeof options.name === 'string' ? options.name : normalizedType)
        });
        return command;
      },
      set: (id, patch) => {
        if (!patch || typeof patch !== 'object') return false;
        const object = objects.find((entry) => entry.id === id);
        if (!object) return false;
        if (Array.isArray(patch.position) && patch.position.length >= 3) object.position = patch.position.slice(0, 3).map(Number);
        if (Array.isArray(patch.rotation) && patch.rotation.length >= 3) object.rotation = patch.rotation.slice(0, 3).map(Number);
        if (Array.isArray(patch.scale) && patch.scale.length >= 3) object.scale = patch.scale.slice(0, 3).map(Number);
        if (typeof patch.name === 'string') object.name = patch.name;
        if (typeof patch.color === 'string') object.color = patch.color;
        makeCommand('set', id, { patch: { ...patch } });
        return true;
      },
      wait: (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)))
    });
    try {
      const runtime = new Function('api', '"use strict"; return (async () => { ' + data.script + ' })();');
      await runtime(api);
      postMessage({ type: 'done', commands });
    } catch (error) {
      postMessage({ type: 'error', message: String(error && error.stack ? error.stack : error) });
    }
  };`;
}
