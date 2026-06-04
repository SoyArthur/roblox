// ═══════════════════════════════════════════════════════════════════
//  VISUAL SYSTEM — Persona × Undertale pixel art, 2.5D style
//  All canvas functions replaced. Same public API, same DOM contracts.
// ═══════════════════════════════════════════════════════════════════

// ── palette ─────────────────────────────────────────────────────────
const P = {
  void:    '#07080d',
  deep:    '#0e1320',
  mid:     '#161d2e',
  panel:   '#1a2235',
  border:  '#2a3a5c',
  accent:  '#4ee3e3',
  accentD: '#1fa8b4',
  gold:    '#f5c842',
  rose:    '#e85c8a',
  mint:    '#5ef0a0',
  snow:    '#dff3ff',
  fog:     '#a8bdd4',
  warning: '#ff9b57',
  danger:  '#ff4060',
  shadow:  'rgba(0,0,0,0.7)',
  text:    '#e8f4ff',
  textDim: '#6a8aaa',
  // terrain
  water:   '#0d2b4e',
  waterHi: '#1a4a7a',
  shore:   '#3d5c7e',
  ice:     '#5a8eb0',
  snow1:   '#c8dde8',
  snow2:   '#a0b8cc',
  forest1: '#1e3d28',
  forest2: '#2a5a36',
  cave1:   '#2a1e38',
  cave2:   '#3d2a52',
  prison1: '#3a1a2a',
  camp1:   '#2e2838',
  hullFill:'#0f1e2c',
  hullDk:  '#091520',
  hullHL:  '#1e3446',
};

// ── pixel font rendering ─────────────────────────────────────────────
// Bitmap pixel glyphs rendered as fillRects — Undertale vibe
const PIXEL_FONT = {
  '0':[[1,1,1],[1,0,1],[1,0,1],[1,0,1],[1,1,1]],
  '1':[[0,1,0],[1,1,0],[0,1,0],[0,1,0],[1,1,1]],
  '2':[[1,1,1],[0,0,1],[1,1,1],[1,0,0],[1,1,1]],
  '3':[[1,1,1],[0,0,1],[0,1,1],[0,0,1],[1,1,1]],
  '4':[[1,0,1],[1,0,1],[1,1,1],[0,0,1],[0,0,1]],
  '5':[[1,1,1],[1,0,0],[1,1,1],[0,0,1],[1,1,1]],
  '6':[[1,1,1],[1,0,0],[1,1,1],[1,0,1],[1,1,1]],
  '7':[[1,1,1],[0,0,1],[0,1,0],[0,1,0],[0,1,0]],
  '8':[[1,1,1],[1,0,1],[1,1,1],[1,0,1],[1,1,1]],
  '9':[[1,1,1],[1,0,1],[1,1,1],[0,0,1],[1,1,1]],
  'A':[[0,1,0],[1,0,1],[1,1,1],[1,0,1],[1,0,1]],
  'B':[[1,1,0],[1,0,1],[1,1,0],[1,0,1],[1,1,0]],
  'C':[[1,1,1],[1,0,0],[1,0,0],[1,0,0],[1,1,1]],
  'D':[[1,1,0],[1,0,1],[1,0,1],[1,0,1],[1,1,0]],
  'E':[[1,1,1],[1,0,0],[1,1,0],[1,0,0],[1,1,1]],
  'F':[[1,1,1],[1,0,0],[1,1,0],[1,0,0],[1,0,0]],
  'G':[[1,1,1],[1,0,0],[1,0,1],[1,0,1],[1,1,1]],
  'H':[[1,0,1],[1,0,1],[1,1,1],[1,0,1],[1,0,1]],
  'I':[[1,1,1],[0,1,0],[0,1,0],[0,1,0],[1,1,1]],
  'J':[[0,1,1],[0,0,1],[0,0,1],[1,0,1],[1,1,1]],
  'K':[[1,0,1],[1,0,1],[1,1,0],[1,0,1],[1,0,1]],
  'L':[[1,0,0],[1,0,0],[1,0,0],[1,0,0],[1,1,1]],
  'M':[[1,0,1],[1,1,1],[1,1,1],[1,0,1],[1,0,1]],
  'N':[[1,0,1],[1,1,1],[1,1,1],[1,0,1],[1,0,1]],
  'O':[[1,1,1],[1,0,1],[1,0,1],[1,0,1],[1,1,1]],
  'P':[[1,1,1],[1,0,1],[1,1,1],[1,0,0],[1,0,0]],
  'Q':[[1,1,1],[1,0,1],[1,0,1],[1,1,1],[0,0,1]],
  'R':[[1,1,0],[1,0,1],[1,1,0],[1,0,1],[1,0,1]],
  'S':[[1,1,1],[1,0,0],[1,1,1],[0,0,1],[1,1,1]],
  'T':[[1,1,1],[0,1,0],[0,1,0],[0,1,0],[0,1,0]],
  'U':[[1,0,1],[1,0,1],[1,0,1],[1,0,1],[1,1,1]],
  'V':[[1,0,1],[1,0,1],[1,0,1],[0,1,0],[0,1,0]],
  'W':[[1,0,1],[1,0,1],[1,1,1],[1,1,1],[1,0,1]],
  'X':[[1,0,1],[1,0,1],[0,1,0],[1,0,1],[1,0,1]],
  'Y':[[1,0,1],[1,0,1],[0,1,0],[0,1,0],[0,1,0]],
  'Z':[[1,1,1],[0,0,1],[0,1,0],[1,0,0],[1,1,1]],
  ' ':[[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0]],
  ':':[[0,0],[0,1],[0,0],[0,1],[0,0]],
  '-':[[0,0,0],[0,0,0],[1,1,1],[0,0,0],[0,0,0]],
  '.':[[0,0],[0,0],[0,0],[0,0],[0,1]],
  '!':[[0,1],[0,1],[0,1],[0,0],[0,1]],
  '?':[[1,1,0],[0,0,1],[0,1,0],[0,0,0],[0,1,0]],
  '/':[[0,0,1],[0,0,1],[0,1,0],[1,0,0],[1,0,0]],
  '·':[[0],[0],[1],[0],[0]],
  '→':[[0,1,0,0],[0,0,1,0],[1,1,1,1],[0,0,1,0],[0,1,0,0]],
};

function drawPixelChar(ctx, ch, x, y, scale, color) {
  const g = PIXEL_FONT[ch.toUpperCase()] || PIXEL_FONT['?'];
  if (!g) return;
  ctx.fillStyle = color;
  for (let row = 0; row < g.length; row++) {
    for (let col = 0; col < g[row].length; col++) {
      if (g[row][col]) ctx.fillRect(x + col * scale, y + row * scale, scale, scale);
    }
  }
}

function drawPixelText(ctx, text, x, y, scale = 2, color = P.text) {
  let cx = x;
  for (const ch of String(text || '')) {
    const g = PIXEL_FONT[ch.toUpperCase()];
    const w = g ? g[0].length : 3;
    drawPixelChar(ctx, ch, cx, y, scale, color);
    cx += (w + 1) * scale;
  }
}

function pixelTextWidth(text, scale = 2) {
  let w = 0;
  for (const ch of String(text || '')) {
    const g = PIXEL_FONT[ch.toUpperCase()];
    w += ((g ? g[0].length : 3) + 1) * scale;
  }
  return w;
}

// ── utility draw ────────────────────────────────────────────────────
function drawText(ctx, text, x, y, color = P.text, size = 12, align = 'left') {
  ctx.fillStyle = color;
  ctx.font = `${size}px "Press Start 2P", "Courier New", monospace`;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
}

function drawBar(ctx, x, y, w, h, value, fill = P.mint) {
  const v = clamp(value, 0, 1);
  // bg
  ctx.fillStyle = '#0a0f18';
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  // fill
  ctx.fillStyle = fill;
  ctx.fillRect(Math.round(x) + 1, Math.round(y) + 1, Math.max(0, Math.floor((w - 2) * v)), Math.round(h) - 2);
  // border pixel art style
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), 1);
  ctx.fillRect(Math.round(x), Math.round(y), 1, Math.round(h));
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(Math.round(x), Math.round(y) + Math.round(h) - 1, Math.round(w), 1);
  ctx.fillRect(Math.round(x) + Math.round(w) - 1, Math.round(y), 1, Math.round(h));
}

function wrapText(text, limit = 18) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > limit && current) { lines.push(current); current = word; }
    else current = next;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

// Persona-style speech bubble with pixel border
function renderBubble(ctx, text, x, y, width = 160, color = P.snow) {
  const lines = wrapText(text, Math.floor(width / 7)).slice(0, 3);
  const lineH = 14;
  const h = 14 + lines.length * lineH;
  const px = Math.round(x);
  const py = Math.round(y - h);
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(px + 3, py + 3, width, h);
  // bg
  ctx.fillStyle = P.deep;
  ctx.fillRect(px, py, width, h);
  // pixel border — 4 sides
  ctx.fillStyle = P.accent;
  ctx.fillRect(px, py, width, 2);
  ctx.fillRect(px, py + h - 2, width, 2);
  ctx.fillRect(px, py, 2, h);
  ctx.fillRect(px + width - 2, py, 2, h);
  // inner highlight
  ctx.fillStyle = 'rgba(78,227,227,0.08)';
  ctx.fillRect(px + 2, py + 2, width - 4, 1);
  // tail triangle
  ctx.fillStyle = P.deep;
  ctx.fillRect(px + 10, py + h, 8, 3);
  ctx.fillRect(px + 12, py + h + 3, 4, 2);
  ctx.fillStyle = P.accent;
  ctx.fillRect(px + 9, py + h, 1, 2);
  ctx.fillRect(px + 18, py + h, 1, 2);
  // text
  ctx.fillStyle = color;
  ctx.font = '9px "Press Start 2P", monospace';
  ctx.textAlign = 'left';
  lines.forEach((line, i) => ctx.fillText(line, px + 7, py + 13 + i * lineH));
}

// ── profession → role visual data ───────────────────────────────────
function getAgentVisual(agent) {
  const prof = String(agent?.profession || '').toLowerCase();
  const isTraitor = state.debugRevealRoles && agent?.role === 'traitor';
  // each returns: { bodyColor, headColor, accentColor, symbol, auraColor }
  const roles = {
    captain:  { bodyColor:'#1a3a5c', headColor:'#ebf4ff', accentColor:'#8ad8ff', symbol:'C', auraColor:'rgba(138,216,255,0.25)' },
    engineer: { bodyColor:'#3a2a0a', headColor:'#f5e8b0', accentColor:'#f5c842', symbol:'E', auraColor:'rgba(245,200,66,0.2)' },
    doctor:   { bodyColor:'#0a2a1a', headColor:'#c8f5e0', accentColor:'#5ef0a0', symbol:'D', auraColor:'rgba(94,240,160,0.2)' },
    hunter:   { bodyColor:'#2a1a0a', headColor:'#d9c4a0', accentColor:'#d4864e', symbol:'H', auraColor:'rgba(212,134,78,0.2)' },
    cook:     { bodyColor:'#2a1a2a', headColor:'#f0d4e0', accentColor:'#e85c8a', symbol:'K', auraColor:'rgba(232,92,138,0.18)' },
    scout:    { bodyColor:'#1a2a1a', headColor:'#d4e8d0', accentColor:'#78e87c', symbol:'S', auraColor:'rgba(120,232,124,0.18)' },
    guard:    { bodyColor:'#2a2a2a', headColor:'#d0d8e8', accentColor:'#aabcd8', symbol:'G', auraColor:'rgba(170,188,216,0.18)' },
    medic:    { bodyColor:'#0a2a1a', headColor:'#c8f5e0', accentColor:'#5ef0a0', symbol:'M', auraColor:'rgba(94,240,160,0.2)' },
  };
  let vis = roles[prof] || { bodyColor:'#1e2d42', headColor:'#dff3ff', accentColor:'#4ee3e3', symbol:'?', auraColor:'rgba(78,227,227,0.15)' };
  if (isTraitor) vis = { ...vis, bodyColor:'#3a0a0a', headColor:'#ffd0d0', accentColor:'#ff4060', symbol:'T', auraColor:'rgba(255,64,96,0.3)' };
  return vis;
}

