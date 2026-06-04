function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function dist(a, b) {
  if (!a || !b) return Infinity;
  return Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.y ?? 0) - (b.y ?? 0));
}

function shipWorldPosition(world = {}) {
  return world?.overworld?.shipPosition || world?.shipPosition || world?.ship?.worldPosition || world?.ship?.position || { x: 0, y: 0 };
}

function shipInteriorCenter(world = {}) {
  return world?.ship?.position || shipWorldPosition(world);
}

const CELL_PX = 30;
const SHIP_COLS = 10; // compartments distributed across this span
const SHIP_LANES = 3;

function shipInteriorSize(world = {}) {
  return {
    width: SHIP_COLS * CELL_PX,   // 300 units total width
    height: SHIP_LANES * CELL_PX, // 90 units total height
  };
}

function shipInteriorBounds(world = {}) {
  const center = shipInteriorCenter(world);
  const size = shipInteriorSize(world);
  const halfW = Math.floor(size.width / 2);
  const halfH = Math.floor(size.height / 2);
  return {
    minX: Math.round(center.x - halfW),
    maxX: Math.round(center.x + halfW),
    minY: Math.round(center.y - halfH),
    maxY: Math.round(center.y + halfH),
  };
}

function deckYForLane(bounds, lane) {
  // Each lane is CELL_PX (30) units tall; place agents at row center
  const top    = bounds.minY + Math.round(CELL_PX * 0.5); // upper row center
  const middle = bounds.minY + Math.round(CELL_PX * 1.5); // middle row center
  const bottom = bounds.minY + Math.round(CELL_PX * 2.5); // lower row center
  if (lane === 'upper') return top;
  if (lane === 'lower') return bottom;
  return middle;
}

function makeCompartment(bounds, id, label, lane, x1, x2, role = 'general', exits = false) {
  return {
    id,
    label,
    name: label,
    lane,
    laneY: deckYForLane(bounds, lane),
    minX: clamp(Math.min(x1, x2), bounds.minX, bounds.maxX),
    maxX: clamp(Math.max(x1, x2), bounds.minX, bounds.maxX),
    role,
    exits,
  };
}

function buildShipCompartments(world = {}) {
  const bounds = shipInteriorBounds(world);
  // Each compartment is exactly CELL_PX (30) units wide.
  // Upper: helm | bridge (2 cells) | lookout
  // Middle: mess | hall | infirmary (2 cells)
  // Lower: boiler | cargo (2 cells) | brig | airlock
  const o = bounds.minX; // origin
  const C = CELL_PX;

  return [
    makeCompartment(bounds, 'helm',      'timón',      'upper', o,         o + C - 1,     'helm'),
    makeCompartment(bounds, 'bridge',    'parte alta', 'upper', o + C,     o + 3*C - 1,   'bridge'),
    makeCompartment(bounds, 'lookout',   'vigía',      'upper', o + 3*C,   o + 4*C - 1,   'watch'),
    makeCompartment(bounds, 'mess',      'comedor',    'middle', o,         o + C - 1,     'living'),
    makeCompartment(bounds, 'hall',      'pasillo',    'middle', o + C,     o + 2*C - 1,   'hall'),
    makeCompartment(bounds, 'infirmary', 'enfermería', 'middle', o + 2*C,   o + 4*C - 1,   'care'),
    makeCompartment(bounds, 'boiler',    'parte baja', 'lower',  o,         o + C - 1,     'engine'),
    makeCompartment(bounds, 'cargo',     'bodega',     'lower',  o + C,     o + 3*C - 1,   'cargo'),
    makeCompartment(bounds, 'brig',      'brig',       'lower',  o + 3*C,   o + 3.5*C - 1, 'brig'),
    makeCompartment(bounds, 'airlock',   'salida',     'lower',  o + 3.5*C, o + 4*C - 1,   'exit', true),
  ];
}

