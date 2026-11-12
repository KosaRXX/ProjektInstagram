// Wspólne narzędzia animacji dla szablonów.
// Wszystko jest funkcją czasu t (sekundy) — żadnych setTimeout / requestAnimationFrame,
// dzięki temu każda klatka renderuje się deterministycznie, niezależnie od szybkości maszyny.

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, p) => a + (b - a) * p;
/** Postęp 0..1 w przedziale [start, start+dur]. */
export const progress = (t, start, dur) => clamp((t - start) / dur);

export const ease = {
  linear: (x) => x,
  outCubic: (x) => 1 - Math.pow(1 - x, 3),
  inCubic: (x) => x * x * x,
  inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  outExpo: (x) => (x === 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  outBack: (x) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  },
};

/** Deterministyczny generator liczb losowych (ten sam seed = ta sama "losowość" w każdym renderze). */
export function seeded(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rozkłada sceny na oś czasu: [{...scene, start, end}] i zwraca łączny czas. */
export function timeline(scenes, defaultDuration = 3) {
  let cursor = 0;
  const items = scenes.map((s, index) => {
    const duration = s.duration ?? defaultDuration;
    const item = { ...s, index, start: cursor, end: cursor + duration, duration };
    cursor += duration;
    return item;
  });
  return { items, total: cursor };
}

/** Zwraca scenę aktywną w czasie t wraz z czasem lokalnym. */
export function sceneAt(tl, t) {
  const s = tl.items.find((it) => t >= it.start && t < it.end) ?? tl.items[tl.items.length - 1];
  return { scene: s, local: t - s.start };
}

/** Escapuje HTML i zamienia *słowo* na akcent. Zwraca tablicę słów (HTML). */
export function markupWords(text = '') {
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const out = [];
  let accent = false;
  for (const raw of text.split(/\s+/).filter(Boolean)) {
    let w = raw;
    const opens = w.startsWith('*');
    if (opens) { accent = true; w = w.slice(1); }
    const closes = w.endsWith('*');
    if (closes) w = w.slice(0, -1);
    out.push({ html: esc(w), accent });
    if (closes) accent = false;
  }
  return out;
}