// Full detailed pixel-art character sprite (64px scale)
// animPhase: 0-1 walk cycle phase (driven by now/240 + position hash)
function drawAgentSprite(ctx, x, y, label, color, selected = false, imprisoned = false, dead = false, swimming = false, agent = null, animPhase = 0) {
  const px = Math.round(x);
  const py = Math.round(y);
  const vis = agent ? getAgentVisual(agent) : { bodyColor: color, headColor: '#ebf4ff', accentColor: color, symbol: '?', auraColor: 'rgba(78,227,227,0.15)' };
  const bc = imprisoned ? '#3a1a3a' : dead ? '#1a1a22' : vis.bodyColor;
  const hc = imprisoned ? '#f0c46a' : dead ? '#556070' : vis.headColor;
  const ac = imprisoned ? '#b26486' : dead ? '#445060' : vis.accentColor;

  // Walk cycle: sine-based leg/arm swing. Dead/imprisoned = no anim.
  const walkActive = !dead && !imprisoned && !swimming;
  const swing = walkActive ? Math.sin(animPhase * Math.PI * 2) : 0;   // -1..1
  const swingAlt = walkActive ? -swing : 0;                            // opposite leg
  const legSwing  = Math.round(swing * 2.5);    // px vertical offset for leg extension
  const armSwing  = Math.round(swing * 3);      // px vertical offset for arm swing
  // Bob body slightly with step
  const bodyBob   = walkActive ? Math.abs(Math.sin(animPhase * Math.PI * 2)) * 1 : 0;

  ctx.save();

  // ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(px, py + 8, 7, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();

  if (swimming) {
    ctx.fillStyle = 'rgba(67,170,255,0.28)';
    ctx.beginPath();
    ctx.ellipse(px, py + 10, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(138,216,255,0.18)';
    ctx.beginPath();
    ctx.ellipse(px - 4, py + 12, 4, 1.5, -0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // selected aura glow — 2.5D highlight ring
  if (selected) {
    ctx.fillStyle = vis.auraColor;
    ctx.beginPath();
    ctx.ellipse(px, py + 8, 15, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // corner brackets (Persona style selection indicator)
    ctx.fillStyle = ac;
    [[px-14,py-18],[px+10,py-18]].forEach(([bx,by])=>{
      ctx.fillRect(bx, by, 4, 2); ctx.fillRect(bx, by, 2, 5);
    });
    [[px-14,py+8],[px+10,py+8]].forEach(([bx,by])=>{
      ctx.fillRect(bx, by, 4, 2); ctx.fillRect(bx, by+2-4, 2, 4);
    });
  }

  const pyB = Math.round(py - bodyBob); // body y with bob

  // ── legs (2 pixel blocks, animated) ─────────────────────────────
  const legColor = dead ? '#2a3040' : imprisoned ? '#6a3050' : '#0e1a2a';
  ctx.fillStyle = legColor;
  // Left leg swings forward, right leg swings back
  const leftLegY  = pyB + 2;
  const rightLegY = pyB + 2;
  const leftLegH  = 7 + legSwing;   // extend when forward
  const rightLegH = 7 - legSwing;
  ctx.fillRect(px - 5, leftLegY,  4, Math.max(3, leftLegH));
  ctx.fillRect(px + 1, rightLegY, 4, Math.max(3, rightLegH));
  // boot highlights
  ctx.fillStyle = dead ? '#3a4050' : ac;
  ctx.fillRect(px - 5, leftLegY  + Math.max(3, leftLegH)  - 2, 4, 2);
  ctx.fillRect(px + 1, rightLegY + Math.max(3, rightLegH) - 2, 4, 2);

  // ── body ─────────────────────────────────────────────────────────
  ctx.fillStyle = bc;
  ctx.fillRect(px - 6, pyB - 9, 12, 12);
  // body highlight (top-left pixel art shading)
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(px - 6, pyB - 9, 12, 2);
  ctx.fillRect(px - 6, pyB - 9, 2, 10);
  // body shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(px + 2, pyB - 9, 4, 12);
  ctx.fillRect(px - 6, pyB + 1, 12, 2);

  // role badge on chest
  ctx.fillStyle = ac;
  ctx.fillRect(px - 2, pyB - 5, 4, 4);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(px - 1, pyB - 4, 2, 2);

  // ── arms (animated swing) ────────────────────────────────────────
  ctx.fillStyle = bc;
  if (imprisoned) {
    ctx.fillRect(px - 9, pyB - 7, 3, 8);
    ctx.fillRect(px + 6, pyB - 7, 3, 8);
    ctx.fillStyle = ac;
    ctx.fillRect(px - 9, pyB - 2, 3, 2);
    ctx.fillRect(px + 6, pyB - 2, 3, 2);
  } else if (dead) {
    ctx.fillStyle = bc;
    ctx.fillRect(px - 11, py - 6, 5, 3);
    ctx.fillRect(px + 6,  py - 6, 5, 3);
  } else {
    // Arms swing opposite to legs (natural gait)
    const leftArmTopY  = pyB - 8 - armSwing;    // left arm swings back when left leg forward
    const rightArmTopY = pyB - 8 + armSwing;
    ctx.fillRect(px - 9, leftArmTopY,  3, 9);
    ctx.fillRect(px + 6, rightArmTopY, 3, 9);
    // hand
    ctx.fillStyle = hc;
    ctx.fillRect(px - 9, leftArmTopY  + 9, 3, 2);
    ctx.fillRect(px + 6, rightArmTopY + 9, 3, 2);
  }

  // ── neck ─────────────────────────────────────────────────────────
  ctx.fillStyle = hc;
  ctx.fillRect(px - 2, pyB - 13, 4, 5);

  // ── head ─────────────────────────────────────────────────────────
  ctx.fillStyle = hc;
  ctx.fillRect(px - 5, pyB - 20, 10, 9);
  // head top shading
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(px - 5, pyB - 20, 10, 2);
  ctx.fillRect(px - 5, pyB - 20, 2, 7);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(px + 3, pyB - 20, 2, 9);
  ctx.fillRect(px - 5, pyB - 13, 10, 2);

  // eyes
  ctx.fillStyle = dead ? P.fog : P.void;
  ctx.fillRect(px - 3, pyB - 17, 2, 2);
  ctx.fillRect(px + 1, pyB - 17, 2, 2);
  if (!dead && !imprisoned) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(px - 2, pyB - 17, 1, 1);
    ctx.fillRect(px + 2, pyB - 17, 1, 1);
  }
  // mouth
  if (dead) {
    ctx.fillStyle = P.fog;
    ctx.fillRect(px - 2, pyB - 14, 4, 1);
  } else if (imprisoned) {
    ctx.fillStyle = ac;
    ctx.fillRect(px - 2, pyB - 14, 1, 2);
    ctx.fillRect(px + 1, pyB - 14, 1, 2);
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(px - 2, pyB - 14, 4, 1);
  }

  // hair / hat per role
  if (!dead) {
    ctx.fillStyle = ac;
    if (agent?.profession === 'Captain') {
      ctx.fillRect(px - 7, pyB - 21, 14, 2);
      ctx.fillRect(px - 4, pyB - 23, 8, 3);
      ctx.fillStyle = P.gold;
      ctx.fillRect(px - 2, pyB - 23, 4, 1);
    } else if (agent?.profession === 'Doctor' || agent?.profession === 'Medic') {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(px - 1, pyB - 20, 2, 4);
      ctx.fillRect(px - 2, pyB - 19, 4, 2);
    } else if (agent?.profession === 'Engineer') {
      ctx.fillStyle = P.gold;
      ctx.fillRect(px - 4, pyB - 18, 3, 2);
      ctx.fillRect(px + 1, pyB - 18, 3, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(px - 3, pyB - 18, 2, 1);
      ctx.fillRect(px + 2, pyB - 18, 2, 1);
    } else {
      ctx.fillRect(px - 4, pyB - 21, 8, 2);
    }
  }

  ctx.restore();
}

// ── terrain color ────────────────────────────────────────────────────
function terrainColorFor(code, zoneFallback = null) {
  const map = {
    '~': P.water,
    's': P.shore,
    'f': P.forest1,
    'g': P.ice,
    'd': '#4a3828',
    'p': P.prison1,
    'c': P.cave1,
    'n': P.camp1,
    'k': '#1e4050',
    'o': P.snow1,
  };
  if (map[code]) return map[code];
  if (zoneFallback === 'ship')       return P.shore;
  if (zoneFallback === 'forest')     return P.forest1;
  if (zoneFallback === 'glacier')    return P.ice;
  if (zoneFallback === 'cave')       return P.cave1;
  if (zoneFallback === 'prison')     return P.prison1;
  if (zoneFallback === 'camp')       return P.camp1;
  if (zoneFallback === 'north_camp') return '#283a52';
  if (zoneFallback === 'south_dock') return '#1e3850';
  return P.snow2;
}

// ── terrain cache — 2.5D pixel art tiles ─────────────────────────────
function ensureTerrainCache(world, tile) {
  const canvas = $('worldCanvas');
  if (!canvas || !world) return null;
  const worldMap = world.map || { width: WORLD_W, height: WORLD_H };
  const terrain = world.terrain || {};
  const rows = Array.isArray(terrain.rows) ? terrain.rows : [];
  const key = `2d5_${worldMap.width}x${worldMap.height}|${tile}|${terrain.version || 0}|${JSON.stringify(world.zones || {})}`;
  const cache = state.terrainCache;
  if (cache.canvas && cache.key === key) return cache;

  const off = document.createElement('canvas');
  off.width = worldMap.width * tile;
  off.height = worldMap.height * tile;
  const ctx = off.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  for (let ty = 0; ty < worldMap.height; ty++) {
    for (let tx = 0; tx < worldMap.width; tx++) {
      const zone = bestZoneAt({ x: tx, y: ty }, world.zones || {});
      const code = rows[ty]?.[tx] || null;
      const blocked = (world.boulders || []).some((b) => b.x === tx && b.y === ty);
      const px = tx * tile;
      const py = ty * tile;
      const base = terrainColorFor(code, zone);

      // base tile
      ctx.fillStyle = base;
      ctx.fillRect(px, py, tile, tile);

      // pixel art dithering — top-left lighter, bottom-right darker
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(px, py, tile, 1);
      ctx.fillRect(px, py, 1, tile);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(px, py + tile - 1, tile, 1);
      ctx.fillRect(px + tile - 1, py, 1, tile);

      if (code === '~') {
        // water — animated shimmer baked as static for cache
        ctx.fillStyle = P.waterHi;
        ctx.fillRect(px + 1, py + Math.floor(tile * 0.3), tile - 2, 1);
        ctx.fillRect(px + Math.floor(tile*0.2), py + Math.floor(tile * 0.65), Math.floor(tile*0.5), 1);
        ctx.fillStyle = 'rgba(20,74,122,0.6)';
        ctx.fillRect(px + 2, py + 2, tile - 4, tile - 4);
      } else if (code === 'f') {
        // forest — mini tree silhouettes
        if ((tx + ty) % 3 === 0) {
          ctx.fillStyle = P.forest2;
          ctx.fillRect(px + Math.floor(tile*0.35), py + Math.floor(tile*0.1), Math.floor(tile*0.3), Math.floor(tile*0.5));
          ctx.fillStyle = '#163020';
          ctx.fillRect(px + Math.floor(tile*0.44), py + Math.floor(tile*0.5), Math.floor(tile*0.12), Math.floor(tile*0.3));
        }
      } else if (code === 'o') {
        // snow — sparkle dots
        if ((tx * 7 + ty * 13) % 11 === 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.fillRect(px + Math.floor(tile*0.5), py + Math.floor(tile*0.3), 1, 1);
          ctx.fillRect(px + Math.floor(tile*0.5)-1, py + Math.floor(tile*0.3), 3, 1);
          ctx.fillRect(px + Math.floor(tile*0.5), py + Math.floor(tile*0.3)-1, 1, 3);
        }
      } else if (code === 'c') {
        // cave — depth dithering
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(px + 2, py + 2, tile - 4, tile - 4);
        if ((tx + ty) % 4 === 0) {
          ctx.fillStyle = '#4a2e68';
          ctx.fillRect(px + Math.floor(tile*0.3), py + Math.floor(tile*0.3), Math.floor(tile*0.4), Math.floor(tile*0.4));
        }
      }

      if (blocked) {
        // boulder — 2.5D pixel art rock
        ctx.fillStyle = '#3a4555';
        ctx.fillRect(px + Math.floor(tile*0.1), py + Math.floor(tile*0.25), Math.floor(tile*0.8), Math.floor(tile*0.6));
        ctx.fillStyle = '#556070';
        ctx.fillRect(px + Math.floor(tile*0.1), py + Math.floor(tile*0.25), Math.floor(tile*0.8), Math.floor(tile*0.18));
        ctx.fillRect(px + Math.floor(tile*0.1), py + Math.floor(tile*0.25), Math.floor(tile*0.12), Math.floor(tile*0.6));
        ctx.fillStyle = '#222d38';
        ctx.fillRect(px + Math.floor(tile*0.7), py + Math.floor(tile*0.55), Math.floor(tile*0.2), Math.floor(tile*0.3));
        // crack detail
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(px + Math.floor(tile*0.35), py + Math.floor(tile*0.35), 1, Math.floor(tile*0.3));
      }

      // zone edge tinting
      if (zone) {
        ctx.fillStyle = 'rgba(255,255,255,0.025)';
        ctx.fillRect(px + Math.floor(tile*0.12), py + Math.floor(tile*0.12), Math.floor(tile*0.12), Math.floor(tile*0.12));
      }
    }
  }

  state.terrainCache = { key, canvas: off, width: off.width, height: off.height };
  return state.terrainCache;
}

// ── ship hull — top-down naval vessel ────────────────────────────────
function drawShipHullOutline(ctx, x, y, w, h, opts = {}) {
  // Top-down ship: bow is LEFT, stern is RIGHT
  // x,y = top-left of bounding box, w=width, h=height
  const bowTip  = x;                    // leftmost point (bow tip)
  const bowBase = x + w * 0.18;         // where bow tapers end
  const sternStart = x + w * 0.85;      // where stern begins to taper
  const sternEnd   = x + w;             // rightmost point (stern)
  const midY = y + h / 2;
  const topEdge = y + h * 0.08;         // deck top edge (slight inset)
  const botEdge = y + h * 0.92;         // deck bottom edge

  ctx.save();

  // ── hull drop shadow ────────────────────────────────────────────
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.moveTo(bowTip + 4,   midY + 3);
  ctx.lineTo(bowBase + 4,  topEdge + 3);
  ctx.lineTo(sternStart + 4, topEdge + 3);
  ctx.quadraticCurveTo(sternEnd + 4, topEdge + 3, sternEnd + 4, midY + 3);
  ctx.quadraticCurveTo(sternEnd + 4, botEdge + 3, sternStart + 4, botEdge + 3);
  ctx.lineTo(bowBase + 4,  botEdge + 3);
  ctx.closePath();
  ctx.fill();

  // ── outer hull body ─────────────────────────────────────────────
  ctx.beginPath();
  ctx.moveTo(bowTip,    midY);
  ctx.lineTo(bowBase,   topEdge);
  ctx.lineTo(sternStart, topEdge);
  ctx.quadraticCurveTo(sternEnd, topEdge, sternEnd, midY);
  ctx.quadraticCurveTo(sternEnd, botEdge, sternStart, botEdge);
  ctx.lineTo(bowBase,   botEdge);
  ctx.closePath();
  ctx.fillStyle = opts.fill || '#0a1520';
  ctx.fill();

  // hull outer bevel — lighter top/left edges (top-down light)
  ctx.fillStyle = 'rgba(78,227,227,0.07)';
  ctx.beginPath();
  ctx.moveTo(bowTip,   midY);
  ctx.lineTo(bowBase,  topEdge);
  ctx.lineTo(sternStart, topEdge);
  ctx.quadraticCurveTo(sternEnd, topEdge, sternEnd, midY);
  ctx.lineTo(sternEnd - 6, midY);
  ctx.quadraticCurveTo(sternEnd - 6, topEdge + 6, sternStart - 4, topEdge + 6);
  ctx.lineTo(bowBase + 4, topEdge + 6);
  ctx.lineTo(bowTip + 8, midY);
  ctx.closePath();
  ctx.fill();

  // ── hull outline ────────────────────────────────────────────────
  ctx.beginPath();
  ctx.moveTo(bowTip,    midY);
  ctx.lineTo(bowBase,   topEdge);
  ctx.lineTo(sternStart, topEdge);
  ctx.quadraticCurveTo(sternEnd, topEdge, sternEnd, midY);
  ctx.quadraticCurveTo(sternEnd, botEdge, sternStart, botEdge);
  ctx.lineTo(bowBase,   botEdge);
  ctx.closePath();
  ctx.strokeStyle = opts.stroke || 'rgba(78,227,227,0.7)';
  ctx.lineWidth = opts.lineWidth || 2.5;
  ctx.stroke();

  // ── deck planking — horizontal wood lines ───────────────────────
  const deckInset = w * 0.05;
  ctx.fillStyle = 'rgba(255,255,255,0.035)';
  const plankCount = Math.floor(h * 0.55);
  for (let i = 1; i < plankCount; i++) {
    const ry = topEdge + 4 + (i / plankCount) * (h * 0.84 - 8);
    if (ry < topEdge + 4 || ry > botEdge - 4) continue;
    ctx.fillRect(bowBase + deckInset, ry, sternStart - bowBase - deckInset * 2, 1);
  }

  // ── center keel line ────────────────────────────────────────────
  ctx.fillStyle = 'rgba(78,227,227,0.12)';
  ctx.fillRect(bowBase + 4, midY - 1, sternStart - bowBase - 8, 2);

  // ── bow railing ──────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(78,227,227,0.22)';
  // top railing along the port side
  ctx.fillRect(bowBase, topEdge, sternStart - bowBase, 2);
  // bottom railing along the starboard side
  ctx.fillRect(bowBase, botEdge - 2, sternStart - bowBase, 2);
  // bow cross-rail
  ctx.fillRect(bowBase - 2, topEdge + 2, 4, h * 0.84 - 4);

  // ── structural bulkheads (vertical dividers) ─────────────────────
  const sections = [0.28, 0.50, 0.70, 0.85];
  ctx.fillStyle = 'rgba(78,227,227,0.18)';
  for (const frac of sections) {
    const bx = x + w * frac;
    ctx.fillRect(bx, topEdge + 2, 2, h * 0.84 - 4);
  }

  // ── mast / chimney stack ─────────────────────────────────────────
  const mastX = x + w * 0.42;
  // mast base (top-down circle)
  ctx.fillStyle = '#1a2a3a';
  ctx.beginPath();
  ctx.arc(mastX, midY, Math.max(6, h * 0.07), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(78,227,227,0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // mast top highlight
  ctx.fillStyle = 'rgba(215,235,255,0.35)';
  ctx.beginPath();
  ctx.arc(mastX - 1.5, midY - 1.5, Math.max(2.5, h * 0.028), 0, Math.PI * 2);
  ctx.fill();

  // rigging lines (top-down view looks like spokes from mast)
  ctx.strokeStyle = 'rgba(200,220,240,0.1)';
  ctx.lineWidth = 1;
  const riggingPts = [
    [bowTip + 8,    midY],
    [bowBase,       topEdge + 4],
    [bowBase,       botEdge - 4],
    [sternStart,    topEdge + 4],
    [sternStart,    botEdge - 4],
  ];
  for (const [rx, ry] of riggingPts) {
    ctx.beginPath(); ctx.moveTo(mastX, midY); ctx.lineTo(rx, ry); ctx.stroke();
  }

  // ── anchor / bow cleat ───────────────────────────────────────────
  ctx.fillStyle = 'rgba(78,227,227,0.35)';
  ctx.fillRect(bowBase + 6, midY - 4, 8, 8);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(bowBase + 8, midY - 2, 4, 4);

  // ── stern propeller indicator ────────────────────────────────────
  ctx.fillStyle = 'rgba(78,227,227,0.2)';
  ctx.beginPath();
  ctx.arc(sternEnd - 10, midY, Math.max(5, h * 0.055), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(78,227,227,0.45)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();
}

// ── ship interior — compartment renderer ─────────────────────────────

function _siPx(v) { return Math.round(v); }

// Pixel-art rect with top-left highlight and bottom-right shadow
function _siRoom(ctx, x, y, w, h, fill, lit = 1) {
  const rx = _siPx(x), ry = _siPx(y), rw = _siPx(w), rh = _siPx(h);
  // base fill — darken by lighting
  ctx.globalAlpha = 1;
  ctx.fillStyle = fill;
  ctx.fillRect(rx, ry, rw, rh);
  // lighting overlay
  if (lit < 1) {
    ctx.fillStyle = `rgba(0,0,0,${(1 - lit) * 0.55})`;
    ctx.fillRect(rx, ry, rw, rh);
  }
  // inner top-left highlight (ambient light from above)
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(rx, ry, rw, 2);
  ctx.fillRect(rx, ry, 2, rh);
  // inner bottom-right shadow
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(rx, ry + rh - 2, rw, 2);
  ctx.fillRect(rx + rw - 2, ry, 2, rh);
}

// Pixel-art wall/border
function _siWall(ctx, x, y, w, h, col) {
  ctx.fillStyle = col;
  ctx.fillRect(_siPx(x), _siPx(y), _siPx(w), _siPx(h));
}

// Pixel-art horizontal floor plank line
function _siPlank(ctx, x, y, w, col) {
  ctx.fillStyle = col;
  ctx.fillRect(_siPx(x), _siPx(y), _siPx(w), 1);
}

// Draw a simple door opening in a wall
function _siDoor(ctx, x, y, w, h, col, open, locked) {
  const dc = locked ? '#ff4060' : open ? '#5ef0a0' : '#f5c842';
  ctx.fillStyle = col; // wall patch behind door
  ctx.fillRect(_siPx(x), _siPx(y), _siPx(w), _siPx(h));
  // door frame
  ctx.fillStyle = dc;
  ctx.fillRect(_siPx(x), _siPx(y), 2, _siPx(h));
  ctx.fillRect(_siPx(x + w - 2), _siPx(y), 2, _siPx(h));
  ctx.fillRect(_siPx(x), _siPx(y), _siPx(w), 2);
  if (!open) {
    // door panel
    ctx.fillStyle = '#1a2a3a';
    ctx.fillRect(_siPx(x + 2), _siPx(y + 2), _siPx(w - 4), _siPx(h - 2));
    // handle
    ctx.fillStyle = dc;
    ctx.fillRect(_siPx(x + w * 0.6), _siPx(y + h * 0.38), 3, 5);
  }
}

// Draw pixel-art ladder/stair between decks
function _siLadder(ctx, x, y, h, col) {
  // two rails
  ctx.fillStyle = col;
  ctx.fillRect(_siPx(x),     _siPx(y), 2, _siPx(h));
  ctx.fillRect(_siPx(x + 8), _siPx(y), 2, _siPx(h));
  // rungs every 6px
  for (let ry = 0; ry < h; ry += 6) {
    ctx.fillRect(_siPx(x), _siPx(y + ry), 10, 2);
  }
}

// Pixel-art window with interior light glow
function _siWindow(ctx, x, y, w, h, now, lit) {
  const glow = 0.3 + Math.abs(Math.sin(now / 2800)) * 0.12;
  ctx.fillStyle = lit > 0.5 ? `rgba(245,220,120,${glow})` : 'rgba(30,50,70,0.8)';
  ctx.fillRect(_siPx(x), _siPx(y), _siPx(w), _siPx(h));
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(_siPx(x), _siPx(y), _siPx(w), 2);
  ctx.fillRect(_siPx(x), _siPx(y), 1, _siPx(h));
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(_siPx(x + w - 1), _siPx(y), 1, _siPx(h));
  ctx.fillRect(_siPx(x), _siPx(y + h - 1), _siPx(w), 1);
}

// Pixel-art rivet row along a surface
function _siRivets(ctx, x, y, w, col, step = 18) {
  ctx.fillStyle = col;
  for (let rx = x + step / 2; rx < x + w; rx += step) {
    ctx.fillRect(_siPx(rx), _siPx(y), 2, 2);
  }
}

// ─────────────────────────────────────────────────────────────────────
//  FURNITURE DRAWERS — one function per compartment role
// ─────────────────────────────────────────────────────────────────────

// Upper-left: timón (helm/wheelhouse)
function _fHelm(ctx, x, y, w, h, now) {
  // wooden floor tones
  ctx.fillStyle = '#3a2810';
  ctx.fillRect(_siPx(x + 4), _siPx(y + h - 10), _siPx(w - 8), 6);
  // helm wheel (big steering wheel — centered)
  const wx = x + w * 0.5, wy = y + h * 0.46;
  const r = Math.min(w, h) * 0.2;
  const angle = now / 3000;
  // outer ring
  ctx.strokeStyle = '#8a6028';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(_siPx(wx), _siPx(wy), _siPx(r), 0, Math.PI * 2);
  ctx.stroke();
  // hub
  ctx.fillStyle = '#5a3810';
  ctx.beginPath();
  ctx.arc(_siPx(wx), _siPx(wy), _siPx(r * 0.22), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f5c842';
  ctx.beginPath();
  ctx.arc(_siPx(wx), _siPx(wy), _siPx(r * 0.1), 0, Math.PI * 2);
  ctx.fill();
  // 8 spokes
  ctx.strokeStyle = '#6a4018';
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const a = angle + (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(_siPx(wx + Math.cos(a) * r * 0.22), _siPx(wy + Math.sin(a) * r * 0.22));
    ctx.lineTo(_siPx(wx + Math.cos(a) * r * 0.9), _siPx(wy + Math.sin(a) * r * 0.9));
    ctx.stroke();
    // handle nubs
    ctx.fillStyle = '#8a6028';
    ctx.fillRect(_siPx(wx + Math.cos(a) * r * 0.88 - 1), _siPx(wy + Math.sin(a) * r * 0.88 - 1), 4, 4);
  }
  // compass / instrument panel below wheel
  ctx.fillStyle = '#1a2030';
  ctx.fillRect(_siPx(x + w * 0.22), _siPx(y + h * 0.7), _siPx(w * 0.56), _siPx(h * 0.16));
  ctx.fillStyle = '#4ee3e3';
  ctx.fillRect(_siPx(x + w * 0.22), _siPx(y + h * 0.7), _siPx(w * 0.56), 2);
  // gauge blips
  for (let gi = 0; gi < 4; gi++) {
    ctx.fillStyle = gi === 1 ? '#5ef0a0' : '#4ee3e3';
    ctx.fillRect(_siPx(x + w * 0.27 + gi * w * 0.12), _siPx(y + h * 0.74), 6, 5);
  }
  // porthole window top-right
  _siWindow(ctx, x + w - 18, y + 8, 12, 10, now, 1);
}

// Upper-mid: bridge / parte alta (operations center with tech panels)
function _fBridge(ctx, x, y, w, h, now) {
  // back wall panels — multiple screens
  const panels = 3;
  const pw = (w - 12) / panels;
  for (let i = 0; i < panels; i++) {
    const px = x + 6 + i * pw;
    ctx.fillStyle = '#0a1422';
    ctx.fillRect(_siPx(px), _siPx(y + 6), _siPx(pw - 4), _siPx(h * 0.38));
    // screen glow
    const glowCol = ['#4ee3e3','#5ef0a0','#f5c842'][i];
    ctx.fillStyle = `rgba(${_siHex2rgb(glowCol)},0.18)`;
    ctx.fillRect(_siPx(px + 1), _siPx(y + 7), _siPx(pw - 6), _siPx(h * 0.35));
    // scanline on screen
    ctx.fillStyle = `rgba(${_siHex2rgb(glowCol)},0.35)`;
    for (let line = 0; line < h * 0.35; line += 4) {
      ctx.fillRect(_siPx(px + 2), _siPx(y + 8 + line), _siPx(pw - 8), 1);
    }
    // data blips — animated
    const blip = Math.sin(now / 400 + i * 2.1);
    ctx.fillStyle = glowCol;
    ctx.fillRect(_siPx(px + 4), _siPx(y + 7 + (h * 0.33) * (0.5 + blip * 0.35)), _siPx(pw - 10), 2);
  }
  // central console / table
  ctx.fillStyle = '#1a2a3a';
  ctx.fillRect(_siPx(x + w * 0.2), _siPx(y + h * 0.56), _siPx(w * 0.6), _siPx(h * 0.22));
  ctx.fillStyle = '#4ee3e3';
  ctx.fillRect(_siPx(x + w * 0.2), _siPx(y + h * 0.56), _siPx(w * 0.6), 2);
  // blinking indicator light
  const blink = Math.sin(now / 300) > 0.5;
  ctx.fillStyle = blink ? '#5ef0a0' : '#0d1e10';
  ctx.fillRect(_siPx(x + w * 0.5 - 3), _siPx(y + h * 0.6), 6, 6);
  // chair
  ctx.fillStyle = '#2a1a0a';
  ctx.fillRect(_siPx(x + w * 0.42), _siPx(y + h * 0.76), _siPx(w * 0.16), _siPx(h * 0.18));
  ctx.fillStyle = '#3a2a1a';
  ctx.fillRect(_siPx(x + w * 0.38), _siPx(y + h * 0.68), _siPx(w * 0.24), _siPx(h * 0.1));
  // porthole
  _siWindow(ctx, x + 6, y + 8, 12, 10, now, 1);
  _siWindow(ctx, x + w - 18, y + 8, 12, 10, now, 1);
}

// Upper-right: vigía (lookout dome / crow's nest)
function _fLookout(ctx, x, y, w, h, now) {
  // dome ceiling arc (rounded top)
  ctx.fillStyle = '#162030';
  ctx.beginPath();
  ctx.arc(_siPx(x + w / 2), _siPx(y + h * 0.55), _siPx(Math.min(w, h) * 0.42), Math.PI, 0);
  ctx.fill();
  ctx.strokeStyle = 'rgba(78,227,227,0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(_siPx(x + w / 2), _siPx(y + h * 0.55), _siPx(Math.min(w, h) * 0.42), Math.PI, 0);
  ctx.stroke();
  // big circular viewport window
  const glow = 0.18 + Math.abs(Math.sin(now / 2500)) * 0.12;
  ctx.fillStyle = `rgba(245,220,120,${glow})`;
  ctx.beginPath();
  ctx.arc(_siPx(x + w / 2), _siPx(y + h * 0.38), _siPx(Math.min(w, h) * 0.25), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#4a6a8a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(_siPx(x + w / 2), _siPx(y + h * 0.38), _siPx(Math.min(w, h) * 0.25), 0, Math.PI * 2);
  ctx.stroke();
  // cross divider on viewport
  ctx.strokeStyle = '#4a6a8a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(_siPx(x + w / 2 - Math.min(w, h) * 0.25), _siPx(y + h * 0.38));
  ctx.lineTo(_siPx(x + w / 2 + Math.min(w, h) * 0.25), _siPx(y + h * 0.38));
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(_siPx(x + w / 2), _siPx(y + h * 0.38 - Math.min(w, h) * 0.25));
  ctx.lineTo(_siPx(x + w / 2), _siPx(y + h * 0.38 + Math.min(w, h) * 0.25));
  ctx.stroke();
  // telescope
  ctx.fillStyle = '#3a5068';
  ctx.fillRect(_siPx(x + w * 0.52), _siPx(y + h * 0.44), _siPx(w * 0.32), 5);
  ctx.fillStyle = '#5a8aaa';
  ctx.fillRect(_siPx(x + w * 0.72), _siPx(y + h * 0.42), _siPx(w * 0.12), 9);
  // floor platform
  ctx.fillStyle = '#1e3040';
  ctx.fillRect(_siPx(x + 4), _siPx(y + h - 14), _siPx(w - 8), 10);
  // EXIT sign top-right corner
  ctx.fillStyle = '#ff4060';
  ctx.fillRect(_siPx(x + w - 22), _siPx(y + 4), 18, 8);
  ctx.fillStyle = '#ffffff';
  ctx.font = '5px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('EXIT', _siPx(x + w - 21), _siPx(y + 10));
}

// Middle-left: comedor (mess hall / dining)
function _fMess(ctx, x, y, w, h, now) {
  // floor — warm wood tone
  ctx.fillStyle = '#2a1a0a';
  ctx.fillRect(_siPx(x + 2), _siPx(y + h - 12), _siPx(w - 4), 8);
  _siPlank(ctx, x + 4, y + h - 4, w - 8, '#3a2614');
  // long dining table
  const tw = w * 0.64, th2 = h * 0.15;
  const tx = x + w * 0.15, ty = y + h * 0.44;
  ctx.fillStyle = '#5a3810';
  ctx.fillRect(_siPx(tx), _siPx(ty), _siPx(tw), _siPx(th2));
  ctx.fillStyle = '#7a5020';
  ctx.fillRect(_siPx(tx), _siPx(ty), _siPx(tw), 3);
  // table legs
  ctx.fillStyle = '#3a2410';
  ctx.fillRect(_siPx(tx + 4), _siPx(ty + th2), 4, _siPx(h * 0.1));
  ctx.fillRect(_siPx(tx + tw - 8), _siPx(ty + th2), 4, _siPx(h * 0.1));
  // bowls/plates on table
  for (let bi = 0; bi < 3; bi++) {
    ctx.fillStyle = '#c8a870';
    ctx.beginPath();
    ctx.ellipse(_siPx(tx + tw * (0.18 + bi * 0.3)), _siPx(ty + th2 * 0.45), 5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = bi === 1 ? P.mint : '#e85c8a';
    ctx.beginPath();
    ctx.ellipse(_siPx(tx + tw * (0.18 + bi * 0.3)), _siPx(ty + th2 * 0.4), 3, 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // stools either side
  for (let si = 0; si < 3; si++) {
    ctx.fillStyle = '#4a2a10';
    ctx.fillRect(_siPx(tx + tw * (0.12 + si * 0.3)), _siPx(ty - h * 0.14), _siPx(w * 0.08), _siPx(h * 0.12));
  }
  // cabinet on back wall
  ctx.fillStyle = '#3a2010';
  ctx.fillRect(_siPx(x + 5), _siPx(y + 8), _siPx(w * 0.24), _siPx(h * 0.34));
  ctx.fillStyle = '#c8a870';
  ctx.fillRect(_siPx(x + 5), _siPx(y + 8), _siPx(w * 0.24), 3);
  // cabinet doors
  ctx.fillStyle = '#5a3810';
  ctx.fillRect(_siPx(x + 7), _siPx(y + 13), _siPx(w * 0.1), _siPx(h * 0.26));
  ctx.fillRect(_siPx(x + w * 0.16), _siPx(y + 13), _siPx(w * 0.1), _siPx(h * 0.26));
  ctx.fillStyle = '#c8a870';
  ctx.fillRect(_siPx(x + w * 0.12), _siPx(y + h * 0.21), 3, 6);
  ctx.fillRect(_siPx(x + w * 0.22), _siPx(y + h * 0.21), 3, 6);
  // hanging lamp — animated sway
  const sway = Math.sin(now / 1800) * 3;
  ctx.fillStyle = '#f5c842';
  ctx.fillRect(_siPx(x + w / 2 + sway - 5), _siPx(y + 4), 10, 7);
  ctx.fillStyle = `rgba(245,200,66,${0.15 + Math.sin(now / 900) * 0.05})`;
  ctx.beginPath();
  ctx.ellipse(_siPx(x + w / 2 + sway), _siPx(y + 14), 18, 10, 0, 0, Math.PI * 2);
  ctx.fill();
}

// Middle-center: pasillo (corridor hub)
function _fHall(ctx, x, y, w, h, now) {
  // corridor floor — tile pattern
  const tileS = Math.max(6, Math.floor(w / 6));
  for (let col = 0; col < Math.ceil(w / tileS); col++) {
    for (let row = 0; row < Math.ceil(h / tileS); row++) {
      ctx.fillStyle = (col + row) % 2 === 0 ? '#1a2a3a' : '#162030';
      ctx.fillRect(_siPx(x + col * tileS), _siPx(y + row * tileS), tileS - 1, tileS - 1);
    }
  }
  // glowing hatch/center module (the round reactor from the image)
  const hx = x + w * 0.5, hy = y + h * 0.5;
  const hr = Math.min(w, h) * 0.22;
  const pulse = 0.4 + Math.abs(Math.sin(now / 600)) * 0.3;
  ctx.fillStyle = `rgba(78,227,227,${pulse * 0.25})`;
  ctx.beginPath();
  ctx.arc(_siPx(hx), _siPx(hy), _siPx(hr * 1.4), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0a1e2e';
  ctx.beginPath();
  ctx.arc(_siPx(hx), _siPx(hy), _siPx(hr), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(78,227,227,${pulse * 0.9})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(_siPx(hx), _siPx(hy), _siPx(hr), 0, Math.PI * 2);
  ctx.stroke();
  // inner hex ring detail
  ctx.strokeStyle = `rgba(78,227,227,${pulse * 0.5})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(_siPx(hx), _siPx(hy), _siPx(hr * 0.6), 0, Math.PI * 2);
  ctx.stroke();
  // rotating ring segments
  const ra = now / 2000;
  for (let i = 0; i < 6; i++) {
    const a = ra + (i / 6) * Math.PI * 2;
    ctx.fillStyle = `rgba(78,227,227,${pulse * 0.7})`;
    ctx.fillRect(
      _siPx(hx + Math.cos(a) * hr * 0.78 - 2),
      _siPx(hy + Math.sin(a) * hr * 0.78 - 2),
      4, 4
    );
  }
  // center dot
  ctx.fillStyle = P.accent;
  ctx.fillRect(_siPx(hx - 3), _siPx(hy - 3), 6, 6);
}

// Middle-right: enfermería (infirmary / medical bay)
function _fInfirmary(ctx, x, y, w, h, now) {
  // clinical white-ish floor
  ctx.fillStyle = '#1a2a2a';
  ctx.fillRect(_siPx(x + 2), _siPx(y + h - 10), _siPx(w - 4), 6);
  // medical beds (2 side by side)
  const bedW = w * 0.3, bedH = h * 0.22;
  const beds = [x + w * 0.08, x + w * 0.44];
  for (const bx of beds) {
    ctx.fillStyle = '#1a3040';
    ctx.fillRect(_siPx(bx), _siPx(y + h * 0.56), _siPx(bedW), _siPx(bedH));
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(_siPx(bx), _siPx(y + h * 0.56), _siPx(bedW), 2);
    ctx.fillRect(_siPx(bx), _siPx(y + h * 0.56), 2, _siPx(bedH));
    // pillow
    ctx.fillStyle = '#dff3ff';
    ctx.fillRect(_siPx(bx + 3), _siPx(y + h * 0.58), _siPx(bedW * 0.38), _siPx(bedH * 0.5));
    // bed frame legs
    ctx.fillStyle = '#2a3a4a';
    ctx.fillRect(_siPx(bx + 2), _siPx(y + h * 0.78), 4, _siPx(h * 0.1));
    ctx.fillRect(_siPx(bx + bedW - 6), _siPx(y + h * 0.78), 4, _siPx(h * 0.1));
  }
  // IV drip stand (right bed)
  ctx.fillStyle = '#4a6a8a';
  ctx.fillRect(_siPx(x + w * 0.76), _siPx(y + h * 0.34), 2, _siPx(h * 0.44));
  ctx.fillStyle = '#aabcd8';
  ctx.fillRect(_siPx(x + w * 0.73), _siPx(y + h * 0.34), 8, 2);
  // IV bag
  ctx.fillStyle = '#5ef0a0';
  ctx.fillRect(_siPx(x + w * 0.74), _siPx(y + h * 0.2), 6, 10);
  const drip = Math.sin(now / 200) > 0 ? 1 : 0;
  ctx.fillStyle = `rgba(94,240,160,${drip * 0.8})`;
  ctx.fillRect(_siPx(x + w * 0.762), _siPx(y + h * 0.3), 1, 4);
  // medical cabinet — back wall
  ctx.fillStyle = '#1a2e2e';
  ctx.fillRect(_siPx(x + 5), _siPx(y + 8), _siPx(w * 0.26), _siPx(h * 0.4));
  ctx.fillStyle = '#5ef0a0';
  ctx.fillRect(_siPx(x + 5), _siPx(y + 8), _siPx(w * 0.26), 2);
  // cross icon
  ctx.fillStyle = '#5ef0a0';
  ctx.fillRect(_siPx(x + w * 0.13), _siPx(y + h * 0.16), 3, 9);
  ctx.fillRect(_siPx(x + w * 0.11), _siPx(y + h * 0.19), 9, 3);
  // monitor screens
  ctx.fillStyle = '#0a1a1a';
  ctx.fillRect(_siPx(x + w * 0.82), _siPx(y + 10), _siPx(w * 0.16), _siPx(h * 0.3));
  const ecg = now / 400;
  ctx.strokeStyle = '#5ef0a0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let ex = 0; ex < w * 0.14; ex += 2) {
    const ey = Math.sin(ecg + ex * 0.4) * (h * 0.06);
    if (ex === 0) ctx.moveTo(_siPx(x + w * 0.83 + ex), _siPx(y + h * 0.22 + ey));
    else ctx.lineTo(_siPx(x + w * 0.83 + ex), _siPx(y + h * 0.22 + ey));
  }
  ctx.stroke();
  // porthole
  _siWindow(ctx, x + w - 18, y + 8, 12, 10, now, 0.9);
}

// Lower-left: parte baja (boiler/engine room)
function _fBoiler(ctx, x, y, w, h, now) {
  // hot floor — metal grating
  ctx.fillStyle = '#1a1208';
  ctx.fillRect(_siPx(x + 2), _siPx(y + h - 10), _siPx(w - 4), 8);
  const grate = 6;
  ctx.fillStyle = '#2a1a08';
  for (let gx = 0; gx < w - 4; gx += grate) {
    ctx.fillRect(_siPx(x + 2 + gx), _siPx(y + h - 10), 1, 8);
    ctx.fillRect(_siPx(x + 2), _siPx(y + h - 10 + gx % 8), w - 4, 1);
  }
  // boiler cylinder (main)
  const bx = x + w * 0.18, by = y + h * 0.18;
  const bw = w * 0.36, bh = h * 0.6;
  ctx.fillStyle = '#2a1a08';
  ctx.fillRect(_siPx(bx), _siPx(by), _siPx(bw), _siPx(bh));
  ctx.fillStyle = '#3a2810';
  ctx.fillRect(_siPx(bx), _siPx(by), _siPx(bw), 4);
  ctx.fillRect(_siPx(bx), _siPx(by), 4, _siPx(bh));
  // boiler pressure ring
  ctx.strokeStyle = '#f5c842';
  ctx.lineWidth = 2;
  ctx.strokeRect(_siPx(bx + 4), _siPx(by + bh * 0.15), _siPx(bw - 8), _siPx(bh * 0.7));
  // fire window on boiler — animated orange glow
  const fGlow = 0.35 + Math.abs(Math.sin(now / 180 + 0.5)) * 0.35;
  ctx.fillStyle = `rgba(255,140,30,${fGlow})`;
  ctx.fillRect(_siPx(bx + bw * 0.25), _siPx(by + bh * 0.55), _siPx(bw * 0.5), _siPx(bh * 0.28));
  ctx.fillStyle = `rgba(255,220,60,${fGlow * 0.6})`;
  ctx.fillRect(_siPx(bx + bw * 0.35), _siPx(by + bh * 0.6), _siPx(bw * 0.3), _siPx(bh * 0.14));
  // heat shimmer dots
  for (let hi = 0; hi < 3; hi++) {
    const ht = Math.abs(Math.sin(now / 80 + hi * 1.2));
    ctx.fillStyle = `rgba(255,160,40,${ht * 0.5})`;
    ctx.fillRect(_siPx(bx + bw * (0.3 + hi * 0.15)), _siPx(by + bh * (0.3 - ht * 0.3)), 2, 4);
  }
  // pressure gauges
  const gauges = [x + w * 0.62, x + w * 0.76];
  for (const gaugex of gauges) {
    ctx.fillStyle = '#1a1208';
    ctx.beginPath();
    ctx.arc(_siPx(gaugex), _siPx(y + h * 0.36), 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f5c842';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // needle
    const na = -2.2 + Math.abs(Math.sin(now / 1500 + gaugex)) * 1.6;
    ctx.strokeStyle = '#ff6030';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(_siPx(gaugex), _siPx(y + h * 0.36));
    ctx.lineTo(_siPx(gaugex + Math.cos(na) * 6), _siPx(y + h * 0.36 + Math.sin(na) * 6));
    ctx.stroke();
  }
  // pipes going up
  ctx.fillStyle = '#3a2810';
  ctx.fillRect(_siPx(x + w * 0.28), _siPx(y), 6, _siPx(h * 0.22));
  ctx.fillRect(_siPx(x + w * 0.42), _siPx(y), 5, _siPx(h * 0.22));
  ctx.fillStyle = '#f5c842';
  ctx.fillRect(_siPx(x + w * 0.28), _siPx(y + h * 0.2), 6, 3);
  ctx.fillRect(_siPx(x + w * 0.42), _siPx(y + h * 0.2), 5, 3);
  // steam particles
  for (let sp = 0; sp < 3; sp++) {
    const st = (now / 200 + sp * 1.3) % 3;
    const sa = 0.6 - st * 0.2;
    if (sa > 0) {
      ctx.fillStyle = `rgba(200,200,220,${sa * 0.4})`;
      ctx.fillRect(_siPx(x + w * (0.29 + sp * 0.06) + Math.sin(now / 300 + sp) * 2), _siPx(y - st * 6), 3, 4);
    }
  }
}

// Lower-center: bodega (cargo hold)
function _fCargo(ctx, x, y, w, h, now) {
  // dark hold floor
  ctx.fillStyle = '#12181e';
  ctx.fillRect(_siPx(x + 2), _siPx(y + h - 10), _siPx(w - 4), 8);
  // crates — various sizes stacked
  const crates = [
    { cx: x + w * 0.06, cy: y + h * 0.52, cw: w * 0.15, ch: h * 0.2 },
    { cx: x + w * 0.22, cy: y + h * 0.52, cw: w * 0.15, ch: h * 0.2 },
    { cx: x + w * 0.06, cy: y + h * 0.32, cw: w * 0.31, ch: h * 0.2 },
    { cx: x + w * 0.42, cy: y + h * 0.6,  cw: w * 0.12, ch: h * 0.14 },
    { cx: x + w * 0.55, cy: y + h * 0.6,  cw: w * 0.12, ch: h * 0.14 },
    { cx: x + w * 0.42, cy: y + h * 0.46, cw: w * 0.25, ch: h * 0.14 },
    { cx: x + w * 0.70, cy: y + h * 0.5,  cw: w * 0.14, ch: h * 0.24 },
    { cx: x + w * 0.85, cy: y + h * 0.54, cw: w * 0.1,  ch: h * 0.2 },
  ];
  for (const cr of crates) {
    // crate body
    ctx.fillStyle = '#5a3a18';
    ctx.fillRect(_siPx(cr.cx), _siPx(cr.cy), _siPx(cr.cw), _siPx(cr.ch));
    // top highlight
    ctx.fillStyle = '#7a5228';
    ctx.fillRect(_siPx(cr.cx), _siPx(cr.cy), _siPx(cr.cw), 3);
    ctx.fillRect(_siPx(cr.cx), _siPx(cr.cy), 3, _siPx(cr.ch));
    // shadow
    ctx.fillStyle = '#2a1a08';
    ctx.fillRect(_siPx(cr.cx + cr.cw - 3), _siPx(cr.cy), 3, _siPx(cr.ch));
    ctx.fillRect(_siPx(cr.cx), _siPx(cr.cy + cr.ch - 3), _siPx(cr.cw), 3);
    // cross brace
    ctx.fillStyle = '#3a2010';
    ctx.fillRect(_siPx(cr.cx + cr.cw * 0.45), _siPx(cr.cy + 3), 3, _siPx(cr.ch - 6));
    ctx.fillRect(_siPx(cr.cx + 3), _siPx(cr.cy + cr.ch * 0.45), _siPx(cr.cw - 6), 3);
  }
  // barrel row back-right
  for (let bi = 0; bi < 2; bi++) {
    const brx = x + w * (0.68 + bi * 0.12), bry = y + h * 0.2;
    ctx.fillStyle = '#2a3a4a';
    ctx.beginPath();
    ctx.ellipse(_siPx(brx), _siPx(bry + h * 0.12), _siPx(w * 0.05), _siPx(h * 0.15), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4a5a6a';
    ctx.lineWidth = 1;
    ctx.stroke();
    // barrel rings
    ctx.strokeStyle = '#5a7a9a';
    ctx.beginPath();
    ctx.ellipse(_siPx(brx), _siPx(bry + h * 0.06), _siPx(w * 0.05), _siPx(h * 0.04), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(_siPx(brx), _siPx(bry + h * 0.19), _siPx(w * 0.05), _siPx(h * 0.04), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // ceiling beam hook
  ctx.fillStyle = '#3a4555';
  ctx.fillRect(_siPx(x + w * 0.38), _siPx(y + 2), 5, _siPx(h * 0.12));
  ctx.fillRect(_siPx(x + w * 0.36), _siPx(y + h * 0.12), 10, 3);
  // inventory label
  _siWindow(ctx, x + w - 16, y + h * 0.08, 10, 8, now, 0.4);
}

// Lower right-center: brig (prison cells)
function _fBrig(ctx, x, y, w, h, now) {
  // dark cell walls
  ctx.fillStyle = '#1a0a0a';
  ctx.fillRect(_siPx(x + 2), _siPx(y + 2), _siPx(w - 4), _siPx(h - 4));
  // cell divider wall center
  const midX = x + w * 0.5;
  ctx.fillStyle = '#2a1010';
  ctx.fillRect(_siPx(midX - 2), _siPx(y + 6), 4, _siPx(h - 10));
  // bars — left cell
  ctx.fillStyle = '#3a4555';
  for (let bi = 0; bi < 5; bi++) {
    ctx.fillRect(_siPx(x + w * 0.12 + bi * (w * 0.06)), _siPx(y + 6), 2, _siPx(h * 0.7));
  }
  // horizontal rail top and bottom bars
  ctx.fillStyle = '#3a4555';
  ctx.fillRect(_siPx(x + w * 0.08), _siPx(y + 6), _siPx(w * 0.38), 2);
  ctx.fillRect(_siPx(x + w * 0.08), _siPx(y + h * 0.7), _siPx(w * 0.38), 2);
  // bars — right cell (only if wide enough)
  if (w > 40) {
    for (let bi = 0; bi < 4; bi++) {
      ctx.fillRect(_siPx(midX + w * 0.06 + bi * (w * 0.06)), _siPx(y + 6), 2, _siPx(h * 0.7));
    }
    ctx.fillRect(_siPx(midX + w * 0.04), _siPx(y + 6), _siPx(w * 0.42), 2);
    ctx.fillRect(_siPx(midX + w * 0.04), _siPx(y + h * 0.7), _siPx(w * 0.42), 2);
  }
  // bunk bed left cell
  ctx.fillStyle = '#3a2010';
  ctx.fillRect(_siPx(x + w * 0.1), _siPx(y + h * 0.32), _siPx(w * 0.3), _siPx(h * 0.1));
  ctx.fillRect(_siPx(x + w * 0.1), _siPx(y + h * 0.54), _siPx(w * 0.3), _siPx(h * 0.1));
  // lock icon
  const lockBlink = Math.sin(now / 800) > 0.4;
  ctx.fillStyle = lockBlink ? P.rose : '#3a1010';
  ctx.fillRect(_siPx(x + w * 0.44), _siPx(y + h * 0.38), 6, 8);
  ctx.fillStyle = '#1a0808';
  ctx.beginPath();
  ctx.arc(_siPx(x + w * 0.44 + 3), _siPx(y + h * 0.38), 3, Math.PI, 0);
  ctx.fill();
}

// Lower far-right: salida (airlock / exit)
function _fAirlock(ctx, x, y, w, h, now) {
  // airlock frame — industrial thick walls
  ctx.fillStyle = '#0e1820';
  ctx.fillRect(_siPx(x + 2), _siPx(y + 2), _siPx(w - 4), _siPx(h - 4));
  // outer airlock door (sealed)
  const doorH = h * 0.7;
  const doorY = y + (h - doorH) / 2;
  ctx.fillStyle = '#1a2a3a';
  ctx.fillRect(_siPx(x + w * 0.08), _siPx(doorY), _siPx(w * 0.4), _siPx(doorH));
  // door bolts
  ctx.fillStyle = '#4a6a8a';
  ctx.fillRect(_siPx(x + w * 0.08), _siPx(doorY), _siPx(w * 0.4), 4);
  ctx.fillRect(_siPx(x + w * 0.08), _siPx(doorY + doorH - 4), _siPx(w * 0.4), 4);
  _siRivets(ctx, x + w * 0.08, doorY + 1, w * 0.4, '#5a8aaa', 12);
  // WARNING stripes on door frame
  const stripe = 8;
  for (let si = 0; si < Math.ceil(doorH / stripe); si++) {
    ctx.fillStyle = si % 2 === 0 ? 'rgba(255,155,87,0.5)' : 'rgba(0,0,0,0.3)';
    ctx.fillRect(_siPx(x + w * 0.06), _siPx(doorY + si * stripe), _siPx(w * 0.02), stripe);
    ctx.fillRect(_siPx(x + w * 0.48), _siPx(doorY + si * stripe), _siPx(w * 0.02), stripe);
  }
  // pressure gauge / lock control panel
  ctx.fillStyle = '#0a1422';
  ctx.fillRect(_siPx(x + w * 0.55), _siPx(y + h * 0.22), _siPx(w * 0.36), _siPx(h * 0.5));
  ctx.fillStyle = '#4ee3e3';
  ctx.fillRect(_siPx(x + w * 0.55), _siPx(y + h * 0.22), _siPx(w * 0.36), 2);
  // red sealed indicator
  const sealed = true;
  ctx.fillStyle = sealed ? P.danger : P.mint;
  ctx.fillRect(_siPx(x + w * 0.6), _siPx(y + h * 0.3), 8, 8);
  // EXIT label
  ctx.fillStyle = P.danger;
  ctx.fillRect(_siPx(x + w * 0.56), _siPx(y + h * 0.46), _siPx(w * 0.32), 10);
  ctx.fillStyle = '#ffffff';
  ctx.font = `5px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText('SALIDA', _siPx(x + w * 0.72), _siPx(y + h * 0.54));
  // pressurization pulse ring
  const pp = 0.3 + Math.abs(Math.sin(now / 1400)) * 0.5;
  ctx.strokeStyle = `rgba(255,64,96,${pp})`;
  ctx.lineWidth = 1;
  ctx.strokeRect(_siPx(x + w * 0.08 - 3), _siPx(doorY - 3), _siPx(w * 0.4 + 6), _siPx(doorH + 6));
}

// ── helper: hex to rgb string for rgba() ────────────────────────────
function _siHex2rgb(hex) {
  const m = String(hex || '').match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return '78,227,227';
  return `${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)}`;
}

// ── dispatch furniture by compartment role ────────────────────────────
function _siDrawFurniture(ctx, compId, role, x, y, w, h, now) {
  ctx.save();
  // clip to room bounds to avoid spill
  ctx.beginPath();
  ctx.rect(_siPx(x + 2), _siPx(y + 2), _siPx(w - 4), _siPx(h - 4));
  ctx.clip();
  switch (compId) {
    case 'helm':      _fHelm(ctx, x, y, w, h, now);      break;
    case 'bridge':    _fBridge(ctx, x, y, w, h, now);    break;
    case 'lookout':   _fLookout(ctx, x, y, w, h, now);   break;
    case 'mess':      _fMess(ctx, x, y, w, h, now);      break;
    case 'hall':      _fHall(ctx, x, y, w, h, now);      break;
    case 'infirmary': _fInfirmary(ctx, x, y, w, h, now); break;
    case 'boiler':    _fBoiler(ctx, x, y, w, h, now);    break;
    case 'cargo':     _fCargo(ctx, x, y, w, h, now);     break;
    case 'brig':      _fBrig(ctx, x, y, w, h, now);      break;
    case 'airlock':   _fAirlock(ctx, x, y, w, h, now);   break;
    default: break;
  }
  ctx.restore();
}

// ── room fill colors by deck / role ──────────────────────────────────
const _SI_ROOM_FILL = {
  helm:      '#1a2230',
  bridge:    '#121a28',
  lookout:   '#0e1a2a',
  mess:      '#1a1208',
  hall:      '#10181e',
  infirmary: '#0e1e1e',
  boiler:    '#18100a',
  cargo:     '#101418',
  brig:      '#120808',
  airlock:   '#0a1018',
};

// ─────────────────────────────────────────────────────────────────────
//  MAIN REPLACEMENT — renderShipScene
//  Signature identical to original; state / P / clamp / helpers assumed global.
// ─────────────────────────────────────────────────────────────────────
function renderShipScene(ctx, world, params) {
  const {
    canvas, tile, zoom,
    shipBounds, viewMinX, viewMinY, viewMaxX, viewMaxY,
    shipPos, now, alpha, prevAgents, currAgents, selectedAgentId,
  } = params;

  const ship    = world.ship || {};
  const scene   = world.sot?.ship?.scene || ship.scene || null;
  const comps   = getShipCompartments(world);      // global from app_render.js
  const flooding = scene?.flooding || ship.flooding || {};
  const sounds  = scene?.sounds || [];
  const crew    = (world.agents || []).filter((ag) => isAgentOnShip(ag, world) && ag.alive !== false);
  const selected = crew.find((ag) => ag.id === selectedAgentId);
  const activeCompartment = String(
    scene?.activeCompartment || ship.scene?.activeCompartment || comps[0]?.id || 'mess'
  );

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;

  const dpr  = state.canvas?.dpr || 1;           // global state
  const logW = canvas.width  / dpr;
  const logH = canvas.height / dpr;

  // ── SPACE BG ───────────────────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, 0, logH);
  bg.addColorStop(0,   '#03060e');
  bg.addColorStop(0.5, '#06101c');
  bg.addColorStop(1,   '#020508');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, logW, logH);

  // subtle scanlines
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  for (let i = 0; i < logH; i += 4) ctx.fillRect(0, i, logW, 2);

  // ambient stars
  for (let i = 0; i < 40; i++) {
    const sx = (i * 173 + 37) % logW;
    const sy = (i * 97 + 11)  % logH;
    const sa = 0.03 + Math.abs(Math.sin(now / 1800 + i)) * 0.07;
    ctx.fillStyle = `rgba(200,230,255,${sa})`;
    ctx.fillRect(_siPx(sx), _siPx(sy), 1, 1);
  }

  // ── SHIP LAYOUT ────────────────────────────────────────────────────
  // Reserve bottom 46px for HUD; top 14px margin.
  const MARGIN_TOP  = 14;
  const MARGIN_BOT  = 48;
  const MARGIN_SIDE = 12;
  const shipAreaW   = logW - MARGIN_SIDE * 2;
  const shipAreaH   = logH - MARGIN_TOP - MARGIN_BOT;

  // Hull silhouette (cross-section view: wide ellipse-tapered shape)
  // bow = LEFT, stern = RIGHT (as per existing codebase convention)
  const hullX = MARGIN_SIDE;
  const hullY = MARGIN_TOP;
  const hullW = shipAreaW;
  const hullH = shipAreaH;

  // Bow taper: left side tapers to a point ~12% in
  const bowPct    = 0.10;
  // Stern taper: right side is flatter ~94% in
  const sternPct  = 0.94;
  const midY      = hullY + hullH / 2;
  const topEdge   = hullY + hullH * 0.06;
  const botEdge   = hullY + hullH * 0.94;
  const bowTipX   = hullX;
  const bowBaseX  = hullX + hullW * bowPct;
  const sternX    = hullX + hullW * sternPct;
  const sternEndX = hullX + hullW;

  // ── OUTER HULL SHADOW ──────────────────────────────────────────────
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.moveTo(bowTipX + 5, midY + 5);
  ctx.lineTo(bowBaseX + 5, topEdge + 5);
  ctx.lineTo(sternX + 5, topEdge + 5);
  ctx.quadraticCurveTo(sternEndX + 5, topEdge + 5, sternEndX + 5, midY + 5);
  ctx.quadraticCurveTo(sternEndX + 5, botEdge + 5, sternX + 5, botEdge + 5);
  ctx.lineTo(bowBaseX + 5, botEdge + 5);
  ctx.closePath();
  ctx.fill();

  // ── OUTER HULL BODY ────────────────────────────────────────────────
  ctx.beginPath();
  ctx.moveTo(bowTipX, midY);
  ctx.lineTo(bowBaseX, topEdge);
  ctx.lineTo(sternX, topEdge);
  ctx.quadraticCurveTo(sternEndX, topEdge, sternEndX, midY);
  ctx.quadraticCurveTo(sternEndX, botEdge, sternX, botEdge);
  ctx.lineTo(bowBaseX, botEdge);
  ctx.closePath();
  ctx.fillStyle = '#0a141e';
  ctx.fill();

  // hull accent bevel (top half lighter)
  ctx.beginPath();
  ctx.moveTo(bowTipX, midY);
  ctx.lineTo(bowBaseX, topEdge);
  ctx.lineTo(sternX, topEdge);
  ctx.quadraticCurveTo(sternEndX, topEdge, sternEndX, midY);
  ctx.lineTo(sternEndX - 6, midY);
  ctx.quadraticCurveTo(sternEndX - 6, topEdge + 8, sternX - 4, topEdge + 8);
  ctx.lineTo(bowBaseX + 6, topEdge + 8);
  ctx.lineTo(bowTipX + 8, midY);
  ctx.closePath();
  ctx.fillStyle = 'rgba(78,227,227,0.05)';
  ctx.fill();

  // ── OUTER HULL STROKE ──────────────────────────────────────────────
  ctx.beginPath();
  ctx.moveTo(bowTipX, midY);
  ctx.lineTo(bowBaseX, topEdge);
  ctx.lineTo(sternX, topEdge);
  ctx.quadraticCurveTo(sternEndX, topEdge, sternEndX, midY);
  ctx.quadraticCurveTo(sternEndX, botEdge, sternX, botEdge);
  ctx.lineTo(bowBaseX, botEdge);
  ctx.closePath();
  ctx.strokeStyle = 'rgba(78,227,227,0.65)';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // hull rivets top and bottom edge
  _siRivets(ctx, bowBaseX + 8, topEdge + 2, sternX - bowBaseX - 8, 'rgba(78,227,227,0.3)', 22);
  _siRivets(ctx, bowBaseX + 8, botEdge - 3, sternX - bowBaseX - 8, 'rgba(78,227,227,0.3)', 22);

  // ── CLIP TO HULL INTERIOR FOR ROOMS ──────────────────────────────
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(bowTipX, midY);
  ctx.lineTo(bowBaseX, topEdge);
  ctx.lineTo(sternX, topEdge);
  ctx.quadraticCurveTo(sternEndX, topEdge, sternEndX, midY);
  ctx.quadraticCurveTo(sternEndX, botEdge, sternX, botEdge);
  ctx.lineTo(bowBaseX, botEdge);
  ctx.closePath();
  ctx.clip();

  // ── DECK LAYOUT ───────────────────────────────────────────────────
  // Interior usable rect (inset from hull tapers)
  const insetX = bowBaseX + 4;
  const insetY = topEdge + 4;
  const insetW = sternX - bowBaseX - 8;
  const insetH = botEdge - topEdge - 8;

  // 3 equal rows
  const ROWS = { upper: 0, middle: 1, lower: 2 };
  const rowH = insetH / 3;

  // Deck separator lines (floor/ceiling between rows)
  const deckSep1Y = insetY + rowH;
  const deckSep2Y = insetY + rowH * 2;
  ctx.fillStyle = 'rgba(78,227,227,0.12)';
  ctx.fillRect(_siPx(insetX), _siPx(deckSep1Y), _siPx(insetW), 2);
  ctx.fillRect(_siPx(insetX), _siPx(deckSep2Y), _siPx(insetW), 2);

  // Deck floor lines (surface agents walk on — bottom of each row)
  ctx.fillStyle = 'rgba(78,227,227,0.06)';
  ctx.fillRect(_siPx(insetX), _siPx(deckSep1Y - 4), _siPx(insetW), 4);
  ctx.fillRect(_siPx(insetX), _siPx(deckSep2Y - 4), _siPx(insetW), 4);
  ctx.fillRect(_siPx(insetX), _siPx(insetY + rowH * 3 - 4), _siPx(insetW), 4);

  // Compute X spans from ship_interior compartment data
  const allMinX = Math.min(...comps.map((c) => c.minX ?? 0));
  const allMaxX = Math.max(...comps.map((c) => c.maxX ?? 1));
  const worldSpan = Math.max(1, allMaxX - allMinX);

  // Build canvas rect per compartment
  const compRect = new Map();
  for (const comp of comps) {
    const row = ROWS[comp.lane] ?? 1;
    const cx  = insetX + ((comp.minX - allMinX) / worldSpan) * insetW;
    const cxE = insetX + ((comp.maxX - allMinX) / worldSpan) * insetW;
    const cy  = insetY + row * rowH;
    compRect.set(comp.id, {
      cx, cy,
      cw: Math.max(4, cxE - cx - 1),
      ch: rowH,
      comp,
    });
  }

  // ── DRAW EACH ROOM ────────────────────────────────────────────────
  for (const comp of comps) {
    const r = compRect.get(comp.id);
    if (!r) continue;
    const { cx, cy, cw, ch } = r;
    const flood  = Number(flooding?.[comp.id] ?? 0);
    const fill   = _SI_ROOM_FILL[comp.id] || '#101820';
    const isActive = activeCompartment === comp.id;
    const visSet = new Set(scene?.visibility?.visibleCompartments || comps.map((c) => c.id));
    const visible = visSet.has(comp.id);

    // Room base fill + lighting
    const lightVal = visible ? (isActive ? 1 : 0.85) : 0.35;
    _siRoom(ctx, cx, cy, cw, ch, fill, lightVal);

    // Active highlight tint
    if (isActive) {
      ctx.fillStyle = 'rgba(78,227,227,0.06)';
      ctx.fillRect(_siPx(cx), _siPx(cy), _siPx(cw), _siPx(ch));
    }

    // Darkness fog if not visible
    if (!visible) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(_siPx(cx), _siPx(cy), _siPx(cw), _siPx(ch));
    }

    // FURNITURE — only draw if room is at least partially visible
    if (visible && cw > 10 && ch > 10) {
      _siDrawFurniture(ctx, comp.id, comp.role || '', cx, cy, cw, ch, now);
    }

    // FLOOD water — rises from bottom of room
    if (flood > 0.06) {
      const floodH = ch * clamp(flood, 0, 1);
      ctx.fillStyle = `rgba(67,150,220,${0.15 + flood * 0.4})`;
      ctx.fillRect(_siPx(cx + 1), _siPx(cy + ch - floodH), _siPx(cw - 2), _siPx(floodH));
      // water surface shimmer
      ctx.fillStyle = `rgba(138,210,255,${flood * 0.4})`;
      ctx.fillRect(_siPx(cx + 2), _siPx(cy + ch - floodH), _siPx(cw - 4), 2);
      // animated ripples
      const ripple = Math.sin(now / 300 + cx * 0.05) * (cw * 0.08);
      ctx.fillStyle = `rgba(180,230,255,${flood * 0.2})`;
      ctx.fillRect(_siPx(cx + cw * 0.2 + ripple), _siPx(cy + ch - floodH + 4), _siPx(cw * 0.25), 1);
    }

    // FIRE overlay
    const fireLevel = Number(ship.fire?.compartments?.[comp.id] ?? 0);
    if (fireLevel > 0.05) {
      const fh = ch * clamp(fireLevel, 0, 0.8);
      for (let fi = 0; fi < 5; fi++) {
        const ft = (now / 120 + fi * 0.8) % 1;
        const fa = (0.6 - ft * 0.6) * fireLevel;
        ctx.fillStyle = `rgba(255,${Math.floor(80 + ft * 100)},20,${fa})`;
        ctx.fillRect(
          _siPx(cx + cw * (0.1 + fi * 0.16) + Math.sin(now / 100 + fi) * 4),
          _siPx(cy + ch - fh * (0.5 + ft * 0.5)),
          _siPx(cw * 0.1),
          _siPx(fh * (0.3 + ft * 0.7))
        );
      }
    }

    // WALL BORDERS per room (pixel art thick walls)
    const wallCol = isActive ? 'rgba(78,227,227,0.6)' : visible ? 'rgba(78,227,227,0.25)' : 'rgba(78,227,227,0.08)';
    _siWall(ctx, cx, cy, cw, 3, wallCol);                    // top wall
    _siWall(ctx, cx, cy + ch - 3, cw, 3, wallCol);           // bottom wall (floor)
    _siWall(ctx, cx, cy, 3, ch, 'rgba(78,227,227,0.35)');    // left wall
    _siWall(ctx, cx + cw - 3, cy, 3, ch, 'rgba(0,0,0,0.4)'); // right wall shadow

    // ROOM LABEL — small pixel text at top-left
    ctx.fillStyle = isActive ? P.accent : visible ? P.fog : P.textDim;
    ctx.font = `${Math.max(7, Math.min(9, cw * 0.09))}px "Press Start 2P", monospace`;
    ctx.textAlign = 'left';
    ctx.fillText(
      String(comp.label || comp.name || comp.id || '').toUpperCase().slice(0, 10),
      _siPx(cx + 5),
      _siPx(cy + 13)
    );

    // OCCUPANCY dots row bottom-right
    const occ = (world.agents || []).filter((ag) => {
      return ag.alive !== false && isAgentOnShip(ag, world) &&
        (shipCompartmentForAgent(ag, world) === comp.id);
    }).length;
    if (occ > 0) {
      for (let oi = 0; oi < Math.min(occ, 6); oi++) {
        ctx.fillStyle = isActive ? P.accent : P.fog;
        ctx.fillRect(_siPx(cx + cw - 8 - oi * 6), _siPx(cy + ch - 8), 4, 4);
      }
    }
  }

  // ── VERTICAL DIVIDER WALLS between rooms ─────────────────────────
  // Draw thick column walls between compartments in the same lane
  const laneGroups = { upper: [], middle: [], lower: [] };
  for (const comp of comps) {
    if (laneGroups[comp.lane]) laneGroups[comp.lane].push(comp);
  }
  for (const [lane, laneComps] of Object.entries(laneGroups)) {
    const sorted = laneComps.slice().sort((a, b) => a.minX - b.minX);
    for (let i = 0; i + 1 < sorted.length; i++) {
      const ra = compRect.get(sorted[i].id);
      const rb = compRect.get(sorted[i + 1].id);
      if (!ra || !rb) continue;
      const wallX = ra.cx + ra.cw - 1;
      // check for door between these two rooms
      const hasDoor = (scene?.doors || []).find((d) =>
        (d.from === sorted[i].id && d.to === sorted[i + 1].id) ||
        (d.to === sorted[i].id && d.from === sorted[i + 1].id)
      );
      if (hasDoor) {
        // draw wall with door gap
        const dh = Math.round(ra.ch * 0.42);
        const doorY2 = ra.cy + (ra.ch - dh) / 2;
        // wall above door
        ctx.fillStyle = '#0a141e';
        ctx.fillRect(_siPx(wallX - 1), _siPx(ra.cy), 4, _siPx(doorY2 - ra.cy));
        // door gap
        _siDoor(ctx, wallX - 2, doorY2, 6, dh, '#0a141e', hasDoor.open, hasDoor.locked);
        // wall below door
        ctx.fillStyle = '#0a141e';
        ctx.fillRect(_siPx(wallX - 1), _siPx(doorY2 + dh), 4, _siPx(ra.cy + ra.ch - doorY2 - dh));
      } else {
        // solid wall
        ctx.fillStyle = '#0a141e';
        ctx.fillRect(_siPx(wallX - 1), _siPx(ra.cy), 4, _siPx(ra.ch));
        ctx.fillStyle = 'rgba(78,227,227,0.18)';
        ctx.fillRect(_siPx(wallX - 1), _siPx(ra.cy), 2, _siPx(ra.ch));
      }
    }
  }

  // ── STAIRS / LADDERS between upper↔middle and middle↔lower ─────
  // Stair connections defined in ship_interior: helm↔mess, bridge↔hall, infirmary↔brig (via hatch), mess↔boiler, hall↔cargo
  const stairConnections = [
    ['helm',      'mess'],
    ['bridge',    'hall'],
    ['lookout',   'infirmary'],
    ['mess',      'boiler'],
    ['hall',      'cargo'],
  ];
  for (const [fromId, toId] of stairConnections) {
    const ra = compRect.get(fromId);
    const rb = compRect.get(toId);
    if (!ra || !rb) continue;
    // Ladder at right side of upper room / left side of lower room
    const lx = _siPx(ra.cx + ra.cw * 0.82);
    const ly = Math.min(ra.cy + ra.ch, rb.cy);
    const lh = Math.max(ra.cy + ra.ch, rb.cy) - ly + Math.abs(ra.cy + ra.ch - rb.cy);
    // vertical connector wall strip
    ctx.fillStyle = '#0e1a26';
    ctx.fillRect(lx - 4, _siPx(ra.cy + ra.ch - 2), 16, _siPx(Math.abs(rb.cy - ra.cy - ra.ch) + 4));
    _siLadder(ctx, lx, _siPx(ra.cy + ra.ch - 4), _siPx(rb.cy - ra.cy - ra.ch + 10), 'rgba(78,227,227,0.45)');
  }

  // ── SHIP EXTERIOR DETAILS (outside hull, but within clip) ────────
  // Rocket thruster nozzles — rear (stern)
  const nozzleOffsets = [-hullH * 0.22, hullH * 0.22];
  for (const noff of nozzleOffsets) {
    const ny = midY + noff;
    // thruster housing
    ctx.fillStyle = '#1a2a3a';
    ctx.fillRect(_siPx(sternEndX - 12), _siPx(ny - 8), 16, 16);
    ctx.fillStyle = '#2a3a4a';
    ctx.fillRect(_siPx(sternEndX - 10), _siPx(ny - 6), 12, 12);
    // nozzle glow — animated
    const thrGlow = 0.5 + Math.abs(Math.sin(now / 200 + noff)) * 0.4;
    const grad = ctx.createRadialGradient(
      _siPx(sternEndX + 6), _siPx(ny), 0,
      _siPx(sternEndX + 6), _siPx(ny), 20
    );
    grad.addColorStop(0,   `rgba(100,200,255,${thrGlow})`);
    grad.addColorStop(0.4, `rgba(60,130,230,${thrGlow * 0.6})`);
    grad.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(_siPx(sternEndX + 1), _siPx(ny - 14), 28, 28);
  }

  // Satellite dish — top center
  const satX = insetX + insetW * 0.42;
  const satY = topEdge - 2;
  ctx.fillStyle = '#2a3a4a';
  ctx.fillRect(_siPx(satX - 1), _siPx(satY - 14), 3, 14);
  ctx.strokeStyle = '#4a6a8a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(_siPx(satX), _siPx(satY - 14), 10, Math.PI, 0);
  ctx.stroke();
  ctx.fillStyle = '#3a5068';
  ctx.beginPath();
  ctx.arc(_siPx(satX), _siPx(satY - 14), 10, Math.PI, 0);
  ctx.fill();

  // Bow anchor / cleat
  ctx.fillStyle = 'rgba(78,227,227,0.4)';
  ctx.fillRect(_siPx(bowBaseX + 8), _siPx(midY - 5), 10, 10);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(_siPx(bowBaseX + 10), _siPx(midY - 3), 6, 6);

  ctx.restore(); // end hull clip

  // ── CREW SPRITES ─────────────────────────────────────────────────
  const sortedCrew = crew.slice().sort((a, b) => (a.position?.y || 0) - (b.position?.y || 0));
  for (const ag of sortedCrew) {
    const compId = shipCompartmentForAgent(ag, world);
    const r = compRect.get(compId) || compRect.get(comps[0]?.id);
    if (!r) continue;
    const { cx, cy, cw, ch } = r;
    // Slot spread to avoid overlap
    const crewInComp = sortedCrew.filter((o) => shipCompartmentForAgent(o, world) === compId);
    const slot = crewInComp.indexOf(ag);
    const spread = cw / Math.max(crewInComp.length + 1, 2);
    const agX = cx + spread * (slot + 1);
    // Place agent on floor of their deck row (bottom 25% of row height)
    const agY = cy + ch * 0.78;

    const agAnimPhase = ((now / 400) + (ag.position?.x || 0) * 0.31 + (ag.position?.y || 0) * 0.17) % 1;
    const bobY = Math.sin((now / 240) + (ag.position?.x || 0) * 0.17) * 1.2;
    const apx = clamp(_siPx(agX), _siPx(cx + 8), _siPx(cx + cw - 8));
    const apy = clamp(_siPx(agY + bobY), _siPx(cy + ch * 0.5), _siPx(cy + ch - 8));

    const vis = getAgentVisual(ag);
    drawAgentSprite(ctx, apx, apy, ag.name, vis.accentColor,
      ag.id === selectedAgentId, Boolean(ag.imprisoned), !ag.alive, Boolean(ag.swimming), ag, agAnimPhase);
    drawBar(ctx, apx - 14, apy - 28, 28, 4, clamp((ag.health ?? 0) / 100, 0, 1), ag.imprisoned ? P.gold : P.mint);
    // name tag
    ctx.fillStyle = P.deep;
    const nameW = Math.min(58, String(ag.name || '').length * 5 + 8);
    ctx.fillRect(apx - nameW / 2, apy + 12, nameW, 10);
    ctx.fillStyle = vis.accentColor;
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(ag.name || '').slice(0, 8).toUpperCase(), apx, apy + 21);
  }

  // ── SPEECH BUBBLES ────────────────────────────────────────────────
  const speeches = (world.speeches || []).slice(-5);
  for (const sp of speeches) {
    const speaker = sortedCrew.find((a) => a.id === sp.speaker);
    if (!speaker) continue;
    const compId = shipCompartmentForAgent(speaker, world);
    const r = compRect.get(compId);
    if (!r) continue;
    const crewInComp = sortedCrew.filter((o) => shipCompartmentForAgent(o, world) === compId);
    const slot = crewInComp.indexOf(speaker);
    const spread = r.cw / Math.max(crewInComp.length + 1, 2);
    const spx = r.cx + spread * (slot + 1) - 60;
    const spy = r.cy + r.ch * 0.5;
    renderBubble(ctx, `${speaker.name}: ${sp.speech}`, clamp(spx, 8, logW - 260), clamp(spy, 34, logH - 24), 240);
  }

  // ── SELECTED AGENT HUD ────────────────────────────────────────────
  if (selected) {
    const vis = getAgentVisual(selected);
    const hudX = logW - 154;
    const hudY = MARGIN_TOP + 4;
    ctx.fillStyle = 'rgba(4,8,16,0.85)';
    ctx.fillRect(hudX, hudY, 142, 52);
    ctx.fillStyle = vis.accentColor;
    ctx.fillRect(hudX, hudY, 142, 2);
    ctx.fillRect(hudX, hudY, 2, 52);
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = vis.accentColor;
    ctx.fillText(String(selected.name || '').slice(0, 9).toUpperCase(), hudX + 6, hudY + 15);
    ctx.fillStyle = P.fog;
    const selCompId = shipCompartmentForAgent(selected, world);
    const selComp = comps.find((c) => c.id === selCompId) || { label: selCompId };
    ctx.fillText(String(selComp.label || selComp.name || selCompId || '').slice(0, 10).toUpperCase(), hudX + 6, hudY + 29);
    drawBar(ctx, hudX + 6, hudY + 37, 130, 5, clamp((selected.health ?? 0) / 100, 0, 1), P.mint);
    drawBar(ctx, hudX + 6, hudY + 44, 130, 4, clamp((selected.alertness ?? 0.5), 0, 1), P.gold);
  }

  // ── SOUND INDICATORS (audio source icons) ────────────────────────
  for (const src of sounds.slice(0, 4)) {
    if (!src.audible && src.intensity < 0.2) continue;
    const srcR = compRect.get(src.compartment);
    if (!srcR) continue;
    const sx = srcR.cx + srcR.cw * 0.85;
    const sy = srcR.cy + srcR.ch * 0.18;
    const sa = 0.4 + src.intensity * 0.5;
    const sc = src.type === 'fire' ? P.warning : src.type === 'flood' ? '#5ab0ff' : P.accent;
    ctx.fillStyle = `rgba(${_siHex2rgb(sc)},${sa})`;
    ctx.fillRect(_siPx(sx), _siPx(sy), 5, 5);
    // ripple rings
    const pulse = Math.abs(Math.sin(now / 300 + srcR.cx));
    ctx.strokeStyle = `rgba(${_siHex2rgb(sc)},${sa * pulse * 0.6})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(_siPx(sx + 2), _siPx(sy + 2), 5 + pulse * 8, 0, Math.PI * 2);
    ctx.stroke();
  }

  // ── HUD STRIP ─────────────────────────────────────────────────────
  const hudBY = logH - 46;
  ctx.fillStyle = 'rgba(4,8,16,0.9)';
  ctx.fillRect(0, hudBY, logW, 46);
  ctx.fillStyle = P.accent;
  ctx.fillRect(0, hudBY, logW, 2);
  ctx.font = '8px "Press Start 2P", monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = P.accent;
  ctx.fillText('SHIP INTERIOR', 14, hudBY + 14);
  ctx.fillStyle = P.fog;
  const activeComp = comps.find((c) => c.id === activeCompartment);
  ctx.fillText(
    `${String(activeComp?.label || activeComp?.name || activeCompartment || '').toUpperCase()} · ${comps.length} ROOMS · CREW ${crew.length}`,
    14, hudBY + 28
  );
  ctx.fillStyle = P.textDim;
  ctx.fillText(`ZOOM ${zoom.toFixed(2)} · ${state.camera?.follow?.toUpperCase() || 'SHIP'} · BOW→STERN`, 14, hudBY + 40);

  // ship integrity mini bar
  const integ = clamp(Number(ship.integrity ?? 100) / 100, 0, 1);
  const intCol = integ > 0.7 ? P.mint : integ > 0.4 ? P.gold : P.danger;
  ctx.fillStyle = P.textDim;
  ctx.fillText('HULL', logW - 110, hudBY + 14);
  drawBar(ctx, logW - 110, hudBY + 18, 96, 5, integ, intCol);
  const power = clamp(Number(ship.power?.reserve ?? 0.65), 0, 1);
  ctx.fillStyle = P.textDim;
  ctx.fillText('PWR', logW - 110, hudBY + 32);
  drawBar(ctx, logW - 110, hudBY + 36, 96, 5, power, P.accent);

  ctx.restore();
}

// helper: hex color to rgb components for rgba strings
function hexToRgb(hex) {
  // fallback gracefully if hex isn't a proper hex
  const m = String(hex || '').match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return '78,227,227';
  return `${parseInt(m[1],16)},${parseInt(m[2],16)},${parseInt(m[3],16)}`;
}

// helper: human-readable compartment label
function compartmentLabel(comp) {
  if (!comp) return 'room';
  return tileLabel(comp.name || comp.id || comp.role || 'room');
}

// ── overworld renderer ────────────────────────────────────────────────
function renderMap() {
  const world = state.world;
  if (!world) return;
  const canvas = $('worldCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ensureCanvasSize();

  const focus  = getCameraFocus();
  const zoom   = clamp(Number(state.camera.zoom || 1.25), MIN_ZOOM, MAX_ZOOM);
  const tile   = getTileSize(zoom);
  const W = WORLD_W, H = WORLD_H;
  const ox = Math.floor(canvas.width / 2 - focus.x * tile);
  const oy = Math.floor(canvas.height / 2 - focus.y * tile);

  const alpha       = state.previousWorld ? smoothstep(clamp((performance.now() - state.worldLoadedAt) / API_POLL_MS, 0, 1)) : 1;
  const prevAgents  = mapEntityIndex(state.previousWorld?.agents || []);
  const currAgents  = mapEntityIndex(world.agents || []);
  const prevFauna   = mapEntityIndex(state.previousWorld?.faunaEntities || []);
  const currFauna   = mapEntityIndex(world.faunaEntities || []);
  const zones = world.zones || {};
  const sites = world.expeditionSites || [];
  const traps = world.traps || [];
  const totems = world.totems || [];
  const tracks = world.tracks || [];
  const shipPos   = world.overworld?.shipPosition || world.shipPosition || world.ship?.worldPosition || world.ship?.position || centerOfZone('ship') || { x: W / 2, y: H / 2 };
  const sceneMode = state.sceneMode || state.viewerSettings.sceneMode || 'overworld';
  const shipBounds = getShipInteriorBounds(world);
  const now = performance.now();
  const ship = world.ship || {};
  const waterTiles = Number.isFinite(world.waterTiles) ? world.waterTiles : (world.terrain?.rows || []).flat().filter((c) => c === '~').length;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // ── sky bg ────────────────────────────────────────────────────────
  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0,    '#060a12');
  sky.addColorStop(0.4,  '#0b1520');
  sky.addColorStop(1,    '#040810');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // scanline effect
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  for (let i = 0; i < canvas.height; i += 4) ctx.fillRect(0, i, canvas.width, 2);

  // subtle vignette
  const vig = ctx.createRadialGradient(canvas.width/2, canvas.height/2, canvas.width*0.18, canvas.width/2, canvas.height/2, canvas.width*0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const worldMap = world.map || { width: W, height: H };
  const tw = worldMap.width || W;
  const th = worldMap.height || H;
  const cache = ensureTerrainCache(world, tile);
  const viewMinX = clamp(Math.floor((-ox - tile * 2) / tile), 0, tw - 1);
  const viewMinY = clamp(Math.floor((-oy - tile * 2) / tile), 0, th - 1);
  const viewMaxX = clamp(Math.ceil((canvas.width - ox + tile * 2) / tile), 0, tw);
  const viewMaxY = clamp(Math.ceil((canvas.height - oy + tile * 2) / tile), 0, th);

  ctx.save();
  ctx.translate(ox, oy);

  // ── ship interior shortcut ────────────────────────────────────────
  if (sceneMode === 'ship') {
    renderShipScene(ctx, world, {
      canvas, tile, zoom, shipBounds, viewMinX, viewMinY, viewMaxX, viewMaxY,
      shipPos, now, alpha, prevAgents, currAgents, selectedAgentId: state.selectedAgentId,
    });
    ctx.restore();
    return;
  }

  // ── terrain ───────────────────────────────────────────────────────
  if (cache?.canvas) {
    ctx.drawImage(cache.canvas, 0, 0);
  } else {
    for (let ty = viewMinY; ty < viewMaxY; ty++) {
      for (let tx = viewMinX; tx < viewMaxX; tx++) {
        const zone = bestZoneAt({ x: tx, y: ty }, zones);
        const code = world.terrain?.rows?.[ty]?.[tx] || null;
        ctx.fillStyle = terrainColorFor(code, zone);
        ctx.fillRect(tx * tile, ty * tile, tile + 1, tile + 1);
      }
    }
  }

  // ── animated water shimmer ────────────────────────────────────────
  for (let ty = viewMinY; ty < viewMaxY; ty++) {
    for (let tx = viewMinX; tx < viewMaxX; tx++) {
      const code = world.terrain?.rows?.[ty]?.[tx] || null;
      if (code !== '~') continue;
      const px = tx * tile, py = ty * tile;
      const wave = Math.sin(now / 220 + tx * 0.4 + ty * 0.27);
      const a = 0.05 + (wave + 1) * 0.02;
      ctx.fillStyle = `rgba(78,227,227,${a})`;
      ctx.fillRect(px + tile * 0.1, py + tile * (0.28 + wave * 0.05), tile * 0.8, 1);
      ctx.fillStyle = `rgba(255,255,255,${a * 0.4})`;
      ctx.fillRect(px + tile * 0.25, py + tile * (0.62 - wave * 0.04), tile * 0.4, 1);
    }
  }

  // ── weather whiteout ──────────────────────────────────────────────
  if (world.weatherLabel === 'whiteout') {
    ctx.fillStyle = 'rgba(220,240,255,0.04)';
    for (let i = 0; i < 80; i++) {
      ctx.fillRect(Math.random() * (tw * tile), Math.random() * (th * tile), 1, 3);
    }
  }

  // ── trails ───────────────────────────────────────────────────────
  if (state.viewerSettings.showTrails) {
    for (const tr of tracks.slice(-100)) {
      const p = tr.position || { x: 0, y: 0 };
      if (p.x < viewMinX - 2 || p.x > viewMaxX + 2 || p.y < viewMinY - 2 || p.y > viewMaxY + 2) continue;
      ctx.fillStyle = tr.kind === 'suspicious' ? 'rgba(255,64,96,0.45)' : 'rgba(78,227,227,0.15)';
      ctx.fillRect(p.x * tile + tile * 0.46, p.y * tile + tile * 0.46, Math.max(2, tile * 0.12), Math.max(2, tile * 0.12));
    }
  }

  const shipPad  = 8;
  const shipMinX = shipBounds.minX - shipPad, shipMaxX = shipBounds.maxX + shipPad;
  const shipMinY = shipBounds.minY - shipPad, shipMaxY = shipBounds.maxY + shipPad;

  // ── expedition sites ──────────────────────────────────────────────
  for (const [idx, site] of sites.entries()) {
    if (sceneMode === 'ship' && (site.x < shipMinX || site.x > shipMaxX || site.y < shipMinY || site.y > shipMaxY)) continue;
    if (site.x < viewMinX - 2 || site.x > viewMaxX + 2 || site.y < viewMinY - 2 || site.y > viewMaxY + 2) continue;
    const discovered = site.discovered || (world.expedition?.discovered || []).includes(site.id);
    const px = site.x * tile, py = site.y * tile;
    // base marker
    ctx.fillStyle = discovered ? '#1a3a5a' : 'rgba(26,58,90,0.3)';
    ctx.fillRect(px + tile * 0.08, py + tile * 0.08, tile * 0.84, tile * 0.84);
    const siteColor = site.kind === 'hazard' ? P.warning : P.accentD;
    ctx.fillStyle = siteColor;
    ctx.fillRect(px + tile * 0.2, py + tile * 0.2, tile * 0.6, tile * 0.6);
    // icon: flag
    ctx.fillStyle = '#fff';
    ctx.fillRect(px + tile * 0.36, py + tile * 0.12, tile * 0.1, tile * 0.54);
    ctx.fillStyle = siteColor;
    ctx.fillRect(px + tile * 0.46, py + tile * 0.12, tile * 0.3, tile * 0.22);
    // pixel border
    ctx.fillStyle = siteColor;
    ctx.fillRect(px + tile * 0.08, py + tile * 0.08, tile * 0.84, 1);
    ctx.fillRect(px + tile * 0.08, py + tile * 0.88, tile * 0.84, 1);
    ctx.fillRect(px + tile * 0.08, py + tile * 0.08, 1, tile * 0.84);
    ctx.fillRect(px + tile * 0.9,  py + tile * 0.08, 1, tile * 0.84);
  }

  // ── traps ─────────────────────────────────────────────────────────
  for (const trap of traps.slice(-20)) {
    const p = trap.position || { x: 0, y: 0 };
    if (sceneMode === 'ship' && (p.x < shipMinX || p.x > shipMaxX || p.y < shipMinY || p.y > shipMaxY)) continue;
    if (p.x < viewMinX - 2 || p.x > viewMaxX + 2 || p.y < viewMinY - 2 || p.y > viewMaxY + 2) continue;
    const tc = trap.kind === 'explosive' ? P.warning : P.snow;
    ctx.fillStyle = tc;
    ctx.fillRect(p.x * tile + tile * 0.3, p.y * tile + tile * 0.3, tile * 0.4, tile * 0.4);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(p.x * tile + tile * 0.38, p.y * tile + tile * 0.38, tile * 0.12, tile * 0.12);
  }

  // ── totems ────────────────────────────────────────────────────────
  for (const totem of totems.slice(-20)) {
    const p = totem.position || { x: 0, y: 0 };
    if (sceneMode === 'ship' && (p.x < shipMinX || p.x > shipMaxX || p.y < shipMinY || p.y > shipMaxY)) continue;
    if (p.x < viewMinX - 2 || p.x > viewMaxX + 2 || p.y < viewMinY - 2 || p.y > viewMaxY + 2) continue;
    const tx = p.x * tile, ty2 = p.y * tile;
    // totem pole — stacked pixel art
    ctx.fillStyle = '#2a1e38';
    ctx.fillRect(tx + tile * 0.42, ty2 + tile * 0.12, tile * 0.16, tile * 0.76);
    ctx.fillStyle = '#8e69ff';
    ctx.fillRect(tx + tile * 0.28, ty2 + tile * 0.08, tile * 0.44, tile * 0.14);
    ctx.fillRect(tx + tile * 0.32, ty2 + tile * 0.35, tile * 0.36, tile * 0.12);
    ctx.fillStyle = '#cbb4ff';
    ctx.fillRect(tx + tile * 0.36, ty2 + tile * 0.08, tile * 0.28, tile * 0.1);
    // glow
    ctx.fillStyle = 'rgba(142,105,255,0.15)';
    ctx.beginPath();
    ctx.arc(tx + tile * 0.5, ty2 + tile * 0.12, tile * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── ship on overworld ─────────────────────────────────────────────
  const sx    = shipPos.x * tile;
  const sy    = shipPos.y * tile + Math.sin(now / 320) * 1.8;
  const shipW = tile * 4.5;
  const shipH = tile * 2.3;
  const shipX = sx - shipW * 0.5;
  const shipY = sy - shipH * 0.5;

  // wake foam
  ctx.fillStyle = 'rgba(78,227,227,0.08)';
  ctx.beginPath();
  ctx.ellipse(sx + tile * 0.5, sy + tile * 1.1, tile * 2.8, tile * 0.9, 0, 0, Math.PI * 2);
  ctx.fill();
  // animated wake lines
  for (let i = 0; i < 3; i++) {
    const wof = Math.sin(now / 350 + i) * tile * 0.3;
    ctx.fillStyle = `rgba(78,227,227,${0.06 - i * 0.01})`;
    ctx.fillRect(shipX - tile * (0.3 + i * 0.2) + wof, sy + shipH * 0.52, tile * (1.5 + i * 0.3), 1);
  }

  drawShipHullOutline(ctx, shipX, shipY, shipW, shipH, {
    fill:      ship.canDisembark ? '#1a2e42' : '#10192a',
    deck:      '#0a1520',
    stroke:    'rgba(78,227,227,0.7)',
    accent:    'rgba(78,227,227,0.28)',
    lineWidth: Math.max(2, tile * 0.14),
  });

  // ship interior highlight zone overlay
  if (sceneMode === 'ship') {
    ctx.fillStyle = 'rgba(78,227,227,0.05)';
    ctx.fillRect(shipBounds.minX * tile, shipBounds.minY * tile,
      (shipBounds.maxX - shipBounds.minX + 1) * tile, (shipBounds.maxY - shipBounds.minY + 1) * tile);
    ctx.strokeStyle = 'rgba(78,227,227,0.38)';
    ctx.lineWidth = Math.max(2, tile * 0.1);
    ctx.strokeRect(shipBounds.minX * tile + 2, shipBounds.minY * tile + 2,
      (shipBounds.maxX - shipBounds.minX + 1) * tile - 4, (shipBounds.maxY - shipBounds.minY + 1) * tile - 4);
  }

  // route path
  const route = world.route || [];
  const routePts = route.map((name) => centerOfZone(name)).filter(Boolean);
  if (sceneMode !== 'ship' && routePts.length > 1) {
    ctx.strokeStyle = 'rgba(78,227,227,0.18)';
    ctx.lineWidth = Math.max(2, tile * 0.08);
    ctx.setLineDash([tile * 0.3, tile * 0.2]);
    ctx.beginPath();
    routePts.forEach((p, i) => {
      const rx = p.x * tile + tile / 2, ry = p.y * tile + tile / 2;
      i === 0 ? ctx.moveTo(rx, ry) : ctx.lineTo(rx, ry);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── agents in overworld ────────────────────────────────────────────
  const agents = (world.agents || []).slice().sort((a, b) => (a.position?.y || 0) - (b.position?.y || 0));
  for (const ag of agents) {
    const shipState = getAgentShipState(ag, world);
    const onShip = Boolean(shipState.onShip || shipState.insideInterior || shipState.compartment);
    // FIX: agents aboard the ship must NOT appear as full-size overworld sprites
    // They appear inside the ship view instead. Only show them if they've disembarked.
    if (sceneMode !== 'ship' && onShip) continue;
    if (sceneMode === 'ship' && !onShip) continue;
    const prev = prevAgents.get(ag.id) || ag;
    const curr = currAgents.get(ag.id) || ag;
    const pos = {
      x: lerp(prev.position?.x ?? curr.position?.x ?? 0, curr.position?.x ?? 0, alpha),
      y: lerp(prev.position?.y ?? curr.position?.y ?? 0, curr.position?.y ?? 0, alpha),
    };
    if (sceneMode === 'ship' && (pos.x < shipMinX || pos.x > shipMaxX || pos.y < shipMinY || pos.y > shipMaxY)) continue;
    if (pos.x < viewMinX - 1 || pos.x > viewMaxX + 1 || pos.y < viewMinY - 1 || pos.y > viewMaxY + 1) continue;
    const bob = Math.sin(now / 240 + (ag.position?.x || 0) * 0.18 + (ag.position?.y || 0) * 0.13) * 0.6;
    const apx = pos.x * tile + tile / 2;
    const apy = pos.y * tile + tile / 2 + bob;
    const vis = getAgentVisual(ag);
    const tinyShip = sceneMode !== 'ship' && onShip;
    const scale = tinyShip ? 0.46 : 1;
    const agAnimPhase = ((now / 400) + (ag.position?.x || 0) * 0.31 + (ag.position?.y || 0) * 0.17) % 1;
    ctx.save();
    ctx.translate(apx, apy);
    if (scale !== 1) ctx.scale(scale, scale);
    drawAgentSprite(ctx, 0, 0, ag.name, vis.accentColor, ag.id === state.selectedAgentId, Boolean(ag.imprisoned), !ag.alive, Boolean(ag.swimming), ag, agAnimPhase);
    drawBar(ctx, -tile * 0.44, -tile * 0.88, tile * 0.88, Math.max(3, tile * 0.12), clamp((ag.health ?? 0) / 100, 0, 1), ag.imprisoned ? P.gold : P.mint);
    ctx.fillStyle = P.deep;
    const nameW = Math.min(60, ag.name.length * 5 + 8);
    ctx.fillRect(-nameW / 2, 11, nameW, 10);
    ctx.fillStyle = vis.accentColor;
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(ag.name || '').slice(0, 8), 0, 20);
    ctx.restore();
  }
  // ── fauna ─────────────────────────────────────────────────────────
  for (const fa of world.faunaEntities || []) {
    const prev = prevFauna.get(fa.id) || fa;
    const curr = currFauna.get(fa.id) || fa;
    const pos = {
      x: lerp(prev.position?.x ?? curr.position?.x ?? 0, curr.position?.x ?? 0, alpha),
      y: lerp(prev.position?.y ?? curr.position?.y ?? 0, curr.position?.y ?? 0, alpha),
    };
    if (pos.x < viewMinX - 1 || pos.x > viewMaxX + 1 || pos.y < viewMinY - 1 || pos.y > viewMaxY + 1) continue;
    const floaty = Math.sin(now / 280 + (fa.position?.x || 0) * 0.22) * 0.4;
    const fpx = pos.x * tile + tile / 2;
    const fpy = pos.y * tile + tile / 2 + floaty;

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(fpx, fpy + tile * 0.36, tile * 0.44, tile * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();

    if (fa.kind === 'bear') {
      // pixel art bear — 2.5D
      const bc2 = '#7a4a28'; const bhl = '#b07040'; const bdk = '#4a2a10';
      // body
      ctx.fillStyle = bc2;
      ctx.fillRect(fpx - tile*0.28, fpy - tile*0.12, tile*0.56, tile*0.38);
      // body highlight
      ctx.fillStyle = bhl;
      ctx.fillRect(fpx - tile*0.28, fpy - tile*0.12, tile*0.56, tile*0.08);
      ctx.fillRect(fpx - tile*0.28, fpy - tile*0.12, tile*0.08, tile*0.38);
      // body shadow
      ctx.fillStyle = bdk;
      ctx.fillRect(fpx + tile*0.14, fpy - tile*0.12, tile*0.14, tile*0.38);
      // head
      ctx.fillStyle = bc2;
      ctx.fillRect(fpx - tile*0.2, fpy - tile*0.3, tile*0.4, tile*0.22);
      ctx.fillStyle = bhl;
      ctx.fillRect(fpx - tile*0.2, fpy - tile*0.3, tile*0.4, tile*0.06);
      // ears
      ctx.fillStyle = bc2;
      ctx.fillRect(fpx - tile*0.2, fpy - tile*0.38, tile*0.1, tile*0.1);
      ctx.fillRect(fpx + tile*0.1, fpy - tile*0.38, tile*0.1, tile*0.1);
      ctx.fillStyle = P.rose; // inner ear
      ctx.fillRect(fpx - tile*0.18, fpy - tile*0.36, tile*0.06, tile*0.06);
      ctx.fillRect(fpx + tile*0.12, fpy - tile*0.36, tile*0.06, tile*0.06);
      // eyes
      ctx.fillStyle = '#1a0a08';
      ctx.fillRect(fpx - tile*0.1, fpy - tile*0.24, tile*0.06, tile*0.06);
      ctx.fillRect(fpx + tile*0.04, fpy - tile*0.24, tile*0.06, tile*0.06);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillRect(fpx - tile*0.08, fpy - tile*0.24, tile*0.02, tile*0.02);
      // snout
      ctx.fillStyle = bhl;
      ctx.fillRect(fpx - tile*0.1, fpy - tile*0.16, tile*0.2, tile*0.08);
      ctx.fillStyle = '#2a1208';
      ctx.fillRect(fpx - tile*0.04, fpy - tile*0.14, tile*0.08, tile*0.04);
      // legs
      ctx.fillStyle = bdk;
      ctx.fillRect(fpx - tile*0.22, fpy + tile*0.24, tile*0.14, tile*0.18);
      ctx.fillRect(fpx + tile*0.08, fpy + tile*0.24, tile*0.14, tile*0.18);
      // claws
      ctx.fillStyle = '#c0a060';
      ctx.fillRect(fpx - tile*0.22, fpy + tile*0.38, tile*0.14, tile*0.04);
      ctx.fillRect(fpx + tile*0.08, fpy + tile*0.38, tile*0.14, tile*0.04);
    } else {
      // generic creature — wolf / arctic fox / unknown
      const fc = '#8ab0c8'; const fhl = '#b0d0e8'; const fdk = '#4a6878';
      // body
      ctx.fillStyle = fc;
      ctx.fillRect(fpx - tile*0.22, fpy - tile*0.06, tile*0.44, tile*0.26);
      ctx.fillStyle = fhl;
      ctx.fillRect(fpx - tile*0.22, fpy - tile*0.06, tile*0.44, tile*0.06);
      ctx.fillRect(fpx - tile*0.22, fpy - tile*0.06, tile*0.06, tile*0.26);
      ctx.fillStyle = fdk;
      ctx.fillRect(fpx + tile*0.12, fpy - tile*0.06, tile*0.1, tile*0.26);
      // head
      ctx.fillStyle = fhl;
      ctx.fillRect(fpx - tile*0.16, fpy - tile*0.22, tile*0.32, tile*0.18);
      // ears (pointed)
      ctx.fillStyle = fc;
      ctx.fillRect(fpx - tile*0.14, fpy - tile*0.3, tile*0.06, tile*0.1);
      ctx.fillRect(fpx + tile*0.08, fpy - tile*0.3, tile*0.06, tile*0.1);
      // eyes
      ctx.fillStyle = '#0a0808';
      ctx.fillRect(fpx - tile*0.08, fpy - tile*0.18, tile*0.05, tile*0.05);
      ctx.fillRect(fpx + tile*0.03, fpy - tile*0.18, tile*0.05, tile*0.05);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(fpx - tile*0.06, fpy - tile*0.18, tile*0.02, tile*0.02);
      // legs
      ctx.fillStyle = fdk;
      ctx.fillRect(fpx - tile*0.18, fpy + tile*0.18, tile*0.1, tile*0.14);
      ctx.fillRect(fpx + tile*0.08, fpy + tile*0.18, tile*0.1, tile*0.14);
    }
    drawBar(ctx, fpx - tile*0.38, fpy - tile*0.44, tile*0.76, Math.max(3, tile*0.09), clamp((fa.health ?? 100) / 100, 0, 1), fa.kind === 'bear' ? P.warning : P.accentD);
  }

  // ── speech bubbles overworld ───────────────────────────────────────
  const speeches = (world.speeches || []).slice(-5);
  for (const sp of speeches) {
    const speaker = agents.find((a) => a.id === sp.speaker);
    if (!speaker) continue;
    if (!isAgentOnShip(speaker, world)) continue;
    const prev = prevAgents.get(speaker.id) || speaker;
    const curr = currAgents.get(speaker.id) || speaker;
    const spos = {
      x: lerp(prev.position?.x ?? curr.position?.x ?? 0, curr.position?.x ?? 0, alpha),
      y: lerp(prev.position?.y ?? curr.position?.y ?? 0, curr.position?.y ?? 0, alpha),
    };
    if (spos.x < viewMinX - 1 || spos.x > viewMaxX + 1 || spos.y < viewMinY - 1 || spos.y > viewMaxY + 1) continue;
    const spbx = spos.x * tile + tile / 2 - tile * 1.3;
    const spby = spos.y * tile - tile * 0.7;
    renderBubble(ctx, `${speaker.name}: ${sp.speech}`, clamp(spbx, 6, canvas.width - 260), clamp(spby, 52, canvas.height - 22), 250);
  }

  // ── selected agent ring ────────────────────────────────────────────
  const selAg = agents.find((a) => a.id === state.selectedAgentId);
  if (selAg) {
    const sp = selAg.position || { x: 0, y: 0 };
    if (sp.x >= viewMinX - 1 && sp.x <= viewMaxX + 1 && sp.y >= viewMinY - 1 && sp.y <= viewMaxY + 1) {
      const vis = getAgentVisual(selAg);
      ctx.strokeStyle = vis.accentColor;
      ctx.lineWidth = Math.max(2, tile * 0.12);
      ctx.strokeRect(sp.x * tile + tile * 0.06, sp.y * tile + tile * 0.06, tile * 0.88, tile * 0.88);
    }
  }

  // ── HUD strip ─────────────────────────────────────────────────────
  const hudBY = canvas.height - 46;
  ctx.setTransform(1,0,0,1,0,0); // reset transform for HUD
  ctx.fillStyle = 'rgba(4,8,16,0.9)';
  ctx.fillRect(0, hudBY, canvas.width, 46);
  ctx.fillStyle = P.accent;
  ctx.fillRect(0, hudBY, canvas.width, 2);
  ctx.font = '8px "Press Start 2P", monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = P.accent;
  ctx.fillText(`OVERWORLD`, 14, hudBY + 14);
  ctx.fillStyle = P.fog;
  ctx.fillText(`TICK ${world.tick ?? 0} · DAY ${world.day ?? 1} · ${(world.weatherLabel || 'CALM').toUpperCase()} · ${Math.round(world.temperature ?? 0)}°`, 14, hudBY + 28);
  ctx.fillStyle = P.textDim;
  ctx.fillText(`ZOOM ${zoom.toFixed(2)} · FOLLOW ${state.camera.follow.toUpperCase()} · FAUNA ${(world.faunaEntities || []).filter(f=>f.active!==false).length}`, 14, hudBY + 40);
}

function renderWorld() {
  renderMap();
}

function renderUI() {
  if (!state.world) return;
  renderStaticUI();
}

function updateFpsMeter(now) {
  state.fpsSamples.push(now);
  while (state.fpsSamples.length && now - state.fpsSamples[0] > 1000) state.fpsSamples.shift();
  $('fpsLive').textContent = `${state.fpsSamples.length} fps`;
}

function frame(now) {
  if (!state.lastFrameAt) state.lastFrameAt = now;
  state.lastFrameAt = now;
  if (!state.paused) {
    renderWorld();
    updateFpsMeter(now);
    if (state.viewerSettings.autoNarration && state.feedItems.length) {
      $('narrationTicker').textContent = state.beat;
    }
  }
  state.renderHandle = requestAnimationFrame(frame);
}

async function loadConfig() {
  const cfg = await api('/api/config');
  updateLobbyFromConfig(cfg);
  $('configSync').textContent = 'Config loaded';
}

async function loadState() {
  const prev = state.world ? deepClone(state.world) : null;
  const next = await api('/api/state');
  syncSnapshot(prev, next);
  setConnection(true, `tick ${next.tick ?? 0}`);
  $('statusLine').textContent = next.running ? 'Simulation active.' : 'Lobby ready.';
  if (next.running && !state.selectedAgentId) state.selectedAgentId = next.agents?.[0]?.id || null;
}

async function refresh() {
  if (state.world) {
    renderUI();
  }
}

async function pollLoop() {
  if (state.pollingBusy) return;
  state.pollingBusy = true;
  try {
    await loadState();
    renderUI();
  } catch (err) {
    setConnection(false, err.message);
    $('statusLine').textContent = `Error: ${err.message}`;
  } finally {
    state.pollingBusy = false;
  }
}

async function startMatch() {
  $('lobbyErrors').textContent = '';
  try {
    await saveLobbyConfig().catch(() => null);
    const payload = collectLobbyPayload();
    const res = await api('/api/start', 'POST', payload);
    state.previousWorld = null;
    syncSnapshot(state.world, res.state || res);
    state.selectedAgentId = state.world?.agents?.[0]?.id || null;
    state.activePanel = state.viewerSettings.activePanel || 'overview';
    state.sceneMode = state.viewerSettings.sceneMode || 'overworld';
    state.camera.follow = state.viewerSettings.followMode || 'ship';
    state.camera.zoom = clamp(state.viewerSettings.zoom || 1.25, MIN_ZOOM, MAX_ZOOM);
    state.camera.dragging = false;
    $('statusLine').textContent = 'Match started.';
    renderUI();
  } catch (err) {
    $('lobbyErrors').textContent = err.message;
  }
}

async function stopMatch() {
  await api('/api/stop', 'POST');
  await loadState();
  renderUI();
}

async function resetMatch() {
  await api('/api/reset', 'POST');
  state.feedItems = [];
  state.seenSpeechIds.clear();
  state.seenEventIds.clear();
  state.beat = 'Reset to lobby.';
  state.previousWorld = null;
  state.activePanel = 'lobby';
  state.sceneMode = 'overworld';
  state.camera.follow = 'ship';
  state.camera.zoom = 1.25;
  state.camera.dragging = false;
  await loadState();
  renderUI();
}

async function recoverMatch() {
  await api('/api/recover', 'POST');
  await loadState();
  renderUI();
}

async function saveNow() {
  await api('/api/save', 'POST');
  $('configSync').textContent = 'Autosave saved';
}