function defaultShipCompartmentForRole(agent) {
  const profession = String(agent?.profession || '').toLowerCase();
  if (profession.includes('captain') || profession.includes('navigator')) return 'helm';
  if (profession.includes('engineer')) return 'boiler';
  if (profession.includes('doctor') || profession.includes('pastor')) return 'infirmary';
  if (profession.includes('cook')) return 'mess';
  if (profession.includes('hunter') || profession.includes('marine')) return 'cargo';
  return 'hall';
}

function buildShipSpawnPoints(world = {}, totalAgents = 8) {
  const compartments = buildShipCompartments(world);
  const preferredOrder = ['mess', 'hall', 'bridge', 'helm', 'infirmary', 'boiler', 'cargo', 'lookout'];
  const ordered = [
    ...preferredOrder.map((id) => compartments.find((c) => c.id === id)).filter(Boolean),
    ...compartments.filter((c) => !preferredOrder.includes(c.id)),
  ];
  const offsets = [-2, -1, 0, 1, 2];
  return Array.from({ length: totalAgents }, (_, index) => {
    const compartment = ordered[index % ordered.length] || compartments[0];
    const width = Math.max(1, compartment.maxX - compartment.minX - 2);
    const centerX = Math.round((compartment.minX + compartment.maxX) / 2);
    const x = clamp(centerX + offsets[index % offsets.length] * Math.max(1, Math.floor(width / 6)), compartment.minX + 1, compartment.maxX - 1);
    return {
      x,
      y: compartment.laneY,
      shipCompartment: compartment.id,
    };
  });
}

