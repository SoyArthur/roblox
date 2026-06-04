function dist(a, b) {
  if (!a || !b) return Infinity;
  return Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.y ?? 0) - (b.y ?? 0));
}

function movementCostForBiome(code, opts = {}) {
  if (code === '~') return opts.allowWater ? 3.25 : Infinity;
  const map = { o: 1.05, s: 1.0, c: 1.08, n: 1.1, k: 1.1, f: 1.28, g: 1.34, d: 1.18, p: 1.16 };
  return map[code] || 1.15;
}

function canOccupyTile({ inBounds, tileBlocked, terrainCodeAt, entity, x, y, opts = {} }) {
  if (!inBounds(x, y)) return false;
  if (tileBlocked(x, y)) return false;
  const code = terrainCodeAt(x, y);
  const allowWater = Boolean(opts.allowWater || opts.mode === 'swim' || entity?.canSwim || entity?.swimming);
  if (code === '~' && !allowWater) return false;
  return true;
}

function plannedStepToward({
  from,
  to,
  entity = null,
  opts = {},
  inBounds,
  tileBlocked,
  terrainCodeAt,
  basicPathStepFallback,
}) {
  if (!from || !to) return { x: 0, y: 0 };
  const startX = Math.round(from.x);
  const startY = Math.round(from.y);
  const targetX = Math.round(to.x);
  const targetY = Math.round(to.y);
  if (startX === targetX && startY === targetY) return { x: 0, y: 0 };

  const allowWater = Boolean(opts.allowWater || entity?.canSwim || entity?.swimming || terrainCodeAt(targetX, targetY) === '~');
  const maxSearch = Math.max(10, Math.min(22, Math.abs(targetX - startX) + Math.abs(targetY - startY) + 4));
  const open = [{ x: startX, y: startY, g: 0, f: Math.abs(targetX - startX) + Math.abs(targetY - startY), first: null }];
  const visited = new Map([[`${startX},${startY}`, 0]]);
  const dirs = [
    { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
  ];
  let best = null;

  while (open.length) {
    open.sort((a, b) => a.f - b.f || a.g - b.g);
    const current = open.shift();
    const distToTarget = Math.abs(current.x - targetX) + Math.abs(current.y - targetY);
    if (!best || distToTarget < best.dist || (distToTarget === best.dist && current.g < best.g)) {
      best = { ...current, dist: distToTarget };
    }
    if (distToTarget === 0) {
      best = { ...current, dist: 0 };
      break;
    }
    if (current.g >= maxSearch) continue;

    for (const dir of dirs) {
      const nx = current.x + dir.x;
      const ny = current.y + dir.y;
      if (!inBounds(nx, ny)) continue;
      if (tileBlocked(nx, ny)) continue;
      const code = terrainCodeAt(nx, ny);
      const cost = movementCostForBiome(code, { allowWater });
      if (!Number.isFinite(cost)) continue;
      const ng = current.g + cost;
      const key = `${nx},${ny}`;
      if (visited.has(key) && visited.get(key) <= ng) continue;
      visited.set(key, ng);
      const h = Math.abs(targetX - nx) + Math.abs(targetY - ny);
      open.push({
        x: nx,
        y: ny,
        g: ng,
        f: ng + h * 1.05 + (code === '~' ? 0.5 : 0),
        first: current.first || { x: dir.x, y: dir.y },
      });
    }
  }

  return best?.first || basicPathStepFallback(from, to);
}

function buildTilePath({ from, to, maxSteps = 12, basicPathStep, canOccupy, clampX, clampY }) {
  if (!from || !to) return [];
  const path = [];
  let cursor = { x: Math.round(from.x), y: Math.round(from.y) };
  for (let i = 0; i < maxSteps; i += 1) {
    const remaining = dist(cursor, to);
    if (remaining <= 1) break;
    const step = basicPathStep(cursor, to);
    if (!step || (step.x === 0 && step.y === 0)) break;
    const next = {
      x: clampX(cursor.x + step.x),
      y: clampY(cursor.y + step.y),
    };
    if (!canOccupy(next.x, next.y)) break;
    path.push(next);
    cursor = next;
    if (next.x === Math.round(to.x) && next.y === Math.round(to.y)) break;
  }
  return path;
}

module.exports = {
  movementCostForBiome,
  canOccupyTile,
  plannedStepToward,
  buildTilePath,
};