function shipCompartmentForPosition(pos, world = {}) {
  if (!pos) return null;
  const bounds = shipInteriorBounds(world);
  const x = Math.round(pos.x);
  const y = Math.round(pos.y);
  if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) return null;
  const comps = buildShipCompartments(world);
  const exact = comps.find((c) => y === c.laneY && x >= c.minX && x <= c.maxX);
  if (exact) return exact;
  let best = null;
  let bestScore = Infinity;
  for (const c of comps) {
    const dx = x < c.minX ? c.minX - x : x > c.maxX ? x - c.maxX : 0;
    const dy = Math.abs(y - c.laneY) * 1.25;
    const score = dx + dy;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

function shipLaneYForAgent(agent, world = {}) {
  const comps = buildShipCompartments(world);
  const comp = comps.find((c) => c.id === agent?.shipCompartment) || shipCompartmentForPosition(agent?.position, world);
  if (agent?.onShip && agent?.position && shipCompartmentForPosition(agent.position, world)) {
    return Math.round(agent.position.y);
  }
  if (comp) return comp.laneY;
  const roleComp = comps.find((c) => c.id === defaultShipCompartmentForRole(agent));
  return roleComp?.laneY ?? shipInteriorCenter(world).y;
}

function normalizeShipOccupant(entity, world = {}) {
  if (!entity) return entity;
  const bounds = shipInteriorBounds(world);
  if (!entity.onShip) {
    if (entity.shipCompartment && entity.shipCompartment !== 'overworld') entity.shipCompartment = null;
    return entity;
  }

  const comps = buildShipCompartments(world);
  const posComp = shipCompartmentForPosition(entity.position, world);
  let comp = comps.find((c) => c.id === entity.shipCompartment) || null;
  if (posComp) comp = posComp;
  if (!comp) {
    const preferred = defaultShipCompartmentForRole(entity);
    comp = comps.find((c) => c.id === preferred) || comps[0];
  }

  entity.shipCompartment = comp?.id || entity.shipCompartment || defaultShipCompartmentForRole(entity);
  const x = clamp(Math.round(entity.position?.x ?? shipInteriorCenter(world).x), bounds.minX, bounds.maxX);
  const y = clamp(Math.round(entity.position?.y ?? shipInteriorCenter(world).y), bounds.minY, bounds.maxY);
  entity.position = { x, y };
  entity.swimming = false;
  entity.lastSeen = { x, y, tick: world?.tick || 0 };
  return entity;
}

function compartmentOccupancy(world = {}, agents = []) {
  const comps = buildShipCompartments(world);
  const counts = Object.fromEntries(comps.map((c) => [c.id, 0]));
  for (const agent of agents) {
    if (!agent?.alive || !agent.onShip) continue;
    const comp = shipCompartmentForPosition(agent.position, world);
    const id = comp?.id || agent.shipCompartment;
    if (id && counts[id] != null) counts[id] += 1;
  }
  return counts;
}

function buildShipSceneState(world = {}, agents = [], focusAgent = null) {
  const compartments = buildShipCompartments(world);
  const occupancy = compartmentOccupancy(world, agents);
  const bounds = shipInteriorBounds(world);
  const activeCompartment = String(
    focusAgent?.shipCompartment
    || shipCompartmentForPosition(focusAgent?.position, world)?.id
    || world?.ship?.scene?.activeCompartment
    || 'mess'
  );
  const graph = {
    nodes: compartments.map((c) => ({
      id: c.id,
      label: c.label,
      lane: c.lane,
      laneY: c.laneY,
      minX: c.minX,
      maxX: c.maxX,
      role: c.role,
      exits: Boolean(c.exits),
      occupancy: occupancy[c.id] || 0,
    })),
    edges: compartments.flatMap((c, idx) => {
      const edges = [];
      const next = compartments[idx + 1];
      if (next && next.lane === c.lane) edges.push({ from: c.id, to: next.id, lane: c.lane });
      return edges;
    }),
  };
  return {
    mode: 'interior',
    activeCompartment,
    compartmentCount: compartments.length,
    compartments: compartments.map((c) => ({ ...c })),
    occupancy,
    graph,
    exitReady: Boolean(compartments.find((c) => c.id === activeCompartment)?.exits),
    bounds,
  };
}


function doorKey(a, b) {
  return [String(a || ''), String(b || '')].sort().join('::');
}

function buildShipDoors(world = {}) {
  const stored = world?.ship?.doors || {};
  const defs = [
    ['helm', 'bridge', 'open', 'corridor'],
    ['bridge', 'lookout', 'open', 'corridor'],
    ['helm', 'mess', 'open', 'stair'],
    ['bridge', 'hall', 'open', 'stair'],
    ['lookout', 'infirmary', 'open', 'corridor'],
    ['mess', 'hall', 'open', 'corridor'],
    ['hall', 'infirmary', 'open', 'corridor'],
    ['mess', 'boiler', 'open', 'stair'],
    ['hall', 'cargo', 'open', 'stair'],
    ['infirmary', 'brig', 'closed', 'hatch'],
    ['boiler', 'cargo', 'open', 'corridor'],
    ['cargo', 'brig', 'closed', 'hatch'],
    ['brig', 'airlock', 'locked', 'bulkhead'],
  ];

  return defs.map(([from, to, defaultState, kind]) => {
    const id = doorKey(from, to);
    const current = stored[id] || stored[doorKey(to, from)] || {};
    const state = String(current.state || defaultState || 'closed').toLowerCase();
    return {
      id,
      from,
      to,
      kind,
      state,
      open: state === 'open' || state === 'ajar',
      locked: state === 'locked',
      flooded: Number(current.flooded ?? 0),
      noise: Number(current.noise ?? 0),
      integrity: Number(current.integrity ?? 100),
    };
  });
}

function buildShipAdjacency(world = {}) {
  const adjacency = new Map();
  for (const comp of buildShipCompartments(world)) adjacency.set(comp.id, new Set());
  for (const door of buildShipDoors(world)) {
    if (door.locked) continue;
    if (!adjacency.has(door.from) || !adjacency.has(door.to)) continue;
    adjacency.get(door.from).add(door.to);
    adjacency.get(door.to).add(door.from);
  }
  return adjacency;
}

function shipPathfind(startId, goalId, world = {}) {
  const start = String(startId || '');
  const goal = String(goalId || '');
  if (!start || !goal || start === goal) return start ? [start] : [];
  const adjacency = buildShipAdjacency(world);
  if (!adjacency.has(start) || !adjacency.has(goal)) return [];
  const queue = [[start]];
  const seen = new Set([start]);
  while (queue.length) {
    const path = queue.shift();
    const last = path[path.length - 1];
    if (last === goal) return path;
    for (const next of adjacency.get(last) || []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(path.concat(next));
    }
  }
  return [];
}

function shipFloodingState(world = {}) {
  const compartments = buildShipCompartments(world);
  const ship = world?.ship || {};
  const base = ship.flooding && typeof ship.flooding === 'object' ? ship.flooding : {};
  const integrity = clamp(Number(ship.integrity ?? 100), 0, 100);
  const pressure = clamp(Number(ship.pressure ?? 0), 0, 1);
  const systems = ship.systems || {};
  const result = {};
  const EPS = 0.001;

  const normalizedBase = Object.fromEntries(
    Object.entries(base)
      .map(([id, value]) => [id, clamp(Number(value) || 0, 0, 1)])
      .filter(([id, value]) => compartments.some((comp) => comp.id === id) && value > EPS)
  );

  const healthy = integrity >= 99.5 && pressure <= EPS;
  if (healthy) {
    for (const comp of compartments) result[comp.id] = 0;
    return result;
  }

  const structuralDamage = integrity < 85 || pressure > 0.1;
  for (const comp of compartments) {
    const stored = Number(normalizedBase[comp.id] ?? 0);
    const laneBias = structuralDamage ? (comp.lane === 'lower' ? 0.18 : comp.lane === 'middle' ? 0.08 : 0.02) : 0;
    const doorPressure = (structuralDamage && comp.exits) ? 0.2 : 0;
    const hullBias = integrity < 70 ? (70 - integrity) / 350 : 0;
    const boilerBias = comp.id === 'boiler' ? (100 - clamp(Number(systems.boiler ?? 100), 0, 100)) / 180 : 0;
    const cargoBias = comp.id === 'cargo' ? (100 - clamp(Number(systems.hull ?? 100), 0, 100)) / 220 : 0;
    result[comp.id] = clamp(stored + laneBias + doorPressure + hullBias + boilerBias + cargoBias + pressure * 0.12, 0, 1);
  }

  for (const door of buildShipDoors(world)) {
    if (!door.open) continue;
    const from = result[door.from] ?? 0;
    const to = result[door.to] ?? 0;
    if (from <= EPS && to <= EPS) continue;
    const avg = (from + to) / 2;
    result[door.from] = clamp(from + (avg - from) * 0.35, 0, 1);
    result[door.to] = clamp(to + (avg - to) * 0.35, 0, 1);
  }

  return result;
}

function shipLightLevel(compartment, flooding = {}, world = {}) {
  const flood = clamp(Number(flooding?.[compartment?.id] ?? 0), 0, 1);
  const laneDark = compartment?.lane === 'lower' ? 0.22 : compartment?.lane === 'middle' ? 0.1 : 0.05;
  const powerGrid = world?.ship?.power?.grid || {};
  const localPower = Number(powerGrid?.[compartment?.id] ?? world?.ship?.power?.reserve ?? 0.65);
  const fireGlow = Number(world?.ship?.fire?.compartments?.[compartment?.id] ?? 0);
  return clamp((1 - flood * 0.7 - laneDark) * (0.55 + localPower * 0.45) - fireGlow * 0.2, 0.06, 1);
}

function shipAudibleSources(world = {}, agents = [], focusAgent = null) {
  const sources = [];
  for (const speech of Array.isArray(world?.speeches) ? world.speeches.slice(-16) : []) {
    const speaker = agents.find((a) => a.id === speech.speaker && a.alive && a.onShip);
    if (!speaker) continue;
    const compartment = shipCompartmentForPosition(speaker.position, world)?.id || speaker.shipCompartment || null;
    sources.push({
      id: speech.id,
      type: 'speech',
      speaker: speaker.id,
      speakerName: speaker.name,
      compartment,
      text: speech.speech,
      intensity: 1,
      heardBy: compartment ? [compartment] : [],
    });
  }

  const flooding = shipFloodingState(world);
  for (const comp of buildShipCompartments(world)) {
    const flood = Number(flooding[comp.id] || 0);
    if (flood <= 0.08) continue;
    sources.push({
      id: `flood:${comp.id}`,
      type: 'flood',
      compartment: comp.id,
      intensity: flood,
      text: 'water rushing through metal',
      heardBy: [comp.id],
    });
  }

  const ship = world?.ship || {};
  if ((ship.pressure || 0) > 0.15 || (ship.integrity || 100) < 80) {
    sources.push({
      id: 'ship:hull',
      type: 'hull',
      compartment: 'hull',
      intensity: clamp((100 - Number(ship.integrity ?? 100)) / 100 + Number(ship.pressure ?? 0), 0, 1),
      text: 'hull stress and groaning metal',
      heardBy: buildShipCompartments(world).map((c) => c.id),
    });
  }

  for (const [comp, value] of Object.entries(ship.fire?.compartments || {})) {
    if (value <= 0.03) continue;
    sources.push({
      id: `fire:${comp}`,
      type: 'fire',
      compartment: comp,
      intensity: clamp(value * 1.2, 0, 1),
      text: 'fire crackling and smoke',
      heardBy: [comp],
    });
  }

  if ((ship.power?.reserve ?? 0.5) < 0.35) {
    sources.push({
      id: 'ship:power',
      type: 'power',
      compartment: 'bridge',
      intensity: clamp(0.35 - Number(ship.power?.reserve ?? 0.5), 0, 1),
      text: 'electrical strain and dimming lights',
      heardBy: buildShipCompartments(world).map((c) => c.id),
    });
  }

  return sources;
}

function shipVisibilityForAgent(agent, world = {}, agents = []) {
  if (!agent?.onShip) {
    return {
      currentCompartment: null,
      visibleCompartments: [],
      visibleAgents: [],
      visibleDoors: [],
      audibleSources: [],
      flood: {},
      light: {},
      paths: [],
      stealth: 0,
    };
  }

  const compartments = buildShipCompartments(world);
  const doors = buildShipDoors(world);
  const flooding = shipFloodingState(world);
  const current = shipCompartmentForPosition(agent.position, world) || compartments.find((c) => c.id === agent.shipCompartment) || compartments[0];
  const adjacency = buildShipAdjacency(world);
  const visibleCompartments = new Set([current?.id]);
  const frontier = [current?.id];
  const maxDepth = 1 + (agent.alertness > 0.65 ? 1 : 0);

  for (let depth = 0; depth < maxDepth; depth += 1) {
    const nextFrontier = [];
    for (const cid of frontier) {
      for (const neighbor of adjacency.get(cid) || []) {
        if (visibleCompartments.has(neighbor)) continue;
        visibleCompartments.add(neighbor);
        nextFrontier.push(neighbor);
      }
    }
    frontier.length = 0;
    frontier.push(...nextFrontier);
  }

  const light = Object.fromEntries(compartments.map((c) => [c.id, shipLightLevel(c, flooding, world)]));
  const stealth = clamp((agent.stealth ?? 0.5) + (light[current?.id] || 0) * 0.15 - (flooding[current?.id] || 0) * 0.12, 0, 1);
  const visibleAgents = agents.filter((other) => {
    if (!other?.alive || !other.onShip || other.id === agent.id) return false;
    const otherComp = shipCompartmentForPosition(other.position, world)?.id || other.shipCompartment;
    if (!visibleCompartments.has(otherComp)) return false;
    const distance = Math.abs((other.position?.x ?? 0) - (agent.position?.x ?? 0));
    const sameCompartment = otherComp === current?.id;
    const los = sameCompartment || distance <= 4 || agent.role === 'traitor' || agent.alertness > 0.65;
    if (!los) return false;
    const hidden = (other.stealth ?? 0.35) > 0.65 && flooding[otherComp] < 0.28 && !sameCompartment;
    return !hidden;
  }).map((other) => ({
    id: other.id,
    name: other.name,
    profession: other.profession,
    role: other.role,
    compartment: shipCompartmentForPosition(other.position, world)?.id || other.shipCompartment || null,
    stealth: Number((other.stealth ?? 0).toFixed(2)),
    distance: Number(Math.abs((other.position?.x ?? 0) - (agent.position?.x ?? 0)).toFixed(2)),
  }));

  const visibleDoors = doors.filter((door) => visibleCompartments.has(door.from) || visibleCompartments.has(door.to));
  const audibleSources = shipAudibleSources(world, agents).map((source) => ({
    ...source,
    intensity: Number(clamp(source.intensity, 0, 1).toFixed(2)),
    audible: source.type === 'speech' ? true : clamp(source.intensity, 0, 1) > 0.12,
  })).filter((src) => src.audible);

  const paths = [];
  for (const target of visibleAgents.slice(0, 3)) {
    const path = shipPathfind(current?.id, target.compartment, world);
    if (path.length) paths.push({ target: target.id, compartments: path, distance: path.length - 1 });
  }

  return {
    currentCompartment: current?.id || null,
    visibleCompartments: Array.from(visibleCompartments),
    visibleAgents,
    visibleDoors,
    audibleSources,
    flood: flooding,
    light,
    paths,
    stealth,
  };
}

function stepShipSystems(world = {}, agents = []) {
  if (!world.ship) world.ship = {};
  const flooding = shipFloodingState(world);
  const doors = buildShipDoors(world);
  const nextFlood = { ...flooding };

  for (const door of doors) {
    if (door.locked || !door.open) continue;
    const a = nextFlood[door.from] ?? 0;
    const b = nextFlood[door.to] ?? 0;
    if (Math.abs(a - b) > 0.03) {
      const avg = (a + b) / 2;
      nextFlood[door.from] = clamp(a + (avg - a) * 0.2, 0, 1);
      nextFlood[door.to] = clamp(b + (avg - b) * 0.2, 0, 1);
    }
  }

  const ship = world.ship;
  ship.flooding = nextFlood;
  ship.doors = Object.fromEntries(doors.map((d) => [d.id, {
    state: d.state,
    flooded: nextFlood[d.from] > 0.45 || nextFlood[d.to] > 0.45 ? 1 : 0,
    noise: d.open ? 0.25 : 0.1,
    integrity: d.integrity,
  }]));

  const activeCompartment = shipCompartmentForPosition(ship.position || ship.worldPosition, world)?.id || 'mess';
  ship.scene = {
    ...(ship.scene || {}),
    mode: 'interior',
    activeCompartment,
    flooding: nextFlood,
    doors,
    visibility: shipVisibilityForAgent(
      agents.find((a) => a.alive && a.onShip && (a.shipCompartment === activeCompartment || shipCompartmentForPosition(a.position, world)?.id === activeCompartment)) || agents.find((a) => a.alive && a.onShip) || null,
      world,
      agents
    ),
    sounds: shipAudibleSources(world, agents),
    meta: {
      power: ship.power || null,
      fire: ship.fire || null,
      mutiny: world?.mutiny || null,
      evidenceCount: Array.isArray(world?.evidence) ? world.evidence.length : 0,
    },
  };
  ship.compartments = buildShipCompartments(world);
  return ship.scene;
}


module.exports = {
  buildShipCompartments,
  buildShipDoors,
  buildShipAdjacency,
  shipPathfind,
  shipFloodingState,
  shipVisibilityForAgent,
  shipAudibleSources,
  stepShipSystems,
  buildShipSceneState,
  compartmentOccupancy,
  defaultShipCompartmentForRole,
  buildShipSpawnPoints,
  normalizeShipOccupant,
  shipCompartmentForPosition,
  shipInteriorBounds,
  shipInteriorCenter,
  shipInteriorSize,
  shipLaneYForAgent,
  shipWorldPosition,
};
