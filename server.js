const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const { buildWorldSot: buildWorldSotCore } = require('./lib/world_sot');
const { buildCoordinatedSot } = require('./lib/sot_coordinator');
const shipInterior = require('./lib/ship_interior');
const normalizeShipOccupant = (entity, world = appState?.world) => shipInterior.normalizeShipOccupant(entity, world);
const { augmentMovementPrompt, ensurePromptShape } = require('./lib/prompt_helpers');
const { buildTilePath: buildTilePathCore, plannedStepToward: plannedStepTowardCore } = require('./lib/movement_core');
const goalMemory = require('./lib/goal_memory');
const ecs = require('./lib/ecs');
const actionCatalog = require('./lib/action_catalog');
const shipMeta = require('./lib/ship_meta_systems');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const AUTOSAVE_PATH = path.join(ROOT, '.arctic_autosave.json');
const AUTOSAVE_SCHEMA_VERSION = 2;

const PORT = Number(process.env.PORT || 3000);
const TICK_MS = 33; // ~30 TPS world tick, frontend renders at screen refresh
const SIM_PACE = 0.55; // slows execution/movement without changing the render cadence
const MAP_SCALE = 4;
const WORLD_W = 24 * MAP_SCALE;
const WORLD_H = 16 * MAP_SCALE;
const MIN_SLOTS = 2;
const MAX_SLOTS = 8;
const DEFAULT_DECISION_MIN = 26000;
const DEFAULT_DECISION_MAX = 56000;
const HUMAN_MOVE_STEP_MS = 240;
const HUMAN_MOVE_BUDGET = 2;
const MAX_SPEECH_HISTORY = 40;
const MAX_EVENT_HISTORY = 200;
const MAX_MEMORY = 20;
const AI_TIMEOUT_MS = 12000;
const AI_REQUEST_GAP_MS = 4000; // global cap: at most one outbound AI request every 4s
const AI_REQUEST_GATE = {
  nextAvailableAt: 0,
  inFlight: false,
};

const PROFessions = ['Captain', 'Doctor', 'Engineer', 'Cook', 'Hunter', 'Navigator', 'Pastor', 'Royal Marine'];

const ZONES_BASE = {
  ship: { x: 12, y: 8, radius: 2 },
  forest: { x: 4, y: 11, radius: 3 },
  glacier: { x: 20, y: 3, radius: 3 },
  cave: { x: 19, y: 12, radius: 2 },
  prison: { x: 12, y: 13, radius: 1 },
  camp: { x: 6, y: 4, radius: 2 },
  north_camp: { x: 12, y: 1, radius: 1 },
  south_dock: { x: 12, y: 15, radius: 1 },
};

const ZONES = Object.fromEntries(
  Object.entries(ZONES_BASE).map(([name, zone]) => [
    name,
    {
      x: zone.x * MAP_SCALE,
      y: zone.y * MAP_SCALE,
      radius: Math.max(2, Math.round(zone.radius * MAP_SCALE * 0.85)),
    },
  ])
);

const BOULDERS_BASE = [
  [8, 7], [9, 7], [10, 7],
  [14, 9], [15, 9], [16, 9],
  [5, 6], [5, 7],
  [18, 6], [18, 7],
  [11, 12], [13, 12],
];

const BOULDERS = BOULDERS_BASE.map(([x, y]) => [x * MAP_SCALE, y * MAP_SCALE]);


const TERRAIN_VERSION = 3;
const WATER_BODIES = [
  { x: 48, y: 30, rx: 26, ry: 16 },
  { x: 22, y: 18, rx: 12, ry: 8 },
  { x: 74, y: 12, rx: 14, ry: 10 },
  { x: 70, y: 52, rx: 18, ry: 8 },
  { x: 16, y: 50, rx: 12, ry: 7 },
];

const LAND_MASSES = [
  { x: 48, y: 32, rx: 11, ry: 7 },
  { x: 18, y: 44, rx: 13, ry: 9 },
  { x: 78, y: 12, rx: 12, ry: 9 },
  { x: 76, y: 44, rx: 10, ry: 8 },
  { x: 24, y: 16, rx: 10, ry: 7 },
  { x: 48, y: 4, rx: 8, ry: 5 },
  { x: 48, y: 60, rx: 9, ry: 5 },
];

function pointInEllipse(x, y, cx, cy, rx, ry) {
  const dx = (x - cx) / Math.max(1, rx);
  const dy = (y - cy) / Math.max(1, ry);
  return (dx * dx) + (dy * dy) <= 1;
}

function terrainCodeFor(x, y) {
  if (x < 1 || y < 1 || x >= WORLD_W - 1 || y >= WORLD_H - 1) return '~';
  if (WATER_BODIES.some((lake) => pointInEllipse(x, y, lake.x, lake.y, lake.rx, lake.ry))) return '~';
  if (!LAND_MASSES.some((land) => pointInEllipse(x, y, land.x, land.y, land.rx, land.ry))) return '~';
  if (dist({ x, y }, ZONES.ship) <= ZONES.ship.radius) return 's';
  if (dist({ x, y }, ZONES.forest) <= ZONES.forest.radius) return 'f';
  if (dist({ x, y }, ZONES.glacier) <= ZONES.glacier.radius) return 'g';
  if (dist({ x, y }, ZONES.cave) <= ZONES.cave.radius) return 'd';
  if (dist({ x, y }, ZONES.prison) <= ZONES.prison.radius) return 'p';
  if (dist({ x, y }, ZONES.camp) <= ZONES.camp.radius) return 'c';
  if (dist({ x, y }, ZONES.north_camp) <= ZONES.north_camp.radius) return 'n';
  if (dist({ x, y }, ZONES.south_dock) <= ZONES.south_dock.radius) return 'k';
  if (y <= Math.round(WORLD_H * 0.20)) return 'n';
  if (y >= Math.round(WORLD_H * 0.78)) return 'k';
  if (x <= Math.round(WORLD_W * 0.33)) return 'f';
  if (x >= Math.round(WORLD_W * 0.66)) return 'g';
  return 'o';
}

function buildTerrainRows() {
  const rows = [];
  for (let y = 0; y < WORLD_H; y += 1) {
    let row = '';
    for (let x = 0; x < WORLD_W; x += 1) row += terrainCodeFor(x, y);
    rows.push(row);
  }
  return rows;
}

const TERRAIN_ROWS = buildTerrainRows();

function terrainCodeAt(x, y) {
  return TERRAIN_ROWS[y]?.[x] || 'o';
}

function terrainBiomeAt(x, y) {
  const code = terrainCodeAt(x, y);
  return ({
    '~': 'water',
    s: 'ship',
    f: 'forest',
    g: 'glacier',
    d: 'cave',
    p: 'prison',
    c: 'camp',
    n: 'north_camp',
    k: 'dock',
    o: 'snow',
  })[code] || 'snow';
}

function canOccupyTile(entity, x, y, opts = {}) {
  if (!inBounds(x, y)) return false;
  // Ship interior: boulders are overworld obstacles. Only check bounds.
  if (entity?.onShip) return isShipInteriorTile(x, y, opts.world || appState.world);
  // Overworld: boulders block movement
  if (tileBlocked(x, y)) return false;
  const code = terrainCodeAt(x, y);
  const allowWater = Boolean(opts.allowWater || opts.mode === 'swim' || entity?.canSwim || entity?.swimming);
  if (code === '~' && !allowWater) return false;
  return true;
}

function isWaterTile(x, y) {
  return terrainCodeAt(x, y) === '~';
}

function biomeAtPoint(pos) {
  if (!pos) return 'snow';
  return terrainBiomeAt(Math.round(pos.x), Math.round(pos.y));
}

function biomeCountsAround(pos, radius = 2) {
  const counts = {};
  if (!pos) return counts;
  for (let y = Math.max(0, Math.floor(pos.y - radius)); y <= Math.min(WORLD_H - 1, Math.ceil(pos.y + radius)); y += 1) {
    for (let x = Math.max(0, Math.floor(pos.x - radius)); x <= Math.min(WORLD_W - 1, Math.ceil(pos.x + radius)); x += 1) {
      if (Math.hypot(x - pos.x, y - pos.y) > radius + 0.4) continue;
      const biome = terrainBiomeAt(x, y);
      counts[biome] = (counts[biome] || 0) + 1;
    }
  }
  return counts;
}


function shipWorldPosition(world = appState.world) {
  return shipInterior.shipWorldPosition(world);
}

function shipInteriorCenter(world = appState.world) {
  return shipInterior.shipInteriorCenter(world);
}

function shipInteriorBounds(world = appState.world) {
  return shipInterior.shipInteriorBounds(world);
}

function isShipInteriorTile(x, y, world = appState.world) {
  const b = shipInteriorBounds(world);
  return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY;
}

function buildShipCompartments(world = appState.world) {
  return shipInterior.buildShipCompartments(world);
}

function defaultShipCompartmentForRole(agent) {
  return shipInterior.defaultShipCompartmentForRole(agent);
}

function shipCompartmentForPosition(pos, world = appState.world) {
  return shipInterior.shipCompartmentForPosition(pos, world);
}

function shipLaneYForAgent(entity, world = appState.world) {
  return shipInterior.shipLaneYForAgent(entity, world);
}

function isValidOverworldSpawnTile(x, y, shipPos = shipWorldPosition(appState.world)) {
  if (!inBounds(x, y)) return false;
  if (tileBlocked(x, y)) return false;
  if (terrainCodeAt(x, y) === '~') return false;
  if (shipPos && dist({ x, y }, shipPos) <= (ZONES.ship.radius + 3)) return false;
  return true;
}

function buildOverworldSpawnPoints(world = appState.world, totalAgents = 8) {
  const spawns = shipInterior.buildShipSpawnPoints(world, totalAgents);
  return spawns.map((spawn) => {
    const agent = { onShip: true, position: { x: spawn.x, y: spawn.y }, shipCompartment: spawn.shipCompartment || null };
    shipInterior.normalizeShipOccupant(agent, world);
    return {
      x: agent.position.x,
      y: agent.position.y,
      shipCompartment: agent.shipCompartment || spawn.shipCompartment || null,
      onShip: true,
    };
  });
}

function buildDefaultShipFoodCaches(world = appState.world) {
  const compartments = buildShipCompartments(world);
  const pick = (id, food, medicine = 0) => ({
    id: `cache_${id}`,
    compartment: id,
    revealed: false,
    contents: { food, medicine },
  });
  const ids = ['mess', 'cargo', 'infirmary', 'boiler'];
  const stash = [
    pick('mess', 5, 0),
    pick('cargo', 6, 0),
    pick('infirmary', 3, 1),
    pick('boiler', 4, 0),
  ].filter((item) => compartments.some((c) => c.id === item.compartment));
  return stash;
}

function sanitizeWorldForAutosave(world = {}) {
  const ship = world.ship
    ? {
        ...world.ship,
        scene: world.ship.scene
          ? {
              ...world.ship.scene,
            }
          : world.ship.scene,
      }
    : world.ship;
  if (ship?.scene) {
    delete ship.scene.visibility;
    delete ship.scene.sounds;
    delete ship.scene.graph;
  }
  const snapshot = {
    ...world,
    ship,
  };
  delete snapshot.ecs;
  delete snapshot.sot;
  return snapshot;
}

function sanitizeAgentForAutosave(agent = {}) {
  const position = agent.position ? { x: Number(agent.position.x), y: Number(agent.position.y) } : null;
  return {
    id: agent.id,
    name: agent.name,
    visualName: agent.visualName,
    nameSource: agent.nameSource,
    profession: agent.profession,
    role: agent.role,
    slotIndex: agent.slotIndex,
    provider: agent.provider,
    apiKey: '',
    model: agent.model,
    visualTag: agent.visualTag,
    memory: agent.memory,
    health: agent.health,
    hunger: agent.hunger,
    temperature: agent.temperature,
    stamina: agent.stamina,
    morale: agent.morale,
    alive: agent.alive,
    imprisoned: agent.imprisoned,
    poison: agent.poison,
    position,
    onShip: Boolean(agent.onShip),
    velocity: agent.velocity ? { ...agent.velocity } : null,
    carrying: agent.carrying,
    inventory: agent.inventory ? { ...agent.inventory } : null,
    currentAction: agent.currentAction,
    pendingDecisionAt: agent.pendingDecisionAt,
    nextDecisionAt: agent.nextDecisionAt,
    lastDecision: agent.lastDecision,
    lastSpeechAt: agent.lastSpeechAt,
    lastKnownTarget: agent.lastKnownTarget,
    traits: agent.traits ? { ...agent.traits } : null,
    crewRole: agent.crewRole ? { ...agent.crewRole } : null,
    trustBias: agent.trustBias,
    alertness: agent.alertness,
    fatigue: agent.fatigue,
    injury: agent.injury,
    discipline: agent.discipline,
    knownSites: Array.isArray(agent.knownSites) ? agent.knownSites.slice() : [],
    lastSeen: agent.lastSeen ? { ...agent.lastSeen } : null,
    stealth: agent.stealth,
    canSwim: agent.canSwim,
    swimming: agent.swimming,
    perceptionRadius: agent.perceptionRadius,
    shipCompartment: agent.shipCompartment || null,
    utility: agent.utility || null,
    goalSnapshot: agent.goalSnapshot || [],
    primaryGoal: agent.primaryGoal || null,
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeAutosaveConfig(config = {}, fallback = appState.config || loadInitialConfig()) {
  const normalized = normalizeConfigInput({
    server: { port: Number(config?.server?.port || fallback?.server?.port || PORT) },
    debugRevealRoles: Boolean(config?.debugRevealRoles ?? fallback?.debugRevealRoles),
    agentNames: Array.isArray(config?.agentNames) ? config.agentNames : fallback?.agentNames,
    computeSlots: Array.isArray(config?.computeSlots) ? config.computeSlots : fallback?.computeSlots,
  }, fallback);

  const existing = Array.isArray(appState.config?.computeSlots) ? appState.config.computeSlots : [];
  normalized.computeSlots = normalized.computeSlots.map((slot, index) => {
    const masked = !slot.api_key || String(slot.api_key).startsWith('•');
    if (masked && existing[index]?.api_key) {
      return { ...slot, api_key: existing[index].api_key };
    }
    return slot;
  });

  return normalized;
}

function sanitizeAutosaveAssignment(assignment = {}) {
  return {
    counts: Array.isArray(assignment.counts) ? assignment.counts.slice(0, MAX_SLOTS) : [],
    slotOfAgent: Array.isArray(assignment.slotOfAgent) ? assignment.slotOfAgent.slice(0, MAX_SLOTS) : [],
  };
}

function sanitizeAutosaveWorldForLoad(world = {}) {
  const normalized = normalizeWorldRuntime(isPlainObject(world) ? clone(world) : {});
  const ship = normalized.ship || {};
  const integrity = clamp(Number(ship.integrity ?? 100), 0, 100);
  const pressure = clamp(Number(ship.pressure ?? 0), 0, 1);
  const EPS = 0.001;

  if (integrity >= 99.5 && pressure <= EPS) {
    ship.flooding = {};
  } else if (isPlainObject(ship.flooding)) {
    ship.flooding = Object.fromEntries(
      Object.entries(ship.flooding)
        .map(([id, value]) => [id, clamp(Number(value) || 0, 0, 1)])
        .filter(([, value]) => value > EPS)
    );
  } else {
    ship.flooding = {};
  }

  normalized.ship = ship;
  return normalized;
}

function isRestorableAutosaveSnapshot(data) {
  return isPlainObject(data)
    && data.schemaVersion === AUTOSAVE_SCHEMA_VERSION
    && data.running === true
    && data.mode === 'live'
    && isPlainObject(data.world)
    && Array.isArray(data.agents);
}

function buildAutosaveSnapshot() {
  const computeSlots = Array.isArray(appState.config?.computeSlots)
    ? appState.config.computeSlots.map((s) => ({
        provider: s.provider,
        api_key: s.api_key || '',
        model: s.model,
        visual_name: s.visual_name || '',
      }))
    : [];
  return {
    schemaVersion: AUTOSAVE_SCHEMA_VERSION,
    savedAt: nowIso(),
    running: appState.running,
    mode: appState.mode,
    world: sanitizeWorldForAutosave(appState.world),
    agents: appState.agents.map((agent) => sanitizeAgentForAutosave(agent)),
    assignment: sanitizeAutosaveAssignment(appState.assignment),
    config: sanitizeAutosaveConfig({
      ...appState.config,
      computeSlots,
    }),
  };
}

function normalizeAutosaveAgents(agents = []) {
  return Array.isArray(agents) ? agents.map((agent) => normalizeAgentRuntime(agent)) : [];
}

function shipSceneGraph(world = appState.world, agents = appState.agents, focusAgent = null) {
  return shipInterior.buildShipSceneState(world, agents, focusAgent);
}

function emitShipEvidence(type, text, data = {}) {
  const entry = shipMeta.recordEvidence(appState.world, appState.agents, {
    type,
    text,
    ...data,
  });

  if (!entry) return null;

  for (const witness of entry.witnesses || []) {
    const agent = appState.agents.find((a) => a.id === witness.id && a.alive);
    if (!agent) continue;
    addMemory(agent, `Witnessed ${entry.type}: ${entry.text}`, `evidence:${entry.type}`);
    if (entry.agentId && entry.agentId !== agent.id) {
      adjustSuspicion(agent, entry.agentId, clamp(entry.severity * 0.12, 0.02, 0.18));
      adjustRelationship(agent, entry.agentId, -clamp(entry.severity * 0.06, 0.01, 0.12));
    }
    if (entry.targetId && entry.targetId !== agent.id) {
      adjustSuspicion(agent, entry.targetId, clamp(entry.severity * 0.08, 0.01, 0.14));
    }
  }

  return entry;
}

function shipMetaSnapshot(world = appState.world) {
  return shipMeta.summarizeShipMeta(world);
}

function localPresence(agent, radius = 8) {
  const origin = agent?.position;
  if (!origin) return { nearby: [], counts: {} };
  const nearby = appState.agents
    .filter((other) => other.alive && other.id !== agent.id && dist(origin, other.position) <= radius)
    .map((other) => ({
      id: other.id,
      name: other.name,
      profession: other.profession,
      role: other.role,
      distance: Number(dist(origin, other.position).toFixed(2)),
      direction: bearing(origin, other.position),
      imprisoned: other.imprisoned,
      alive: other.alive,
      action: other.currentAction || 'idle',
    }))
    .sort((a, b) => a.distance - b.distance);
  const counts = {
    allies: nearby.filter((n) => n.role !== 'traitor').length,
    hostiles: nearby.filter((n) => n.role === 'traitor').length,
    imprisoned: nearby.filter((n) => n.imprisoned).length,
    empty: Math.max(0, Math.round(Math.PI * radius * radius) - nearby.length),
  };
  return { nearby, counts };
}

function buildWorldSot(agent = null) {
  return buildCoordinatedSot({
    world: appState.world,
    agents: appState.agents,
    agent,
    position: agent?.position || appState.world?.ship?.position || { x: WORLD_W / 2, y: WORLD_H / 2 },
    route: Array.isArray(appState.world?.route) ? appState.world.route : [],
    expeditionSites: EXPEDITION_SITES,
    biomeAtPoint,
    biomeCountsAround,
    zoneLabelForPosition,
    tileBlocked,
    distFn: dist,
    routeDistance: 10,
  });
}

function movementCostForBiome(code, opts = {}) {
  if (code === '~') return opts.allowWater ? 3.5 : Infinity;
  const map = { o: 1.1, s: 1.05, c: 1.1, n: 1.15, k: 1.15, f: 1.3, g: 1.4, d: 1.25, p: 1.2 };
  return map[code] || 1.2;
}

function plannedStepToward(from, to, entity = null, opts = {}) {
  // When an agent is inside the ship, boulders (tileBlocked) are irrelevant.
  const blockedFn = entity?.onShip ? shipSafeTileBlocked : tileBlocked;
  return plannedStepTowardCore({
    from,
    to,
    entity,
    opts,
    inBounds,
    tileBlocked: blockedFn,
    terrainCodeAt,
    basicPathStepFallback: basicPathStep,
  });
}

const EXPEDITION_SITES_BASE = [
  { id: 'wreck', name: 'Wreck', x: 3, y: 13, radius: 2, kind: 'loot', loot: ['scrap', 'food'], threat: 0.25 },
  { id: 'cache', name: 'Supply Cache', x: 6, y: 4, radius: 2, kind: 'loot', loot: ['coal', 'food', 'medicine'], threat: 0.12 },
  { id: 'rift', name: 'Ice Rift', x: 19, y: 3, radius: 2, kind: 'hazard', loot: ['nitro'], threat: 0.45 },
  { id: 'grave', name: 'Gravefield', x: 17, y: 12, radius: 2, kind: 'intel', loot: ['relics', 'venom'], threat: 0.32 },
  { id: 'tower', name: 'Signal Tower', x: 12, y: 1, radius: 1, kind: 'intel', loot: ['scrap'], threat: 0.08 },
  { id: 'burrow', name: 'Burrow', x: 4, y: 11, radius: 2, kind: 'danger', loot: ['food'], threat: 0.5 },
];

const EXPEDITION_SITES = EXPEDITION_SITES_BASE.map((site) => ({
  ...site,
  x: site.x * MAP_SCALE,
  y: site.y * MAP_SCALE,
  radius: Math.max(2, Math.round(site.radius * MAP_SCALE * 0.85)),
}));

const FAUNA_BLUEPRINTS = [
  { kind: 'wolf', label: 'Wolf', speed: 0.8, threat: 0.16, pack: true, zones: ['forest', 'camp', 'north_camp'] },
  { kind: 'wolf', label: 'Wolf', speed: 0.75, threat: 0.16, pack: true, zones: ['forest', 'camp', 'north_camp'] },
  { kind: 'wolf', label: 'Wolf', speed: 0.7, threat: 0.14, pack: true, zones: ['forest', 'glacier'] },
  { kind: 'bear', label: 'Bear', speed: 0.5, threat: 0.3, pack: false, zones: ['glacier', 'cave'] },
];

function loadJson(file, fallback) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function saveJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function normalizeConfigInput(input, fallback = null) {
  const base = fallback ? clone(fallback) : loadInitialConfig();
  const source = input && typeof input === 'object' ? input : {};
  const cfg = { ...base, ...source };
  cfg.server = { port: Number(source.server?.port || base.server?.port || PORT) };
  cfg.debugRevealRoles = Boolean(source.debugRevealRoles ?? base.debugRevealRoles);
  cfg.agentNames = Array.isArray(source.agentNames)
    ? source.agentNames.slice(0, 8).map((name) => String(name || ''))
    : (Array.isArray(base.agentNames) ? base.agentNames.slice(0, 8) : ['', '', '', '', '', '', '', '']);
  const incomingSlots = Array.isArray(source.computeSlots) ? source.computeSlots : (Array.isArray(base.computeSlots) ? base.computeSlots : []);
  cfg.computeSlots = incomingSlots.slice(0, MAX_SLOTS).map((slot, idx) => ({
    provider: String(slot?.provider || '').trim().toLowerCase() || 'groq',
    api_key: String(slot?.api_key || '').trim(),
    model: String(slot?.model || '').trim() || String(base.computeSlots?.[idx]?.model || ''),
    visual_name: String(slot?.visual_name || '').trim() || `Slot ${idx + 1}`,
  }));
  while (cfg.computeSlots.length < MIN_SLOTS) {
    const idx = cfg.computeSlots.length;
    const defaults = base.computeSlots?.[idx] || { provider: 'groq', api_key: '', model: 'llama-3.1-70b-versatile', visual_name: `Slot ${idx + 1}` };
    cfg.computeSlots.push({
      provider: defaults.provider,
      api_key: defaults.api_key || '',
      model: defaults.model || 'llama-3.1-70b-versatile',
      visual_name: defaults.visual_name || `Slot ${idx + 1}`,
    });
  }
  cfg.computeSlots = cfg.computeSlots.slice(0, MAX_SLOTS);
  return cfg;
}

function persistConfigSnapshot(nextConfig) {
  const normalized = normalizeConfigInput(nextConfig, appState.config || loadInitialConfig());
  // Preserve existing api_keys if the incoming value is masked (frontend sends '••••••••')
  const existing = appState.config?.computeSlots || [];
  normalized.computeSlots = normalized.computeSlots.map((slot, i) => {
    const masked = !slot.api_key || slot.api_key.startsWith('•');
    if (masked && existing[i]?.api_key) {
      return { ...slot, api_key: existing[i].api_key };
    }
    return slot;
  });
  saveJson(CONFIG_PATH, normalized);
  appState.config = normalized;
  return normalized;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function uid(prefix = 'id') {
  return `${prefix}_${crypto.randomBytes(4).toString('hex')}`;
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function intRand(min, max) {
  return Math.floor(rand(min, max + 1));
}

function choice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

const NAME_PARTS = {
  first: {
    Captain: ['Aster', 'Mara', 'Kellan', 'Iris', 'Orin', 'Vera', 'Soren', 'Nia'],
    Doctor: ['Mira', 'Anya', 'Theo', 'Elian', 'Sana', 'Noa', 'Leif', 'Rune'],
    Engineer: ['Jax', 'Rin', 'Kei', 'Pavel', 'Lina', 'Ivo', 'Tess', 'Bo'],
    Cook: ['Bram', 'Mina', 'Caro', 'Eli', 'Suri', 'Otto', 'Nora', 'Vik'],
    Hunter: ['Rook', 'Bran', 'Lyra', 'Hale', 'Skye', 'Dax', 'Mira', 'Rey'],
    Navigator: ['Nola', 'Cian', 'Vega', 'Arlo', 'Sage', 'Tara', 'Rune', 'Niko'],
    Pastor: ['Eden', 'Sol', 'Lumen', 'Ariel', 'Milo', 'Clara', 'Bela', 'Oren'],
    'Royal Marine': ['Vale', 'Kade', 'Luz', 'Holt', 'Rhea', 'Cass', 'Juno', 'Eero'],
    default: ['Ari', 'Noel', 'Mira', 'Finn', 'Kai', 'Nova', 'Rowan', 'Nico'],
  },
  last: {
    Captain: ['Frost', 'North', 'Harbor', 'Stone', 'Keel', 'Vale'],
    Doctor: ['Vale', 'Mercer', 'Bloom', 'Quill', 'Hale', 'Morrow'],
    Engineer: ['Forge', 'Bolt', 'Circuit', 'Mason', 'River', 'Patch'],
    Cook: ['Broth', 'Spoon', 'Crumb', 'Salt', 'Cedar', 'Brew'],
    Hunter: ['Track', 'Flint', 'Pike', 'Warden', 'Thorn', 'Ridge'],
    Navigator: ['Star', 'Compass', 'Drift', 'Chart', 'Marrow', 'Wind'],
    Pastor: ['Grace', 'Mercy', 'Light', 'Haven', 'Truth', 'Ash'],
    'Royal Marine': ['Holt', 'Banner', 'Shield', 'Ward', 'Sable', 'Knight'],
    default: ['Frost', 'Vale', 'Quill', 'North', 'Ash', 'Drift'],
  },
};

function pickAgentName(agent, usedNames = new Set()) {
  const prof = String(agent?.profession || '').trim();
  const firstPool = NAME_PARTS.first[prof] || NAME_PARTS.first.default;
  const lastPool = NAME_PARTS.last[prof] || NAME_PARTS.last.default;
  const bias = [];
  const traitText = Array.isArray(agent?.traits)
    ? agent.traits.join(' ')
    : String(agent?.traits ?? '');
  if (agent?.role === 'traitor') bias.push(['Crow', 'Veil', 'Hollow', 'Grim']);
  if (traitText.includes('careful')) bias.push(['Hush', 'Trace', 'Quiet']);
  if (traitText.includes('aggressive')) bias.push(['Rake', 'Blaze', 'Edge']);
  if (traitText.includes('brilliant')) bias.push(['Prism', 'Bright', 'Cipher']);
  const first = choice(bias.flat().length ? bias.flat() : firstPool);
  let last = choice(lastPool);
  let name = `${first} ${last}`;
  let tries = 0;
  while (usedNames.has(name.toLowerCase()) && tries < 12) {
    last = choice(lastPool);
    name = `${first} ${last}`;
    tries += 1;
  }
  if (usedNames.has(name.toLowerCase())) {
    name = `${first} ${last} ${intRand(10, 99)}`;
  }
  usedNames.add(name.toLowerCase());
  return name;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function sign(n) {
  return n === 0 ? 0 : n > 0 ? 1 : -1;
}

let runtimeAppState = null;

function zoneCenter(name) {
  if (name === 'ship' && runtimeAppState?.world?.ship?.position) {
    return { ...runtimeAppState.world.ship.position };
  }
  const zone = ZONES[name];
  return zone ? { x: zone.x, y: zone.y } : null;
}

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function bearing(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const horiz = Math.abs(dx) < 0.5 ? '' : dx > 0 ? 'east' : 'west';
  const vert = Math.abs(dy) < 0.5 ? '' : dy > 0 ? 'south' : 'north';
  if (!horiz && !vert) return 'here';
  if (!horiz) return vert;
  if (!vert) return horiz;
  return `${vert}${horiz}`;
}

function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < WORLD_W && y < WORLD_H;
}

function tileBlocked(x, y) {
  return BOULDER_SET.has(`${x},${y}`);
}

const BOULDER_SET = new Set(BOULDERS.map(([x, y]) => `${x},${y}`));

function lineOfSight(a, b) {
  let x0 = a.x;
  let y0 = a.y;
  const x1 = b.x;
  const y1 = b.y;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (!(x0 === x1 && y0 === y1)) {
    if (!(x0 === a.x && y0 === a.y) && tileBlocked(x0, y0)) return false;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
    if (!inBounds(x0, y0)) return false;
  }
  return true;
}

function shortId(prefix = 'a') {
  return `${prefix}${Math.random().toString(16).slice(2, 6)}`;
}

function summarizeMemory(agent) {
  // Delegate to goal_memory for consistent full summary (includes hiddenGoals, utility).
  return goalMemory.summarizeMemory(agent);
}

function initMemory() {
  // Delegate to goal_memory to keep a single source of truth for memory shape.
  return goalMemory.initMemory();
}

function addMemory(agent, text, type = 'note', meta = {}) {
  if (!agent || !agent.memory || !Array.isArray(agent.memory.memories)) return null;
  const entry = { id: uid('mem'), ts: Date.now(), type, text: String(text || '').slice(0, 300), meta };
  agent.memory.memories.push(entry);
  while (agent.memory.memories.length > MAX_MEMORY) agent.memory.memories.shift();
  return entry;
}

function adjustSuspicion(agent, targetId, delta) {
  if (!targetId || targetId === agent.id) return;
  const current = agent.memory.suspicions[targetId] || 0;
  agent.memory.suspicions[targetId] = clamp(current + delta, 0, 1);
}

function adjustRelationship(agent, targetId, delta) {
  if (!targetId || targetId === agent.id) return;
  const current = agent.memory.relationships[targetId] || 0;
  agent.memory.relationships[targetId] = clamp(current + delta, -1, 1);
}

function ensureGoals(agent) {
  // Delegate to goal_memory for full goal initialization (traitor hidden goals, world-reactive goals).
  goalMemory.ensureGoals(agent, appState.world || {}, {});
}

function professionTraits(profession) {
  const map = {
    Captain: { repair: 1.2, talk: 1.15, suspicion: 0.9 },
    Doctor: { heal: 1.3, talk: 1.0, suspicion: 0.95 },
    Engineer: { repair: 1.35, sabotage: 0.8, suspicion: 0.95 },
    Cook: { food: 1.3, talk: 1.05, suspicion: 1.0 },
    Hunter: { hunt: 1.35, attack: 1.15, suspicion: 1.0 },
    Navigator: { move: 1.1, talk: 1.1, suspicion: 0.95 },
    Pastor: { trust: 1.15, accusation: 0.9, suspicion: 0.9 },
    'Royal Marine': { attack: 1.25, arrest: 1.1, suspicion: 1.05 },
  };
  return map[profession] || {};
}


function otherAgentsWithin(agent, radius = 3) {
  return appState.agents.filter((other) => other.id !== agent.id && other.alive && dist(agent.position, other.position) <= radius);
}

function zoneLabelForPosition(pos) {
  const found = Object.entries(ZONES).find(([, z]) => dist(pos, z) <= z.radius);
  return found ? found[0] : null;
}

function currentZone(entity) {
  if (!entity) return null;
  if (entity.onShip) return 'ship';
  if (entity.zone && ZONES[entity.zone]) return entity.zone;
  const pos = entity.position || entity;
  if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') return null;
  return zoneLabelForPosition(pos);
}

function basicPathStep(from, to, entity = null, opts = {}) {
  if (!from || !to) return { x: 0, y: 0 };
  return plannedStepToward(from, to, entity, opts);
}

function moveAgent(agent, dx, dy) {
  if (!agent || !agent.alive || !agent.position) return false;
  const stepX = Math.max(-1, Math.min(1, Math.trunc(Number(dx || 0))));
  const stepY = Math.max(-1, Math.min(1, Math.trunc(Number(dy || 0))));
  if (stepX === 0 && stepY === 0) return false;

  const next = {
    x: clamp(Math.round(agent.position.x + stepX), 0, WORLD_W - 1),
    y: clamp(Math.round(agent.position.y + stepY), 0, WORLD_H - 1),
  };
  if (next.x === agent.position.x && next.y === agent.position.y) return false;

  const targetCode = terrainCodeAt(next.x, next.y);
  const allowWater = Boolean(agent.canSwim || agent.swimming || targetCode === '~');
  if (!canOccupyTile(agent, next.x, next.y, { allowWater })) return false;

  const previousZone = currentZone(agent);
  const previousBiome = biomeAtPoint(agent.position);
  agent.position = next;
  agent.lastSeen = { x: next.x, y: next.y, tick: appState?.world?.tick || 0 };

  const nowBiome = biomeAtPoint(next);
  agent.swimming = nowBiome === 'water';
  if (agent.swimming) {
    agent.stamina = clamp(agent.stamina - 0.8, 0, 100);
    if (previousBiome !== 'water') addMemory(agent, 'Entered the water and started swimming.', 'movement');
  }

  const site = siteForPosition(next);
  if (site) registerSiteDiscovery(agent, site, 'movement');

  const trap = trapAtPosition(next);
  if (trap) triggerTrap(agent, trap);

  const nextZone = currentZone(agent);
  if (nextZone && nextZone !== previousZone) {
    addMemory(agent, `Moved into ${nextZone}.`, 'movement');
  }
  return true;
}

function pickGoalTarget(agent) {
  const zone = currentZone(agent);
  const prefs = {
    Captain: ['ship', 'camp', 'south_dock'],
    Doctor: ['camp', 'ship', 'prison'],
    Engineer: ['ship', 'camp', 'south_dock'],
    Cook: ['camp', 'ship', 'forest'],
    Hunter: ['forest', 'glacier', 'cave'],
    Navigator: ['ship', 'south_dock', 'camp'],
    Pastor: ['camp', 'north_camp', 'ship'],
    'Royal Marine': ['ship', 'prison', 'camp'],
  };

  const goalHints = {
    warm: ['ship', 'camp'],
    trust: ['camp', 'ship'],
    threat: ['prison', 'ship'],
    identify: ['forest', 'glacier', 'cave', 'camp'],
    route: Array.isArray(appState?.world?.route) ? appState.world.route : [],
    survive: ['ship', 'camp', 'south_dock'],
  };

  const goals = Array.isArray(agent?.memory?.goals) ? agent.memory.goals : [];
  const scored = [];
  for (const goal of goals) {
    const lower = String(goal || '').toLowerCase();
    for (const [key, zones] of Object.entries(goalHints)) {
      if (lower.includes(key)) scored.push(...zones);
    }
  }
  scored.push(...(prefs[agent?.profession] || []));
  scored.push(...(appState?.world?.route || []));
  scored.push(...Object.keys(ZONES));

  const seen = new Set();
  for (const candidate of scored) {
    if (!candidate || seen.has(candidate) || candidate === zone || !ZONES[candidate]) continue;
    seen.add(candidate);
    return candidate;
  }

  return routeCenterName() || 'ship';
}

function resolveMovementTarget(agent, targetId) {
  if (!targetId) return null;
  const value = String(targetId);
  if (ZONES[value]) return zoneCenter(value);
  const shipComp = buildShipCompartments(appState.world).find((c) => c.id === value || c.name === value || c.label === value);
  if (shipComp) return { x: Math.round((shipComp.minX + shipComp.maxX) / 2), y: shipComp.laneY, shipCompartment: shipComp.id };
  if (value.startsWith('fauna:')) {
    const fauna = appState.world.faunaEntities.find((f) => f.id === value.slice(6) && f.alive);
    return fauna ? { ...fauna.position } : null;
  }
  const entity = targetFromId(value);
  if (entity && entity.alive && entity.position) return { ...entity.position };
  return null;
}

function setMovementIntent(agent, targetId, kind = 'move', budget = HUMAN_MOVE_BUDGET) {
  const target = resolveMovementTarget(agent, targetId);
  if (!target) return false;
  const now = Date.now();
  agent.movementIntent = {
    kind,
    targetId: targetId ? String(targetId) : null,
    target: { ...target },
    budget: Math.max(1, Math.min(HUMAN_MOVE_BUDGET, Math.floor(budget || 1))),
    updatedAt: now,
  };
  agent.moveBudget = agent.movementIntent.budget;
  agent.nextMoveAt = Math.min(agent.nextMoveAt || now, now);
  return true;
}

function refreshMovementIntent(agent) {
  if (!agent?.movementIntent) return null;
  const intent = agent.movementIntent;
  if (intent.targetId) {
    const target = resolveMovementTarget(agent, intent.targetId);
    if (target) intent.target = target;
  }
  return intent;
}

function advanceHumanMovement(agent) {
  if (!agent?.alive || !agent.movementIntent || agent.moveBudget <= 0) return false;
  const now = Date.now();
  if (agent.nextMoveAt && now < agent.nextMoveAt) return false;

  const intent = refreshMovementIntent(agent);
  if (!intent?.target) {
    agent.movementIntent = null;
    agent.moveBudget = 0;
    return false;
  }

  const target = intent.target;
  if (dist(agent.position, target) <= 1) {
    agent.movementIntent = null;
    agent.moveBudget = 0;
    return false;
  }

  const step = basicPathStep(agent.position, target, agent, { allowWater: Boolean(agent.canSwim || agent.swimming) });
  if (!step || (step.x === 0 && step.y === 0)) {
    agent.movementIntent = null;
    agent.moveBudget = 0;
    return false;
  }

  const moved = moveAgent(agent, step.x, step.y);
  if (!moved) {
    agent.nextMoveAt = now + HUMAN_MOVE_STEP_MS;
    return false;
  }

  agent.moveBudget -= 1;
  agent.nextMoveAt = now + HUMAN_MOVE_STEP_MS + Math.round(rand(-30, 70));
  if (agent.moveBudget <= 0) {
    agent.movementIntent = null;
  }
  return true;
}

function wakeNearbyAgents(position, reason, type = 'alert', radius = 6) {
  const center = position && typeof position.x === 'number' ? position : (position?.position || null);
  if (!center) return [];
  const awakened = [];
  for (const agent of appState.agents) {
    if (!agent.alive) continue;
    if (dist(agent.position, center) > radius) continue;
    agent.pendingDecisionAt = Date.now();
    agent.nextDecisionAt = Math.min(agent.nextDecisionAt || Infinity, Date.now() + 150);
    appState.queue.add(agent.id);
    if (reason) addMemory(agent, `Heard about ${reason}.`, type);
    awakened.push(agent.id);
  }
  return awakened;
}

function closestAgent(origin, predicate = () => true, radius = Infinity) {
  const center = origin && origin.position ? origin.position : origin;
  if (!center) return null;
  let best = null;
  let bestDist = Infinity;
  for (const agent of appState.agents) {
    if (!agent || !agent.alive) continue;
    if (typeof predicate === 'function' && !predicate(agent)) continue;
    const d = dist(center, agent.position);
    if (d > radius || d >= bestDist) continue;
    best = agent;
    bestDist = d;
  }
  return best;
}

const CRITICAL_EVENT_TYPES = new Set([
  'attack',
  'kill',
  'sabotage',
  'explosion',
  'trap',
  'corpse',
  'prison_break',
  'curse',
  'wolf',
  'bear',
  'fauna',
  'fire',
  'mutiny',
  'power',
  'radio',
  'end',
]);

function isCriticalEvent(type) {
  return CRITICAL_EVENT_TYPES.has(String(type || '').toLowerCase());
}

function routeCenterName() {
  const route = appState.world.route || ['south_dock', 'ship', 'camp', 'forest', 'glacier', 'cave', 'north_camp'];
  const idx = clamp(appState.world.routeIndex || 0, 0, route.length - 1);
  return route[idx];
}

function pushWorldAlert(type, text, data = {}) {
  const alert = createEvent(type, text, data);
  appState.world.alerts.push(alert);
  while (appState.world.alerts.length > 20) appState.world.alerts.shift();
  return alert;
}

function broadcastLocalRumor(sourceAgent, text, radius = 5, confidence = 0.45) {
  for (const other of otherAgentsWithin(sourceAgent, radius)) {
    const c = clamp(confidence - dist(sourceAgent.position, other.position) * 0.05, 0.05, 1);
    addMemory(other, `Rumor near ${sourceAgent.name}: ${text}`, 'rumor');
    adjustSuspicion(other, sourceAgent.id, c * 0.04);
  }
}

function socialEcho(actor, actionType, target = null) {
  for (const other of otherAgentsWithin(actor, 4.5)) {
    if (other.id === actor.id) continue;
    const sameZone = currentZone(other) === currentZone(actor);
    const delta = sameZone ? 0.04 : 0.02;
    if (actionType === 'attack' || actionType === 'sabotage' || actionType === 'steal') {
      adjustSuspicion(other, actor.id, delta * 4);
      adjustRelationship(other, actor.id, -delta * 3);
    } else if (actionType === 'share' || actionType === 'heal' || actionType === 'cook' || actionType === 'repair') {
      adjustRelationship(other, actor.id, delta * 4);
    } else if (actionType === 'accuse' && target) {
      adjustSuspicion(other, target.id, delta * 2);
    }
  }
}

function canCarryItem(item) {
  return ['coal', 'wood', 'food', 'nitro', 'medicine', 'scrap', 'venom', 'relics', 'weapon'].includes(item);
}

function pushLimited(arr, value, limit = 80) {
  arr.push(value);
  while (arr.length > limit) arr.shift();
}

function siteForPosition(pos) {
  for (const site of EXPEDITION_SITES) {
    if (dist(pos, site) <= site.radius + 0.35) return site;
  }
  return null;
}

function recordTrack(agent, kind = 'normal') {
  const world = appState.world;
  if (!world || !world.tracks) return;
  world.tracks.push({
    id: uid('trk'),
    ts: Date.now(),
    tick: world.tick,
    owner: agent.id,
    ownerName: agent.name,
    kind,
    position: { ...agent.position },
  });
  while (world.tracks.length > 100) world.tracks.shift();
}

function trapAtPosition(pos) {
  return appState.world.traps.find((t) => t.armed && dist(t.position, pos) <= (t.radius || 1.2));
}

function triggerTrap(agent, trap) {
  trap.armed = false;
  trap.triggeredAt = Date.now();
  pushEvent('trap', `${agent.name} triggered a trap.`, { position: { ...agent.position }, trap: trap.id, owner: trap.owner });
  addMemory(agent, 'Triggered a hidden trap.', 'trap');
  const dmg = Math.max(1, (trap.damage || 10) * 0.7);
  applyDamage(agent, dmg, trap.owner || 'trap', 'trap');
  agent.stamina = clamp(agent.stamina - 6, 0, 100);
  agent.morale = clamp(agent.morale - 0.06, 0, 1);
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeAgentRuntime(agent) {
  if (!agent) return agent;
  agent.knownSites = normalizeArray(agent.knownSites);
  const world = appState.world;
  const inferredInterior = Boolean(
    agent.shipCompartment
    || (agent.position && shipInterior.shipCompartmentForPosition(agent.position, world))
  );
  if (agent.onShip || inferredInterior) {
    agent.onShip = true;
    normalizeShipOccupant(agent, world);
  }
  if (!agent.onShip && agent.shipCompartment === 'overworld') agent.shipCompartment = null;
  return agent;
}

function normalizeWorldRuntime(world) {
  if (!world) return world;
  world.alerts = normalizeArray(world.alerts);
  world.rumors = normalizeArray(world.rumors);
  world.expedition = world.expedition || {};
  world.expedition.discovered = normalizeArray(world.expedition.discovered);
  world.corpses = normalizeArray(world.corpses);
  world.prisoners = normalizeArray(world.prisoners);
  world.traps = normalizeArray(world.traps);
  world.totems = normalizeArray(world.totems);
  world.tracks = normalizeArray(world.tracks);
  world.encounters = normalizeArray(world.encounters);
  world.events = normalizeArray(world.events);
  world.speeches = normalizeArray(world.speeches);
  world.expeditionSites = normalizeArray(world.expeditionSites);
  world.terrain = world.terrain || { version: TERRAIN_VERSION, rows: TERRAIN_ROWS };
  world.overworld = world.overworld || {
    route: Array.isArray(world.route) ? world.route.slice() : ['ship'],
    routeIndex: world.routeIndex ?? 0,
    voyageProgress: world.voyageProgress ?? 0,
    shipPosition: world.ship?.worldPosition ? { ...world.ship.worldPosition } : shipWorldPosition(world),
    landings: Array.isArray(world.landings) ? world.landings.slice() : ['south_dock', 'camp', 'forest', 'glacier', 'cave', 'north_camp', 'prison'],
    canDisembark: Boolean(world.ship?.canDisembark),
  };
  world.ship = world.ship || {};
  world.ship.interior = world.ship.interior || { width: 40, height: 14 };
  world.ship.compartments = Array.isArray(world.ship.compartments) && world.ship.compartments.length ? world.ship.compartments : buildShipCompartments(world);
  world.ship.caches = Array.isArray(world.ship.caches) && world.ship.caches.length ? world.ship.caches : buildDefaultShipFoodCaches(world);
  world.ship.scene = world.ship.scene || { mode: 'interior', activeCompartment: null };
  return world;
}

function registerSiteDiscovery(agent, site, via = 'observation') {
  if (!site) return;
  const knownSites = normalizeArray(agent.knownSites);
  if (knownSites !== agent.knownSites) agent.knownSites = knownSites;
  if (!knownSites.includes(site.id)) knownSites.push(site.id);
  addMemory(agent, `Discovered ${site.name} by ${via}.`, 'discovery');
  pushLimited(appState.world.alerts, {
    id: uid('alert'),
    ts: Date.now(),
    type: 'discovery',
    text: `${agent.name} discovered ${site.name}.`,
    data: { agent: agent.id, site: site.id },
  }, 20);
}

function createEncounter(kind, center, intensity = 0.5) {
  const encounter = {
    id: uid('enc'),
    ts: Date.now(),
    tick: appState.world.tick,
    kind,
    center: center ? { ...center } : null,
    intensity,
    active: true,
    ttl: intRand(25, 80),
  };
  appState.world.encounters.push(encounter);
  while (appState.world.encounters.length > 18) appState.world.encounters.shift();
  pushEvent('encounter', `${kind} encounter emerged.`, { position: center || ZONES.ship, kind });
  return encounter;
}

function resolveEncounter(agent) {
  const world = appState.world;
  let active = null;
  for (const enc of world.encounters) {
    if (!enc.active) continue;
    if (enc.center && dist(agent.position, enc.center) <= 6) {
      active = enc;
      break;
    }
  }
  if (!active) return null;
  if (active.kind === 'whiteout') {
    agent.morale = clamp(agent.morale - 0.03, 0, 1);
    agent.stamina = clamp(agent.stamina - 0.2, 0, 100);
  } else if (active.kind === 'wolf_pack' && dist(agent.position, active.center) <= 4) {
    if (Math.random() < 0.12) applyDamage(agent, 6 + Math.random() * 6, 'wolves', 'attack');
  } else if (active.kind === 'cave_in' && currentZone(agent) === 'cave') {
    if (Math.random() < 0.18) applyDamage(agent, 8 + Math.random() * 10, 'cave_in', 'hazard');
  } else if (active.kind === 'aurora' && Math.random() < 0.08) {
    agent.morale = clamp(agent.morale + 0.05, 0, 1);
  }
  return active;
}



function createWorld() {
  const shipWorldPosition = zoneCenter('ship') || { x: WORLD_W / 2, y: WORLD_H / 2 };
  const shipInteriorPosition = { ...shipWorldPosition };
  const route = ['south_dock', 'camp', 'ship', 'forest', 'glacier', 'cave', 'north_camp', 'south_dock'];
  const landings = ['south_dock', 'camp', 'forest', 'glacier', 'cave', 'north_camp', 'prison'];
  return {
    startedAt: Date.now(),
    tick: 0,
    day: 1,
    timeOfDay: 0.2,
    temperature: -12,
    storm: 0.15,
    route,
    routeIndex: 2,
    voyageProgress: 0,
    alerts: [],
    rumors: [],
    expedition: { discovered: [], active: null, lastSiteTick: 0, lastEncounterTick: 0 },
    overworld: {
      route: route.slice(),
      routeIndex: 2,
      voyageProgress: 0,
      shipPosition: { ...shipWorldPosition },
      landings: landings.slice(),
      canDisembark: false,
    },
    ship: {
      fuel: 28,
      boilerHeat: 52,
      integrity: 100,
      helmHealth: 100,
      heading: 0.2,
      prisonCapacity: 2,
      pressure: 0,
      anchor: 1,
      speed: 0.3,
      course: 0.2,
      hullStress: 0,
      position: { ...shipInteriorPosition },
      worldPosition: { ...shipWorldPosition },
      radius: ZONES.ship.radius,
      canDisembark: false,
      interior: { width: 40, height: 14 },
      systems: { boiler: 100, helm: 100, hull: 100, deck: 100, cargo: 100, brig: 100 },
      doors: Object.fromEntries(shipInterior.buildShipDoors({ ship: { position: shipInteriorPosition, interior: { width: 40, height: 14 } } }).map((d) => [d.id, { state: d.state, flooded: 0, noise: 0, integrity: 100 }])),
      flooding: {},
      compartments: buildShipCompartments({ ship: { position: shipInteriorPosition, interior: { width: 40, height: 14 } } }),
      caches: buildDefaultShipFoodCaches({ ship: { position: shipInteriorPosition, interior: { width: 40, height: 14 } } }),
      scene: { mode: 'interior', activeCompartment: 'mess', flooding: {}, doors: [], visibility: null, sounds: [] },
    },
    resources: {
      coal: 18,
      wood: 20,
      food: 16,
      nitro: 3,
      medicine: 2,
      scrap: 8,
      venom: 1,
      relics: 0,
    },
    fauna: {
      wolves: 3,
      bears: 1,
    },
    map: {
      width: WORLD_W,
      height: WORLD_H,
      scale: MAP_SCALE,
    },
    terrain: {
      version: TERRAIN_VERSION,
      rows: TERRAIN_ROWS,
    },
    waterTiles: TERRAIN_ROWS.reduce((count, row) => count + String(row).split('').filter((c) => c === '~').length, 0),
    zones: ZONES,
    boulders: BOULDERS.map(([x, y]) => ({ x, y })),
    expeditionSites: EXPEDITION_SITES.map((site) => ({ ...site })),
    events: [],
    speeches: [],
    corpses: [],
    prisoners: [],
    traps: [],
    totems: [],
    tracks: [],
    encounters: [],
    weatherLabel: 'calm',
    phase: 'lobby',
    sot: null,
    crewCohesion: 0.55,
    terror: 0.08,
    signalStrength: 0,
    matchId: uid('match'),
    landings: landings.slice(),
    faunaEntities: createFaunaEntities(),
  };
}


function createAgentsFromConfig(config) {
  const professions = shuffle(PROFessions);
  const spawnPoints = shuffle(buildOverworldSpawnPoints(appState.world, 8));
  const roles = shuffle(['innocent', 'innocent', 'innocent', 'innocent', 'innocent', 'innocent', 'traitor', 'traitor']);
  const agents = [];
  const slots = config.computeSlots;
  // Shuffle slot assignment so agents don't always map to the same provider by position
  const assignment = distributeAgentsToSlots(slots, 8);
  const shuffledSlotOfAgent = shuffle(assignment.slotOfAgent.slice());
  const names = Array.isArray(config.agentNames) ? config.agentNames.slice(0, 8) : [];
  const usedNames = new Set();
  const resolvedNames = [];
  // Randomize which agent indices get a knife
  const knifeIndices = new Set(shuffle([0, 1, 2, 3, 4, 5, 6, 7]).slice(0, 3));

  for (let i = 0; i < 8; i++) {
    const slotIndex = shuffledSlotOfAgent[i];
    const slot = slots[slotIndex];
    const preset = String(names[i] || '').trim();
    const pendingAgent = { profession: professions[i], role: roles[i], traits: professionTraits(professions[i]) };
    const chosenName = preset || pickAgentName(pendingAgent, usedNames);
    resolvedNames.push(chosenName);
    agents.push({
      id: `player_${i + 1}`,
      name: chosenName,
      visualName: chosenName,
      nameSource: preset ? 'config' : 'self',
      profession: professions[i],
      role: roles[i],
      slotIndex,
      provider: slot.provider,
      apiKey: slot.api_key,
      model: slot.model,
      visualTag: slot.visual_name || '',
      memory: initMemory(),
      health: 100,
      hunger: 0,
      temperature: 100,
      stamina: 100,
      morale: 0.5,
      alive: true,
      imprisoned: false,
      poison: 0,
      position: { x: spawnPoints[i].x, y: spawnPoints[i].y },
      onShip: true,
      velocity: { x: 0, y: 0 },
      carrying: null,
      inventory: {
        coal: 0,
        wood: 0,
        food: 1,
        nitro: 0,
        medicine: 0,
        scrap: 0,
        venom: 0,
        relics: 0,
        weapon: knifeIndices.has(i) ? 'knife' : null,
      },
      currentAction: 'idle',
      pendingDecisionAt: 0,
      nextDecisionAt: 0,
      lastDecision: null,
      lastSpeechAt: 0,
      lastKnownTarget: null,
      localSnapshot: null,
      traits: professionTraits(professions[i]),
      crewRole: shipMeta.buildCrewRoleProfile({ profession: professions[i], role: roles[i] }),
      decisionLock: false,
      movementIntent: null,
      moveBudget: 0,
      nextMoveAt: 0,
      turnFocus: 0,
      trustBias: rand(-0.15, 0.15),
      alertness: rand(0.35, 0.85),
      fatigue: rand(0.1, 0.4),
      injury: 0,
      discipline: rand(0.3, 0.9),
      knownSites: [],
      lastSeen: { x: spawnPoints[i].x, y: spawnPoints[i].y, tick: 0 },
      shipCompartment: spawnPoints[i].shipCompartment || null,
      stealth: rand(0.2, 0.8),
      canSwim: true,
      swimming: false,
      perceptionRadius: rand(6, 10),
    });
    shipInterior.normalizeShipOccupant(agents[i], appState.world);
    ensureGoals(agents[i]);
    addMemory(agents[i], `Spawned inside the ship at the expedition start.`, 'spawn');
  }

  if (appState?.config) appState.config.agentNames = resolvedNames;
  return { agents, assignment: { counts: assignment.counts, slotOfAgent: shuffledSlotOfAgent }, resolvedNames };
}


function distributeAgentsToSlots(slots, totalAgents) {
  const n = slots.length;
  const base = Math.floor(totalAgents / n);
  const rem = totalAgents % n;
  const counts = slots.map((_, i) => base + (i < rem ? 1 : 0));
  const slotOfAgent = [];
  counts.forEach((count, slotIndex) => {
    for (let i = 0; i < count; i++) slotOfAgent.push(slotIndex);
  });
  return { counts, slotOfAgent };
}

function createEvent(type, text, data = {}) {
  return {
    id: uid('evt'),
    ts: Date.now(),
    tick: appState.world.tick,
    type,
    text,
    data,
  };
}

function pushEvent(type, text, data = {}) {
  const event = createEvent(type, text, data);
  appState.world.events.push(event);
  while (appState.world.events.length > MAX_EVENT_HISTORY) appState.world.events.shift();
  return event;
}

function pushSpeech(agent, speech, action = 'speaks') {
  if (!speech || !speech.trim()) return null;
  const event = {
    id: uid('sp'),
    ts: Date.now(),
    tick: appState.world.tick,
    speaker: agent.id,
    speakerName: agent.name,
    profession: agent.profession,
    role: agent.role,
    speech,
    action,
    position: { ...agent.position },
  };
  appState.world.speeches.push(event);
  while (appState.world.speeches.length > MAX_SPEECH_HISTORY) appState.world.speeches.shift();
  pushEvent('speech', `${agent.name} says: ${speech}`, { speaker: agent.id });
  return event;
}

function sampleVisibleEntities(agent, agents) {
  const result = [];
  for (const other of agents) {
    if (other.id === agent.id || !other.alive) continue;
    const d = dist(agent.position, other.position);
    if (d > 6.5) continue;
    const los = lineOfSight(agent.position, other.position);
    if (!los && d > 3.5) continue;
    result.push({
      id: other.id,
      name: other.name,
      profession: other.profession,
      distance: Number(d.toFixed(2)),
      bearing: bearing(agent.position, other.position),
      line_of_sight: los,
      moving: other.velocity.x !== 0 || other.velocity.y !== 0,
      carrying: other.carrying || other.inventory.weapon || null,
      current_action: other.currentAction,
      health_hint: other.health < 100 ? 'injured' : 'healthy',
      imprisoned: other.imprisoned,
    });
  }
  return result;
}

function clarityFor(listener, speaker, text) {
  const d = dist(listener.position, speaker.position);
  const base = clamp(1 - d / 12, 0, 1);
  const stormPenalty = appState.world.storm * 0.35;
  const ifLOS = lineOfSight(listener.position, speaker.position) ? 1 : 0.7;
  const lengthPenalty = clamp(text.length / 120, 0, 1) * 0.1;
  return clamp(base * ifLOS - stormPenalty - lengthPenalty + 0.2, 0.05, 1);
}

function degradeSpeech(text, clarity) {
  if (clarity >= 0.95) return text;
  const tokens = text.split(/(\s+)/);
  const out = [];
  for (const token of tokens) {
    if (/^\s+$/.test(token)) {
      out.push(token);
      continue;
    }
    if (Math.random() > clarity) continue;
    let t = token;
    if (clarity < 0.7 && token.length > 4) {
      const cut = Math.max(2, Math.floor(token.length * clarity));
      t = token.slice(0, cut);
      if (clarity < 0.45) t += '...';
    }
    out.push(t);
  }
  const joined = out.join('').replace(/\s+/g, ' ').trim();
  return joined || '...';
}

function localEventsFor(agent) {
  const events = [];
  for (const e of appState.world.events.slice(-20)) {
    const pos = e.data?.position;
    if (!pos) continue;
    if (dist(agent.position, pos) > 5) continue;
    events.push({
      id: e.id,
      type: e.type,
      text: e.text,
      tick: e.tick,
    });
  }
  return events;
}

function nearbySpeeches(agent) {
  const heard = [];
  for (const s of appState.world.speeches.slice(-16)) {
    const speaker = appState.agents.find((a) => a.id === s.speaker);
    if (!speaker || !speaker.alive) continue;
    const c = clarityFor(agent, speaker, s.speech);
    if (c < 0.15) continue;
    heard.push({
      speaker: s.speaker,
      speakerName: s.speakerName,
      fragment: degradeSpeech(s.speech, c),
      confidence: Number(c.toFixed(2)),
      raw: c > 0.9 ? s.speech : undefined,
    });
  }
  return heard.slice(-8);
}


function computeEnvironmentForAgent(agent) {
  const world = appState.world;
  const zoneEntry = Object.entries(ZONES).find(([, z]) => dist(agent.position, z) <= z.radius);
  const zoneName = zoneEntry ? zoneEntry[0] : null;
  const biome = biomeAtPoint(agent.position);
  const neighborhood = biomeCountsAround(agent.position, 2);
  const presence = localPresence(agent, 8);
  const nearbyCorpses = world.corpses.filter((c) => dist(agent.position, c.position) <= 6).slice(-4);
  const shipPos = shipWorldPosition(world);
  const visibleFauna = (world.faunaEntities || []).filter((f) => f.active !== false && dist(agent.position, f.position) <= 12);
  const localSites = EXPEDITION_SITES
    .filter((site) => dist(agent.position, site) <= 10)
    .map((site) => ({
      id: site.id,
      name: site.name,
      kind: site.kind,
      position: { x: site.x, y: site.y },
      distance: Number(dist(agent.position, site).toFixed(2)),
      discovered: world.expedition.discovered.includes(site.id),
      threat: site.threat,
    }))
    .sort((a, b) => a.distance - b.distance);

  const terrainWindow = [];
  const radius = 2;
  for (let y = Math.max(0, Math.floor(agent.position.y - radius)); y <= Math.min(WORLD_H - 1, Math.ceil(agent.position.y + radius)); y += 1) {
    const row = [];
    for (let x = Math.max(0, Math.floor(agent.position.x - radius)); x <= Math.min(WORLD_W - 1, Math.ceil(agent.position.x + radius)); x += 1) {
      row.push({
        x,
        y,
        biome: terrainBiomeAt(x, y),
        blocked: tileBlocked(x, y),
        water: terrainCodeAt(x, y) === '~',
        distance: Number(dist(agent.position, { x, y }).toFixed(2)),
      });
    }
    terrainWindow.push(row);
  }

  const obs = {
    position: { ...agent.position },
    zone: agent.onShip ? 'ship' : zoneName,
    biome,
    neighborhood,
    terrain_window: terrainWindow,
    temperature: world.temperature - Math.floor(agent.position.y / 4),
    hunger: Number(agent.hunger.toFixed(1)),
    health: Number(agent.health.toFixed(1)),
    stamina: Number(agent.stamina.toFixed(1)),
    morale: Number(agent.morale.toFixed(2)),
    visible_entities: sampleVisibleEntities(agent, appState.agents),
    heard_messages: nearbySpeeches(agent),
    local_events: localEventsFor(agent),
    inventory: { ...agent.inventory },
    carrying: agent.carrying,
    presence,
    ship: {
      position: { ...shipPos },
      distance: Number(dist(agent.position, shipPos).toFixed(2)),
      boilerHeat: world.ship.boilerHeat,
      integrity: world.ship.integrity,
      fuel: world.ship.fuel,
      helmHealth: world.ship.helmHealth,
      heading: world.ship.heading,
      route: world.route,
      routeIndex: world.routeIndex,
      voyageProgress: Number((world.voyageProgress ?? 0).toFixed(2)),
      pressure: Number(world.ship.pressure.toFixed(2)),
      prisonCapacity: world.ship.prisonCapacity,
      anchor: world.ship.anchor,
      speed: world.ship.speed,
      systems: { ...world.ship.systems },
      canDisembark: Boolean(world.ship.canDisembark),
    },
    ship_state: {
      position: { ...world.ship.position },
      worldPosition: { ...world.ship.worldPosition },
      interior: { ...(world.ship.interior || {}) },
      systems: { ...world.ship.systems },
      canDisembark: Boolean(world.ship.canDisembark),
      heading: world.ship.heading,
    },
    overworld_state: {
      route: Array.isArray(world.overworld?.route) ? world.overworld.route.slice() : [],
      routeIndex: world.overworld?.routeIndex ?? 0,
      voyageProgress: Number(world.overworld?.voyageProgress ?? 0),
      shipPosition: world.overworld?.shipPosition ? { ...world.overworld.shipPosition } : null,
      landings: Array.isArray(world.overworld?.landings) ? world.overworld.landings.slice() : [],
      canDisembark: Boolean(world.overworld?.canDisembark),
    },
    weather: {
      storm: Number(world.storm.toFixed(2)),
      phase: world.phase,
      label: world.weatherLabel,
      temperature: world.temperature,
      terror: Number(world.terror.toFixed(2)),
    },
    resources: { ...world.resources },
    fauna: { ...world.fauna },
    fauna_entities: visibleFauna.map((f) => ({
      id: f.id,
      kind: f.kind,
      label: f.label,
      position: { ...f.position },
      alive: f.alive,
      active: f.active !== false,
      hunger: Number(f.hunger.toFixed(2)),
      state: f.state || 'idle',
      threat: f.aggression,
      target: f.target,
    })),
    prisoners: world.prisoners.slice(),
    corpses: nearbyCorpses,
    traps: world.traps.filter((t) => dist(agent.position, t.position) <= 8).slice(-6),
    totems: world.totems.filter((t) => dist(agent.position, t.position) <= 8).slice(-6),
    tracks: world.tracks.filter((t) => dist(agent.position, t.position) <= 6).slice(-12),
    encounters: world.encounters.filter((e) => e.active),
    sites: localSites,
    alerts: world.alerts.slice(-6),
    canDisembark: Boolean(world.ship.canDisembark && agent.onShip),
    onShip: Boolean(agent.onShip),
    nearbyCrew: appState.agents.filter((a) => a.alive && a.id !== agent.id && dist(a.position, agent.position) <= 6).slice(0, 5).map((a) => ({ id: a.id, name: a.name, action: a.currentAction, imprisoned: a.imprisoned })),
    absences: appState.agents
      .filter((a) => a.alive && a.id !== agent.id && dist(a.position, agent.position) > 8)
      .slice(0, 8)
      .map((a) => ({ id: a.id, name: a.name, lastSeenTick: a.lastSeen?.tick ?? 0, distance: Number(dist(agent.position, a.position).toFixed(2)) })),
  };
  return obs;
}


function localFallbackDecision(agent, obs) {
  return null;
}

function jsonRepair(text) {
  if (!text) return null;
  const trimmed = text.trim();
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  const candidate = trimmed.slice(first, last + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

async function providerProbe(slot) {
  const payload = {
    messages: [
      { role: 'system', content: 'Return only one JSON object: {"ok":true}.' },
      { role: 'user', content: 'ping' },
    ],
    temperature: 0,
    max_tokens: 12,
  };
  if (slot.provider === 'google' || slot.provider === 'google ai studio' || slot.provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(slot.model)}:generateContent?key=${encodeURIComponent(slot.api_key)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'ping' }] }] }),
    });
    if (!res.ok) throw new Error(`Google probe failed (${res.status})`);
    return true;
  }
  const endpoint = slot.provider === 'openrouter'
    ? 'https://openrouter.ai/api/v1/chat/completions'
    : 'https://api.groq.com/openai/v1/chat/completions';
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${slot.api_key}`,
  };
  if (slot.provider === 'openrouter') {
    headers['HTTP-Referer'] = 'http://localhost';
    headers['X-Title'] = 'Arctic Betrayal LLM Simulator';
  }
  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: slot.model, ...payload }),
  });
  if (!res.ok) throw new Error(`${slot.provider} probe failed (${res.status})`);
  return true;
}

async function providerDecision(slot, promptObj) {
  const system = [
    'You are an autonomous agent in a frozen social deduction simulation.',
    'Use only local perception, memory, goals, and the actions explicitly available to you.',
    'Do not invent hidden channels, omniscience, or shared memory.',
    'Return exactly one JSON object with keys: thought, speech, action. thought is private/internal and never spoken aloud. speech is audible to others and may be empty string.',
    'action must be an object with a type field.',
    'The prompt provides capabilities, constraints, and scene state; choose the best action on your own.',
    'Movement is local and continuous: one tile per step only; do not teleport, jump, or skip across blocked terrain.',
    'Water requires swimming and still obeys the same local movement rules.',
    'Prefer concrete physical actions that match the local scene and the information you can actually perceive.',
    'Keep thought concise and private.',
  ].join(' ');

  if (slot.provider === 'google' || slot.provider === 'google ai studio' || slot.provider === 'gemini') {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(slot.model)}:generateContent?key=${encodeURIComponent(slot.api_key)}`;
    const body = {
      contents: [
        { role: 'user', parts: [{ text: system }] },
        { role: 'user', parts: [{ text: JSON.stringify(promptObj) }] },
      ],
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 240,
        responseMimeType: 'application/json',
      },
    };
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Google API ${res.status}`);
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    return jsonRepair(text);
  }

  const endpoint = slot.provider === 'openrouter'
    ? 'https://openrouter.ai/api/v1/chat/completions'
    : 'https://api.groq.com/openai/v1/chat/completions';
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${slot.api_key}`,
  };
  if (slot.provider === 'openrouter') {
    headers['HTTP-Referer'] = 'http://localhost';
    headers['X-Title'] = 'Arctic Betrayal LLM Simulator';
  }
  const body = {
    model: slot.model,
    temperature: 0.65,
    max_tokens: 240,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify(promptObj) },
    ],
    response_format: { type: 'json_object' },
  };
  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${slot.provider} API ${res.status}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || '';
  return jsonRepair(text);
}



function modelPrompt(agent, obs) {
  const memory = summarizeMemory(agent);
  const hostileNearby = obs.visible_entities.filter((e) => e.distance < 4).map((e) => ({
    id: e.id,
    name: e.name,
    profession: e.profession,
    distance: e.distance,
    carrying: e.carrying,
    action: e.current_action,
    imprisoned: e.imprisoned,
  }));
  const crewPressure = {
    hunger: Number((appState.agents.reduce((sum, a) => sum + (a.alive ? a.hunger : 0), 0) / Math.max(1, appState.agents.filter((a) => a.alive).length)).toFixed(1)),
    prisoners: appState.world.prisoners.length,
    corpses: appState.world.corpses.length,
    route: appState.world.route[appState.world.routeIndex] || 'unknown',
    voyageProgress: Number((appState.world.voyageProgress ?? 0).toFixed(2)),
    weather: appState.world.weatherLabel,
    alerts: appState.world.alerts.slice(-3),
  };

  return {
    role: agent.role,
    identity: {
      id: agent.id,
      name: agent.name,
      profession: agent.profession,
      visualTag: agent.visualTag,
    },
    location: {
      zone: obs.zone,
      biome: obs.biome,
      neighborhood: obs.neighborhood,
      position: obs.position,
      ship_distance: obs.ship.distance,
      can_disembark: obs.ship.canDisembark,
      on_ship: obs.onShip,
      terrain_window: obs.terrain_window,
    },
    local_presence: {
      crew: obs.nearbyCrew,
      presence: obs.presence,
      absences: obs.absences,
      hostiles: hostileNearby,
      corpses: obs.corpses,
      fauna: obs.fauna_entities,
      sites: obs.sites,
      traps: obs.traps,
      totems: obs.totems,
      tracks: obs.tracks,
    },
    physiology: {
      health: obs.health,
      hunger: obs.hunger,
      stamina: obs.stamina,
      morale: obs.morale,
      temperature: obs.temperature,
    },
    ship: obs.ship,
    weather: obs.weather,
    resources: obs.resources,
    inventory: obs.inventory,
    inventory_tools: {
      carried: Object.entries(obs.inventory || {}).filter(([, value]) => value).map(([item, value]) => ({ item, value })),
      ground: (obs.groundSupplies || []).map((supply) => ({
        id: supply.id,
        item: supply.item,
        amount: supply.amount,
        distance: supply.distance,
      })),
      rules: [
        'Use tools explicitly: pick up, drop, give, take, inspect, use_item, equip, unequip, store.',
        'Do not invent actions outside the schema.',
        'If you need an item or tool, ask for it through an action, do not imply it.',
      ],
      examples: [
        { action: { type: 'pick_up', target: 'ground', item: 'tool_kit', amount: 1 } },
        { action: { type: 'drop', target: 'ground', item: 'scrap', amount: 2 } },
        { action: { type: 'give', target: 'player_3', item: 'medicine', amount: 1 } },
        { action: { type: 'take', target: 'cache_cargo', item: 'food', amount: 1 } },
      ],
    },
    fauna: obs.fauna,
    memory,
    pressure: crewPressure,
    rules: {
      movement: [
        'Move locally; one tile per step. No teleporting, skipping, or jumping across gaps.',
        'Water is traversable only by swimming and still obeys local step-by-step movement.',
        'Prefer routes that match the biome, nearby presence, and what is immediately visible.',
      ],
      cognition: [
        'Evaluate presence and absence before acting.',
        'Use proximity, line of sight, biome, weather, and nearby sounds as the basis for decisions.',
        'Treat distant unknowns as uncertain, not facts.',
      ],
      action_schema: [
        'wait',
        'move',
        'move_to_zone',
        'pick_up',
        'drop',
        'give',
        'take',
        'use_item',
        'equip',
        'unequip',
        'store',
        'inspect',
        'search',
        'share',
        'steal',
        'craft',
        'heal',
        'attack',
        'sabotage',
        'report',
        'radio',
        'signal',
        'accuse',
        'interrogate',
        'imprison',
        'free',
        'follow',
        'escort',
        'track',
        'investigate',
      ],
    },
  };
}


function normalizeDecision(raw, agent, obs) {
  if (!raw || typeof raw !== 'object') return null;
  const thought = typeof raw.thought === 'string' ? raw.thought.slice(0, 240) : '';
  const speech = typeof raw.speech === 'string' ? raw.speech.slice(0, 240) : '';
  const action = raw.action && typeof raw.action === 'object' ? raw.action : { type: 'wait' };
  const type = typeof action.type === 'string' ? action.type.trim() : 'wait';
  const normalized = { thought, speech, action: { type } };

  const copyString = (key) => {
    if (action[key] != null) normalized.action[key] = typeof action[key] === 'string' ? action[key] : String(action[key]);
  };

  copyString('target');
  copyString('item');
  copyString('from');
  copyString('to');
  copyString('tool');
  copyString('channel');
  copyString('compartment');
  copyString('room');
  copyString('door');
  copyString('source');
  copyString('destination');

  if (action.amount != null) normalized.action.amount = Number(action.amount) || 0;
  if (action.steps != null) normalized.action.steps = Math.max(1, Math.min(2, Math.floor(Number(action.steps) || 1)));
  if (action.message != null && !speech) normalized.speech = String(action.message).slice(0, 240);
  if (action.meta != null && typeof action.meta === 'object') normalized.action.meta = { ...action.meta };
  return normalized;
}

function canStartAiRequest() {
  const now = Date.now();
  return !AI_REQUEST_GATE.inFlight && now >= AI_REQUEST_GATE.nextAvailableAt;
}

function reserveAiRequestSlot() {
  if (!canStartAiRequest()) return false;
  AI_REQUEST_GATE.inFlight = true;
  AI_REQUEST_GATE.nextAvailableAt = Date.now() + AI_REQUEST_GAP_MS;
  return true;
}

function releaseAiRequestSlot() {
  AI_REQUEST_GATE.inFlight = false;
}

async function thinkForAgent(agent, urgent = false, options = {}) {
  if (!agent?.alive) return null;
  const obs = computeEnvironmentForAgent(agent);
  const prompt = modelPrompt(agent, obs);
  const slot = appState.config.computeSlots[agent.slotIndex];
  const networkAvailable = Boolean(
    !options.forceLocal
    && appState.running
    && appState.mode !== 'offline'
    && slot
    && slot.api_key
    && slot.model
    && canStartAiRequest()
  );
  let raw = null;

  if (networkAvailable && reserveAiRequestSlot()) {
    try {
      raw = await providerDecision(slot, prompt);
    } catch (err) {
      pushEvent('ai_request_error', `${agent.name} request failed (${slot.provider}/${slot.model}).`, { agent: agent.id, error: err.message });
      raw = null;
    } finally {
      releaseAiRequestSlot();
    }
  }

  resolveEncounter(agent);
  const decision = normalizeDecision(raw, agent, obs);
  agent.lastDecision = decision || null;
  agent.pendingDecisionAt = 0;
  agent.nextDecisionAt = Date.now() + (decision ? nextDecisionDelayMs(agent, decision, obs) : Math.max(AI_REQUEST_GAP_MS, nextDecisionDelayMs(agent, null, obs)));
  if (!decision) return null;
  applyDecision(agent, decision, obs, urgent);
  return decision;
}

function rememberObservation(agent, obs) {
  for (const ev of obs.local_events.slice(-3)) {
    addMemory(agent, `Observed ${ev.type}: ${ev.text}`, ev.type);
  }
  for (const heard of obs.heard_messages.slice(-3)) {
    addMemory(agent, `Heard ${heard.speakerName}: ${heard.fragment}`, 'speech');
    if (heard.confidence < 0.55) {
      adjustSuspicion(agent, heard.speaker, 0.02);
    }
  }
  for (const radio of (obs.radio_messages || []).slice(-3)) {
    addMemory(agent, `Radio ${radio.channel}: ${radio.message}`, 'radio');
    if (radio.agentId && radio.agentId !== agent.id && radio.strength < 0.5) {
      adjustSuspicion(agent, radio.agentId, 0.01);
    }
  }
  for (const evidence of (obs.evidence || []).slice(-4)) {
    addMemory(agent, `Evidence ${evidence.type}: ${evidence.text}`, 'evidence');
    if (evidence.agentId && evidence.agentId !== agent.id) {
      adjustSuspicion(agent, evidence.agentId, evidence.severity * 0.06);
    }
    if (evidence.targetId && evidence.targetId !== agent.id) {
      adjustSuspicion(agent, evidence.targetId, evidence.severity * 0.04);
    }
  }
  for (const ent of obs.visible_entities.slice(0, 4)) {
    if (ent.current_action === 'attack' || ent.current_action === 'sabotage') {
      adjustSuspicion(agent, ent.id, 0.15);
      adjustRelationship(agent, ent.id, -0.05);
    }
    if (ent.imprisoned) {
      adjustSuspicion(agent, ent.id, 0.04);
    }
  }
}

function inventoryAdd(agent, item, amount = 1) {
  if (!(item in agent.inventory)) agent.inventory[item] = 0;
  agent.inventory[item] += amount;
}

function inventoryTake(agent, item, amount = 1) {
  if (!(item in agent.inventory)) return 0;
  const taken = Math.min(amount, agent.inventory[item]);
  agent.inventory[item] -= taken;
  return taken;
}

function applyDamage(target, amount, source, kind = 'damage') {
  if (!target.alive) return;
  target.health = clamp(target.health - amount, 0, 100);
  addMemory(target, `Took ${amount.toFixed(1)} damage from ${source}.`, 'damage');
  if (target.health <= 0) {
    target.alive = false;
    target.currentAction = 'dead';
    const corpse = {
      id: uid('corpse'),
      owner: target.id,
      name: target.name,
      profession: target.profession,
      position: { ...target.position },
      tick: appState.world.tick,
    };
    appState.world.corpses.push(corpse);
    pushEvent('corpse', `${target.name} died at (${target.position.x}, ${target.position.y}).`, { position: { ...target.position }, target: target.id, source, kind });
    wakeNearbyAgents(target.position, `${target.name}'s death`, 'corpse');
  }
}

function healTarget(target, amount, source) {
  if (!target.alive) return;
  target.health = clamp(target.health + amount, 0, 100);
  target.poison = clamp(target.poison - amount * 0.01, 0, 1);
  addMemory(target, `Recovered ${amount.toFixed(1)} health from ${source}.`, 'heal');
}

function processSpeech(agent, speech) {
  if (speech && speech.trim()) {
    pushSpeech(agent, speech.trim());
  }
}

function targetFromId(id) {
  return appState.agents.find((a) => a.id === id);
}


function applyDecision(agent, decision, obs, urgent = false) {
  if (!agent.alive) return;
  rememberObservation(agent, obs);
  const action = decision.action || { type: 'wait' };
  agent.currentAction = action.type;
  agent.lastThought = decision.thought ? String(decision.thought).slice(0, 280) : '';
  agent.lastSpeech = decision.speech ? String(decision.speech).slice(0, 280) : '';

  const type = action.type;
  if (type !== 'radio' && type !== 'report') processSpeech(agent, decision.speech);
  if (decision.thought) addMemory(agent, `Thought: ${decision.thought}`, 'thought');

  const targetId = action.target;
  const item = action.item;
  const amount = Math.max(1, Math.min(5, Math.floor(action.amount || 1)));
  const target = targetId ? targetFromId(targetId) : null;
  const zone = currentZone(agent);
  const traits = agent.traits || {};

  if (type === 'pick_up' || type === 'pickup' || type === 'grab') {
    const ground = Array.isArray(appState.world.groundSupplies) ? appState.world.groundSupplies : (appState.world.groundSupplies = []);
    const sourceItem = String(item || action.tool || action.source || '').trim();
    const match = ground.find((s) => s && !s.expired && dist(agent.position, s.position) <= 2.0 && (!sourceItem || s.item === sourceItem));
    if (match) {
      const takeAmount = Math.max(1, Math.min(amount, Number(match.amount || 1)));
      inventoryAdd(agent, match.item, takeAmount);
      match.amount = Math.max(0, Number(match.amount || 0) - takeAmount);
      if (match.amount <= 0) match.expired = true;
      pushEvent('pickup', `${agent.name} picked up ${takeAmount} ${match.item}.`, { position: { ...agent.position }, item: match.item, amount: takeAmount, supply: match.id });
      addMemory(agent, `Picked up ${takeAmount} ${match.item}.`, 'pickup');
    }
    return;
  }

  if (type === 'drop') {
    const dropItem = String(item || action.tool || action.source || '').trim();
    if (dropItem && inventoryTake(agent, dropItem, amount) > 0) {
      if (!Array.isArray(appState.world.groundSupplies)) appState.world.groundSupplies = [];
      appState.world.groundSupplies.push({
        id: uid('supply'),
        kind: 'drop',
        item: dropItem,
        amount,
        position: { ...agent.position },
        owner: agent.id,
        ttl: 220,
      });
      pushEvent('drop', `${agent.name} dropped ${amount} ${dropItem}.`, { position: { ...agent.position }, item: dropItem, amount });
      addMemory(agent, `Dropped ${amount} ${dropItem}.`, 'drop');
    }
    return;
  }

  if (type === 'give' || type === 'share') {
    if (target && target.alive && dist(agent.position, target.position) <= 2.5 && item) {
      const shared = inventoryTake(agent, item, amount);
      if (shared > 0) {
        inventoryAdd(target, item, shared);
        addMemory(agent, `Shared ${shared} ${item} with ${target.name}.`, 'share');
        addMemory(target, `Received ${shared} ${item} from ${agent.name}.`, 'share');
        pushEvent('share', `${agent.name} shared ${item} with ${target.name}.`, { position: { ...agent.position }, target: target.id, item, amount: shared });
        socialEcho(agent, 'share', target);
      }
    }
    return;
  }

  if (type === 'take') {
    if (target && target.alive && dist(agent.position, target.position) <= 2.5 && item) {
      const taken = inventoryTake(target, item, amount);
      if (taken > 0) {
        inventoryAdd(agent, item, taken);
        pushEvent('take', `${agent.name} took ${taken} ${item} from ${target.name}.`, { position: { ...agent.position }, target: target.id, item, amount: taken });
        addMemory(agent, `Took ${taken} ${item} from ${target.name}.`, 'take');
        addMemory(target, `${agent.name} took ${taken} ${item} from me.`, 'take');
      }
    }
    return;
  }

  if (type === 'wait') {
    agent.stamina = clamp(agent.stamina + 1.5, 0, 100);
    return;
  }

  if (type === 'disembark') {
    if (agent.onShip && appState.world.ship.canDisembark) {
      const landing = findNearestDisembarkTile(appState.world);
      agent.onShip = false;
      agent.shipCompartment = null;
      agent.position = { x: landing.x, y: landing.y };
      agent.lastSeen = { x: agent.position.x, y: agent.position.y, tick: appState.world.tick };
      agent.swimming = false;
      addMemory(agent, 'Disembarked from the ship.', 'movement');
      pushEvent('navigation', `${agent.name} disembarked near shore.`, { position: { ...agent.position }, agent: agent.id, landing });
    }
    return;
  }

  if (type === 'embark') {
    if (!agent.onShip) {
      const shipPos = shipWorldPosition(appState.world);
      if (dist(agent.position, shipPos) <= 3.5) {
        agent.onShip = true;
        agent.position = { ...shipPos };
        agent.lastSeen = { x: agent.position.x, y: agent.position.y, tick: appState.world.tick };
        addMemory(agent, 'Boarded the ship.', 'movement');
        pushEvent('navigation', `${agent.name} boarded the ship.`, { position: { ...agent.position }, agent: agent.id });
      }
    }
    return;
  }

  if (type === 'move') {
    const waypoint = ZONES[targetId] ? targetId : (target ? target.id : targetId);
    if (waypoint) {
      const stepTarget = ZONES[waypoint] ? zoneCenter(waypoint) : resolveMovementTarget(agent, waypoint);
      if (stepTarget) {
        const step = basicPathStep(agent.position, stepTarget, agent, { allowWater: Boolean(agent.canSwim || agent.swimming) });
        moveAgent(agent, step.x, step.y);
      }
    }
    agent.swimming = false;
    agent.stamina = clamp(agent.stamina - 0.6, 0, 100);
    return;
  }

  if (type === 'move_to_zone' || type === 'patrol' || type === 'follow' || type === 'escort' || type === 'track') {
    const waypoint = targetId || pickGoalTarget(agent);
    if (waypoint) {
      setMovementIntent(agent, waypoint, type, Math.max(1, Math.min(HUMAN_MOVE_BUDGET, Math.floor(action.steps || HUMAN_MOVE_BUDGET))));
    if (type === 'move_to_zone' || type === 'follow' || type === 'patrol' || type === 'track' || type === 'escort') agent.swimming = false;
    }
    agent.stamina = clamp(agent.stamina - 0.45, 0, 100);
    if (type === 'patrol') {
      addMemory(agent, `Patrolled toward ${targetId || 'a safe area'}.`, 'patrol');
    }
    return;
  }

  if (type === 'gather') {
    if (zone === 'forest') {
      const n = Math.min(3, intRand(1, 2));
      inventoryAdd(agent, 'wood', n);
      appState.world.resources.wood = clamp(appState.world.resources.wood + n, 0, 999);
      addMemory(agent, `Gathered ${n} wood in the forest.`, 'gather');
      pushEvent('gather', `${agent.name} gathered wood.`, { position: { ...agent.position } });
    } else if (zone === 'glacier') {
      const n = Math.random() < 0.55 ? 1 : 0;
      if (n) {
        inventoryAdd(agent, 'coal', n);
        appState.world.resources.coal += n;
        addMemory(agent, 'Collected coal from the ice.', 'gather');
      }
      if (Math.random() < 0.2) {
        inventoryAdd(agent, 'nitro', 1);
        appState.world.resources.nitro = Math.max(0, appState.world.resources.nitro - 1);
        addMemory(agent, 'Found nitroglycerine near the glacier.', 'discover');
        pushWorldAlert('discovery', `${agent.name} found nitroglycerine.`, { position: { ...agent.position }, agent: agent.id });
      }
      pushEvent('gather', `${agent.name} searched the glacier.`, { position: { ...agent.position } });
    } else if (zone === 'camp') {
      const n = Math.random() < 0.5 ? 1 : 0;
      if (n) inventoryAdd(agent, 'food', 1);
      addMemory(agent, 'Foraged around the camp.', 'gather');
    } else {
      if (appState.world.resources.scrap > 0) {
        inventoryAdd(agent, 'scrap', 1);
        appState.world.resources.scrap--;
        addMemory(agent, 'Recovered scrap from the ground.', 'gather');
      }
    }
    agent.stamina = clamp(agent.stamina - 3, 0, 100);
    socialEcho(agent, 'share');
    return;
  }

  if (type === 'rest') {
    agent.stamina = clamp(agent.stamina + 5, 0, 100);
    agent.hunger = clamp(agent.hunger + 0.4, 0, 100);
    agent.temperature = clamp(agent.temperature + 0.4, 0, 100);
    if (agent.health < 100 && agent.inventory.food > 0) healTarget(agent, 0.5, 'rest');
    addMemory(agent, 'Took a short rest.', 'rest');
    return;
  }

  if (type === 'repair') {
    if (dist(agent.position, ZONES.ship) <= 3) {
      const gain = (4 + (traits.repair || 1) * 2);
      appState.world.ship.integrity = clamp(appState.world.ship.integrity + gain, 0, 100);
      appState.world.ship.helmHealth = clamp(appState.world.ship.helmHealth + gain * 0.6, 0, 100);
      inventoryTake(agent, 'scrap', 1);
      inventoryTake(agent, 'wood', 1);
      addMemory(agent, 'Repaired ship systems.', 'repair');
      pushEvent('repair', `${agent.name} repaired the ship.`, { position: { ...agent.position } });
      socialEcho(agent, 'repair');
    }
    return;
  }

  if (type === 'refuel') {
    if (dist(agent.position, ZONES.ship) <= 3) {
      const usedCoal = inventoryTake(agent, 'coal', amount);
      const usedWood = usedCoal ? 0 : inventoryTake(agent, 'wood', amount);
      const fuelGain = (usedCoal * 5) + (usedWood * 2);
      if (fuelGain > 0) {
        appState.world.ship.fuel = clamp(appState.world.ship.fuel + fuelGain, 0, 100);
        appState.world.ship.boilerHeat = clamp(appState.world.ship.boilerHeat + fuelGain * 1.2, 0, 100);
        pushEvent('refuel', `${agent.name} refueled the boiler.`, { position: { ...agent.position }, fuelGain });
        addMemory(agent, `Refueled the boiler with ${usedCoal || usedWood} material.`, 'refuel');
      }
    }
    return;
  }

  if (type === 'cook') {
    const hasFood = inventoryTake(agent, 'food', 1);
    const hasWood = inventoryTake(agent, 'wood', 1);
    if (hasFood || hasWood) {
      inventoryAdd(agent, 'food', 1);
      appState.world.resources.food += 1;
      addMemory(agent, 'Prepared a meal for the crew.', 'cook');
      pushEvent('cook', `${agent.name} cooked food.`, { position: { ...agent.position } });
      socialEcho(agent, 'cook');
    }
    return;
  }

  if (type === 'heal') {
    const candidates = appState.agents.filter((a) => a.alive && a.health < 100 && dist(agent.position, a.position) <= 3);
    if (candidates.length) {
      for (const cand of candidates.slice(0, 2)) {
        healTarget(cand, 8 * (traits.heal || 1), agent.name);
      }
      addMemory(agent, 'Treated nearby injuries.', 'heal');
      pushEvent('heal', `${agent.name} treated injuries.`, { position: { ...agent.position } });
      socialEcho(agent, 'heal');
    }
    return;
  }

  if (type === 'accuse') {
    if (target) {
      adjustSuspicion(agent, target.id, 0.1);
      adjustRelationship(agent, target.id, -0.2);
      pushEvent('accusation', `${agent.name} accused ${target.name}.`, { position: { ...agent.position }, speaker: agent.id, target: target.id });
      addMemory(agent, `Accused ${target.name}.`, 'accusation');
      for (const other of appState.agents) {
        if (other.id !== agent.id && other.alive && dist(other.position, agent.position) <= 5) {
          adjustSuspicion(other, target.id, 0.05);
          addMemory(other, `${agent.name} accused ${target.name}.`, 'witness');
        }
      }
      socialEcho(agent, 'accuse', target);
      wakeNearbyAgents(agent.position, `${agent.name}'s accusation`, 'accusation');
    }
    return;
  }

  if (type === 'interrogate') {
    if (target && target.alive && dist(agent.position, target.position) <= 3) {
      adjustSuspicion(agent, target.id, 0.08);
      adjustRelationship(agent, target.id, -0.08);
      addMemory(agent, `Interrogated ${target.name}.`, 'interrogate');
      addMemory(target, `${agent.name} interrogated me.`, 'interrogate');
      pushEvent('interrogate', `${agent.name} interrogated ${target.name}.`, { position: { ...agent.position }, speaker: agent.id, target: target.id });
      wakeNearbyAgents(agent.position, `an interrogation by ${agent.name}`, 'interrogate');
    }
    return;
  }

  if (type === 'attack') {
    if (target && target.alive && dist(agent.position, target.position) <= 1.8) {
      const dmg = (18 + Math.random() * 10) * (traits.attack || 1);
      applyDamage(target, dmg, agent.name, 'attack');
      adjustSuspicion(agent, target.id, 0.35);
      adjustRelationship(agent, target.id, -0.4);
      addMemory(agent, `Attacked ${target.name}.`, 'attack');
      pushEvent('attack', `${agent.name} attacked ${target.name}.`, { position: { ...agent.position }, attacker: agent.id, target: target.id });
      socialEcho(agent, 'attack', target);
      wakeNearbyAgents(agent.position, `${agent.name} attacked ${target.name}`, 'attack');
    }
    return;
  }

  if (type === 'sabotage') {
    if (agent.role !== 'traitor') {
      addMemory(agent, 'Attempted sabotage but hesitated.', 'sabotage');
      return;
    }
    if (targetId === 'ship' || zone === 'ship') {
      appState.world.ship.integrity = clamp(appState.world.ship.integrity - (10 + Math.random() * 10), 0, 100);
      appState.world.ship.boilerHeat = clamp(appState.world.ship.boilerHeat - 6, 0, 100);
      appState.world.ship.pressure = clamp(appState.world.ship.pressure + 0.18, 0, 1);
      if (Math.random() < 0.35 && appState.world.resources.nitro > 0) {
        appState.world.resources.nitro--;
        pushEvent('explosion', `${agent.name} triggered an explosion near the ship.`, { position: { ...agent.position } });
        wakeNearbyAgents(agent.position, 'an explosion', 'explosion');
      } else {
        pushEvent('sabotage', `${agent.name} damaged the ship.`, { position: { ...agent.position } });
      }
      addMemory(agent, 'Sabotaged ship systems.', 'sabotage');
      socialEcho(agent, 'sabotage');
      broadcastLocalRumor(agent, 'something was damaged near the boiler', 5, 0.55);
    }
    return;
  }

  if (type === 'share') {
    if (target && target.alive && dist(agent.position, target.position) <= 2.5 && item) {
      const shared = inventoryTake(agent, item, amount);
      if (shared > 0) {
        inventoryAdd(target, item, shared);
        addMemory(agent, `Shared ${shared} ${item} with ${target.name}.`, 'share');
        addMemory(target, `Received ${shared} ${item} from ${agent.name}.`, 'share');
        pushEvent('share', `${agent.name} shared ${item} with ${target.name}.`, { position: { ...agent.position }, target: target.id, item, amount: shared });
        socialEcho(agent, 'share', target);
      }
    }
    return;
  }

  if (type === 'steal') {
    if (target && target.alive && dist(agent.position, target.position) <= 2.5 && item) {
      const taken = inventoryTake(target, item, amount);
      if (taken > 0) {
        inventoryAdd(agent, item, taken);
        adjustSuspicion(target, agent.id, 0.2);
        adjustRelationship(target, agent.id, -0.25);
        addMemory(agent, `Stole ${taken} ${item} from ${target.name}.`, 'steal');
        addMemory(target, `${agent.name} stole ${taken} ${item} from me.`, 'steal');
        pushEvent('steal', `${agent.name} stole ${item} from ${target.name}.`, { position: { ...agent.position }, target: target.id, item, amount: taken });
        socialEcho(agent, 'steal', target);
        wakeNearbyAgents(agent.position, `${agent.name} stealing from ${target.name}`, 'steal');
      }
    }
    return;
  }

  if (type === 'craft') {
    let crafted = null;
    if ((item === 'medicine' || !item) && inventoryTake(agent, 'scrap', 1) && inventoryTake(agent, 'food', 1)) {
      crafted = 'medicine';
      inventoryAdd(agent, 'medicine', 1);
      appState.world.resources.medicine += 1;
    } else if ((item === 'weapon' || !item) && inventoryTake(agent, 'scrap', 1) && inventoryTake(agent, 'wood', 1)) {
      crafted = 'weapon';
      agent.inventory.weapon = 'improvised';
    } else if (item === 'food' && inventoryTake(agent, 'wood', 1) && inventoryTake(agent, 'coal', 1)) {
      crafted = 'food';
      inventoryAdd(agent, 'food', 1);
      appState.world.resources.food += 1;
    }
    if (crafted) {
      addMemory(agent, `Crafted ${crafted}.`, 'craft');
      pushEvent('craft', `${agent.name} crafted ${crafted}.`, { position: { ...agent.position }, item: crafted });
    }
    return;
  }

  if (type === 'use_item') {
    if (item === 'medicine' && inventoryTake(agent, 'medicine', 1)) {
      healTarget(agent, 20, 'medicine');
      addMemory(agent, 'Used medicine.', 'item');
      return;
    }
    if (item === 'food' && inventoryTake(agent, 'food', 1)) {
      agent.hunger = clamp(agent.hunger - 20, 0, 100);
      agent.stamina = clamp(agent.stamina + 3, 0, 100);
      addMemory(agent, 'Ate food.', 'item');
      return;
    }
    if (item === 'venom' && inventoryTake(agent, 'venom', 1)) {
      agent.poison = clamp(agent.poison + 0.4, 0, 1);
      addMemory(agent, 'Handled venom carefully.', 'item');
      return;
    }
  }

  if (type === 'imprison') {
    if (!target || !target.alive) return;
    if (dist(agent.position, target.position) <= 2.5 && (zone === 'ship' || zone === 'prison')) {
      if (appState.world.prisoners.length < appState.world.ship.prisonCapacity) {
        target.imprisoned = true;
        if (!appState.world.prisoners.includes(target.id)) appState.world.prisoners.push(target.id);
        pushEvent('prison', `${agent.name} imprisoned ${target.name}.`, { position: { ...agent.position }, target: target.id });
        addMemory(agent, `Imprisoned ${target.name}.`, 'prison');
        socialEcho(agent, 'imprison', target);
      } else {
        addMemory(agent, 'Prison is full.', 'prison');
      }
    }
    return;
  }

  if (type === 'free') {
    if (target && target.imprisoned && dist(agent.position, target.position) <= 2.5) {
      target.imprisoned = false;
      appState.world.prisoners = appState.world.prisoners.filter((id) => id !== target.id);
      pushEvent('prison_break', `${agent.name} freed ${target.name}.`, { position: { ...agent.position }, target: target.id });
      addMemory(agent, `Freed ${target.name}.`, 'prison');
      socialEcho(agent, 'free', target);
    }
    return;
  }

  if (type === 'search') {
    const found = [];
    if (zone === 'glacier' && Math.random() < 0.4) {
      inventoryAdd(agent, 'nitro', 1);
      found.push('nitro');
    }
    if (zone === 'forest' && Math.random() < 0.45) {
      inventoryAdd(agent, 'wood', 1);
      found.push('wood');
    }
    if (zone === 'camp' && Math.random() < 0.3) {
      inventoryAdd(agent, 'food', 1);
      found.push('food');
    }
    if (zone === 'cave' && Math.random() < 0.35) {
      inventoryAdd(agent, 'relics', 1);
      found.push('relics');
    }
    if (agent.onShip) {
      const caches = Array.isArray(appState.world.ship.caches) ? appState.world.ship.caches : (appState.world.ship.caches = buildDefaultShipFoodCaches(appState.world));
      const compId = currentShipCompartment(agent) || shipCompartmentForPosition(agent.position, appState.world)?.id || null;
      const candidates = caches.filter((cache) => cache && !cache.revealed && cache.compartment === compId && (cache.contents?.food || cache.contents?.medicine));
      const cache = candidates.length ? candidates[0] : caches.find((c) => c && !c.revealed && (c.contents?.food || c.contents?.medicine));
      if (cache && Math.random() < 0.8) {
        cache.revealed = true;
        const food = Math.max(0, Number(cache.contents?.food || 0));
        const med = Math.max(0, Number(cache.contents?.medicine || 0));
        if (food > 0) {
          inventoryAdd(agent, 'food', food);
          appState.world.resources.food = clamp(appState.world.resources.food + food, 0, 999);
          found.push('food');
        }
        if (med > 0) {
          inventoryAdd(agent, 'medicine', med);
          appState.world.resources.medicine = clamp(appState.world.resources.medicine + med, 0, 999);
          found.push('medicine');
        }
        addMemory(agent, 'Found a hidden supply stash inside the ship.', 'search');
        pushEvent('search', `${agent.name} found hidden ship supplies.`, { position: { ...agent.position }, found });
        return;
      }
    }
    addMemory(agent, `Searched the area and found ${found.join(', ') || 'nothing'}.`, 'search');
    pushEvent('search', `${agent.name} searched the area.`, { position: { ...agent.position }, found });
    return;
  }

  if (type === 'follow') {
    if (target && target.alive) {
      const step = basicPathStep(agent.position, target.position, agent, { allowWater: Boolean(agent.canSwim || agent.swimming) });
      moveAgent(agent, step.x, step.y);
      addMemory(agent, `Followed ${target.name}.`, 'follow');
    }
    return;
  }

  if (type === 'signal') {
    pushEvent('signal', `${agent.name} signaled to nearby crew.`, { position: { ...agent.position } });
    broadcastLocalRumor(agent, decision.speech || 'a hand signal', 4, 0.35);
    return;
  }

  if (type === 'curse') {
    if (agent.role === 'traitor') {
      appState.world.ship.pressure = clamp(appState.world.ship.pressure + 0.1, 0, 1);
      for (const other of otherAgentsWithin(agent, 5)) {
        other.morale = clamp(other.morale - 0.04, 0, 1);
        if (Math.random() < 0.15) adjustSuspicion(other, agent.id, 0.08);
      }
      pushEvent('curse', `${agent.name} performed a disturbing ritual.`, { position: { ...agent.position } });
      addMemory(agent, 'Performed a secret ritual.', 'curse');
    }
    return;
  }

  if (type === 'bury') {
    const corpse = appState.world.corpses.find((c) => dist(agent.position, c.position) <= 2.5);
    if (corpse) {
      appState.world.corpses = appState.world.corpses.filter((c) => c.id !== corpse.id);
      pushEvent('bury', `${agent.name} buried ${corpse.name}.`, { position: { ...agent.position }, corpse: corpse.id });
      addMemory(agent, `Buried ${corpse.name}.`, 'bury');
    }
    return;
  }


  if (type === 'investigate') {
    const site = EXPEDITION_SITES.find((s) => s.id === targetId) || siteForPosition(agent.position);
    if (site) {
      const d = dist(agent.position, site);
      const insight = d <= site.radius + 1.2 ? 'close' : 'distant';
      registerSiteDiscovery(agent, site, insight);
      if (d <= site.radius + 1.2) {
        if (site.kind === 'loot' && Math.random() < 0.6) {
          const loot = choice(site.loot);
          inventoryAdd(agent, loot, 1);
          if (loot in appState.world.resources) appState.world.resources[loot] = Math.max(0, appState.world.resources[loot] - 1);
          pushEvent('loot', `${agent.name} recovered ${loot} at ${site.name}.`, { position: { ...agent.position }, site: site.id, loot });
        }
        if (site.kind === 'intel') {
          agent.morale = clamp(agent.morale + 0.03, 0, 1);
          appState.world.signalStrength = clamp(appState.world.signalStrength + 0.05, 0, 1);
        }
        if (site.kind === 'hazard') {
          pushWorldAlert('hazard', `${agent.name} found danger at ${site.name}.`, { agent: agent.id, site: site.id });
          if (Math.random() < 0.35) applyDamage(agent, 4 + Math.random() * 6, 'environment', 'hazard');
        }
        if (site.kind === 'danger' && Math.random() < 0.25) {
          createEncounter('cave_in', { ...site }, 0.65);
        }
      }
      addMemory(agent, `Investigated ${site.name}.`, 'investigate');
      pushEvent('investigate', `${agent.name} investigated ${site.name}.`, { position: { ...agent.position }, site: site.id });
    }
    return;
  }

  if (type === 'fortify') {
    if (dist(agent.position, ZONES.ship) <= 3) {
      const scrapUsed = inventoryTake(agent, 'scrap', 1);
      const woodUsed = inventoryTake(agent, 'wood', 1);
      const boost = scrapUsed ? 4 : 2;
      if (scrapUsed || woodUsed) {
        appState.world.ship.integrity = clamp(appState.world.ship.integrity + boost, 0, 100);
        appState.world.ship.systems.hull = clamp(appState.world.ship.systems.hull + boost * 1.5, 0, 100);
        appState.world.crewCohesion = clamp(appState.world.crewCohesion + 0.03, 0, 1);
        pushEvent('fortify', `${agent.name} fortified the ship.`, { position: { ...agent.position } });
        addMemory(agent, 'Fortified ship defenses.', 'fortify');
      }
    }
    return;
  }

  if (type === 'set_trap') {
    const source = inventoryTake(agent, 'scrap', 1) || inventoryTake(agent, 'venom', 1) || inventoryTake(agent, 'wood', 1);
    if (source) {
      const trap = {
        id: uid('trap'),
        owner: agent.id,
        ownerName: agent.name,
        position: { ...agent.position },
        armed: true,
        damage: agent.role === 'traitor' ? 12 + Math.random() * 10 : 8 + Math.random() * 6,
        radius: agent.role === 'traitor' ? 1.3 : 1.0,
        kind: agent.role === 'traitor' ? 'sabotage' : 'snare',
        plantedAt: Date.now(),
      };
      appState.world.traps.push(trap);
      pushEvent('trap', `${agent.name} placed a trap.`, { position: { ...agent.position }, trap: trap.id });
      addMemory(agent, 'Placed a hidden trap.', 'trap');
    }
    return;
  }

  if (type === 'escort') {
    if (target && target.alive && dist(agent.position, target.position) <= 5) {
      const step = basicPathStep(agent.position, target.position, agent, { allowWater: Boolean(agent.canSwim || agent.swimming) });
      moveAgent(agent, step.x, step.y);
      adjustRelationship(agent, target.id, 0.05);
      addMemory(agent, `Escorted ${target.name}.`, 'escort');
    }
    return;
  }

  if (type === 'track') {
    const tracks = appState.world.tracks.slice().reverse().find((t) => !targetId || t.owner === targetId);
    if (tracks) {
      const step = basicPathStep(agent.position, tracks.position, agent, { allowWater: Boolean(agent.canSwim || agent.swimming) });
      moveAgent(agent, step.x, step.y);
      addMemory(agent, `Tracked ${tracks.ownerName || tracks.owner}.`, 'track');
    }
    return;
  }

  if (type === 'brew') {
    const foodUsed = inventoryTake(agent, 'food', 1);
    const coalUsed = inventoryTake(agent, 'coal', 1);
    const scrapUsed = inventoryTake(agent, 'scrap', 1);
    if (foodUsed || coalUsed || scrapUsed) {
      inventoryAdd(agent, 'medicine', 1);
      appState.world.resources.medicine += 1;
      pushEvent('brew', `${agent.name} prepared a crude tonic.`, { position: { ...agent.position } });
      addMemory(agent, 'Brewed a tonic.', 'brew');
    }
    return;
  }

  if (type === 'tend') {
    const targetAgent = target && target.alive ? target : agent;
    targetAgent.hunger = clamp(targetAgent.hunger - 10, 0, 100);
    targetAgent.poison = clamp(targetAgent.poison - 0.15, 0, 1);
    targetAgent.morale = clamp(targetAgent.morale + 0.04, 0, 1);
    healTarget(targetAgent, 4, agent.name);
    addMemory(agent, `Tended ${targetAgent.name}.`, 'tend');
    pushEvent('tend', `${agent.name} tended a crew member.`, { position: { ...agent.position }, target: targetAgent.id });
    return;
  }

  if (type === 'sweep') {
    const removedTraps = appState.world.traps.filter((t) => dist(t.position, agent.position) <= 2.5 && t.armed);
    if (removedTraps.length) {
      for (const trap of removedTraps) trap.armed = false;
      addMemory(agent, `Swept and disarmed ${removedTraps.length} trap(s).`, 'sweep');
      pushEvent('sweep', `${agent.name} swept the area.`, { position: { ...agent.position }, count: removedTraps.length });
      appState.world.crewCohesion = clamp(appState.world.crewCohesion + 0.02, 0, 1);
    }
    const discoveredTotem = appState.world.totems.find((t) => dist(t.position, agent.position) <= 3 && !t.hidden);
    if (discoveredTotem) {
      discoveredTotem.hidden = false;
      addMemory(agent, 'Found a hidden totem.', 'discovery');
      pushWorldAlert('discovery', `${agent.name} found a hidden totem.`, { position: { ...agent.position } });
    }
    return;
  }

  if (type === 'deploy') {
    if (agent.role === 'traitor') {
      const totem = {
        id: uid('totem'),
        owner: agent.id,
        ownerName: agent.name,
        position: { ...agent.position },
        aura: 0.08 + Math.random() * 0.12,
        hidden: true,
        plantedAt: Date.now(),
      };
      appState.world.totems.push(totem);
      appState.world.terror = clamp(appState.world.terror + 0.04, 0, 1);
      pushEvent('totem', `${agent.name} planted a totem.`, { position: { ...agent.position }, totem: totem.id });
      addMemory(agent, 'Deployed a hidden totem.', 'deploy');
    }
    return;
  }

  if (type === 'move_to_zone') {
    const stepTarget = zoneCenter(targetId);
    if (stepTarget) {
      const step = basicPathStep(agent.position, stepTarget, agent, { allowWater: Boolean(agent.canSwim || agent.swimming) });
      moveAgent(agent, step.x, step.y);
    }
    return;
  }

  if (type === 'moveTo') {
    const stepTarget = zoneCenter(targetId);
    if (stepTarget) {
      const step = basicPathStep(agent.position, stepTarget, agent, { allowWater: Boolean(agent.canSwim || agent.swimming) });
      moveAgent(agent, step.x, step.y);
    }
    return;
  }

  if (type === 'move') return;
}



function applyWorldEffects() {
  const world = appState.world;
  world.tick += 1;
  const t = world.tick;
  world.timeOfDay = (world.timeOfDay + 0.0010 * SIM_PACE) % 1;
  refreshShipAndFauna();
  if (t % 140 === 0) world.day += 1;

  const dayFactor = Math.sin(world.timeOfDay * Math.PI * 2);
  world.temperature = -16 + dayFactor * 8 - (world.storm * 8);
  if (Math.random() < 0.004) world.storm = clamp(world.storm + rand(-0.12, 0.16), 0.05, 1);
  else world.storm = clamp(world.storm + rand(-0.015, 0.015), 0.05, 0.95);
  world.weatherLabel = world.storm > 0.75 ? 'whiteout' : world.storm > 0.45 ? 'blizzard' : world.storm > 0.25 ? 'overcast' : 'calm';
  world.signalStrength = clamp(world.signalStrength * 0.992 + (world.weatherLabel === 'whiteout' ? 0.002 : 0), 0, 1);

  if (t % 40 === 0 && Math.random() < 0.25) {
    const site = choice(EXPEDITION_SITES);
    if (site && (!world.expedition.discovered.includes(site.id) || Math.random() < 0.5)) {
      world.expedition.discovered.push(site.id);
      pushWorldAlert('site', `Expedition signal picked up ${site.name}.`, { site: site.id });
    }
  }

  if (t % 45 === 0) {
    const fuelBoost = Math.max(0, world.ship.fuel * 0.06);
    world.ship.boilerHeat = clamp(world.ship.boilerHeat - 1.0 + fuelBoost, 0, 100);
    world.ship.integrity = clamp(world.ship.integrity - (world.storm > 0.65 ? 0.25 : 0.05), 0, 100);
    world.ship.helmHealth = clamp(world.ship.helmHealth - (world.storm > 0.7 ? 0.18 : 0.03), 0, 100);
    world.ship.pressure = clamp(world.ship.pressure + (world.storm * 0.006), 0, 1);
  }

  if (world.ship.fuel <= 0) world.ship.boilerHeat = clamp(world.ship.boilerHeat - 1, 0, 100);
  world.ship.systems.boiler = world.ship.boilerHeat;
  world.ship.systems.helm = world.ship.helmHealth;
  world.ship.systems.hull = world.ship.integrity;
  world.ship.hullStress = clamp(world.ship.hullStress + (world.ship.pressure * 0.02) + (world.storm * 0.01), 0, 1);

  const aliveAgents = appState.agents.filter((a) => a.alive);
  const crewCount = aliveAgents.length;
  const avgHunger = crewCount ? aliveAgents.reduce((s, a) => s + a.hunger, 0) / crewCount : 0;
  const avgMorale = crewCount ? aliveAgents.reduce((s, a) => s + a.morale, 0) / crewCount : 0;

  if (t % 25 === 0) {
    const consumption = Math.max(1, Math.ceil(crewCount / 3));
    world.resources.food = Math.max(0, world.resources.food - consumption);
    if (world.resources.food === 0) {
      for (const agent of aliveAgents) agent.hunger = clamp(agent.hunger + 2, 0, 100);
      pushWorldAlert('shortage', 'Food reserves are empty.', {});
    }
  }

  if (t % 40 === 0 && world.ship.fuel > 0) {
    world.ship.fuel = clamp(world.ship.fuel - 1, 0, 100);
  }

  if (t % 120 === 0) {
    const overworld = world.overworld || (world.overworld = {
      route: Array.isArray(world.route) ? world.route.slice() : ['ship'],
      routeIndex: world.routeIndex || 0,
      voyageProgress: world.voyageProgress || 0,
      shipPosition: { ...shipWorldPosition(world) },
      landings: Array.isArray(world.landings) ? world.landings.slice() : [],
      canDisembark: Boolean(world.ship.canDisembark),
    });
    const progressGain = clamp((world.ship.boilerHeat / 1400) + (world.ship.helmHealth / 2200) - world.storm * 0.01, 0.003, 0.018);
    overworld.voyageProgress = clamp((overworld.voyageProgress ?? 0) + progressGain, 0, 1);
    world.ship.heading = clamp(world.ship.heading + rand(-0.08, 0.08), -1, 1);
    if (overworld.voyageProgress >= 1) {
      overworld.voyageProgress = 0;
      overworld.routeIndex = (overworld.routeIndex + 1) % (overworld.route?.length || 1);
      world.routeIndex = overworld.routeIndex;
      world.voyageProgress = overworld.voyageProgress;
      const nextStop = (overworld.route || world.route || [])[overworld.routeIndex];
      pushEvent('navigation', `The expedition reached ${nextStop}.`, { position: { ...shipWorldPosition(world) }, destination: nextStop });
      pushWorldAlert('navigation', `Route advanced to ${nextStop}.`, { destination: nextStop });
      if (Math.random() < 0.4) createEncounter(choice(['whiteout', 'wolf_pack', 'aurora']), { ...shipWorldPosition(world) }, rand(0.35, 0.75));
    }
    world.voyageProgress = overworld.voyageProgress;
  }

  if (t % 30 === 0) {
    for (const agent of aliveAgents) {
      if (dist(agent.position, ZONES.ship) <= 3) {
        agent.morale = clamp(agent.morale + 0.02, 0, 1);
      } else {
        agent.morale = clamp(agent.morale - 0.01, 0, 1);
      }
      if (agent.hunger > 80) agent.morale = clamp(agent.morale - 0.05, 0, 1);
      if (agent.imprisoned) agent.morale = clamp(agent.morale - 0.03, 0, 1);
    }
  }

  for (const agent of aliveAgents) {
    agent.hunger = clamp(agent.hunger + 0.08, 0, 100);
    agent.stamina = clamp(agent.stamina - 0.15, 0, 100);
    const cold = Math.max(0, 14 - world.ship.boilerHeat / 7) + Math.abs(world.temperature + 5) * 0.04;
    agent.temperature = clamp(agent.temperature - cold * 0.05, 0, 100);
    if (agent.hunger > 82) agent.health = clamp(agent.health - 0.04, 0, 100);
    if (agent.temperature < 30) agent.health = clamp(agent.health - 0.08, 0, 100);
    if (agent.poison > 0) {
      agent.health = clamp(agent.health - agent.poison * 0.6, 0, 100);
      agent.poison = clamp(agent.poison - 0.01, 0, 1);
    }
    if (agent.imprisoned) {
      agent.stamina = clamp(agent.stamina - 0.28, 0, 100);
      agent.health = clamp(agent.health - 0.08, 0, 100);
      if (Math.random() < 0.003 || world.ship.pressure > 0.75) {
        agent.imprisoned = false;
        pushEvent('prison_break', `${agent.name} broke out of prison.`, { position: { ...agent.position } });
      }
    }
    if (agent.health <= 0 && agent.alive) {
      applyDamage(agent, 999, 'environment', 'death');
    }
  }

  for (const agent of aliveAgents) {
    const nearby = otherAgentsWithin(agent, 2.25);
    for (const other of nearby) {
      if (other.id === agent.id) continue;
      adjustRelationship(agent, other.id, 0.01);
      if (agent.currentAction === 'attack' || agent.currentAction === 'sabotage' || other.currentAction === 'attack') {
        adjustSuspicion(agent, other.id, 0.03);
      }
    }
  }

  if (Math.random() < 0.006) {
    const wolfTarget = closestAgent({ position: zoneCenter('forest') }, (a) => a.alive && !a.imprisoned, 5);
    if (wolfTarget && Math.random() < 0.22) {
      pushEvent('wolf', `A wolf stalks ${wolfTarget.name}.`, { position: { ...wolfTarget.position } });
      if (Math.random() < 0.14) applyDamage(wolfTarget, 1.5 + Math.random() * 2.5, 'wolf', 'attack');
    }
  }

  if (Math.random() < 0.002) {
    const bearTarget = closestAgent({ position: zoneCenter('glacier') }, (a) => a.alive && !a.imprisoned, 6);
    if (bearTarget) {
      pushEvent('bear', `A bear charges near ${bearTarget.name}.`, { position: { ...bearTarget.position } });
      applyDamage(bearTarget, 2 + Math.random() * 3, 'bear', 'attack');
    }
  }

  if (Math.random() < 0.015 && aliveAgents.length) {
    const witness = choice(aliveAgents);
    pushWorldAlert('rumor', `${witness.name} heard something unsettling in the snow.`, { agent: witness.id });
  }

  if (aliveAgents.length) {
    world.crewCohesion = clamp(
      0.35 + (aliveAgents.reduce((s, a) => s + a.morale, 0) / aliveAgents.length) * 0.55 - (world.prisoners.length * 0.02),
      0,
      1
    );
    world.terror = clamp(world.terror + (world.totems.length * 0.002) + (world.ship.pressure * 0.004), 0, 1);
  }

  for (const trap of world.traps) {
    if (!trap.armed && trap.triggeredAt && Date.now() - trap.triggeredAt > 15000) {
      trap.expired = true;
    }
  }
  world.traps = world.traps.filter((t) => !t.expired);

  for (const totem of world.totems) {
    const nearbyCrew = aliveAgents.filter((a) => dist(a.position, totem.position) <= 4);
    if (nearbyCrew.length) {
      world.terror = clamp(world.terror + 0.0015 * nearbyCrew.length, 0, 1);
      for (const crew of nearbyCrew) {
        crew.morale = clamp(crew.morale - (totem.aura || 0.05) * 0.02, 0, 1);
        if (crew.role !== 'traitor' && Math.random() < 0.02) adjustSuspicion(crew, totem.owner, 0.03);
      }
    }
  }

  if (world.tracks.length > 0 && t % 35 === 0) {
    world.tracks = world.tracks.slice(-90);
  }

  if (world.encounters.length) {
    for (const enc of world.encounters) {
      enc.ttl -= 1;
      if (enc.ttl <= 0) enc.active = false;
      if (!enc.active) continue;
      if (enc.kind === 'whiteout') {
        world.storm = clamp(world.storm + 0.01, 0.05, 1);
      } else if (enc.kind === 'wolf_pack') {
        const prey = aliveAgents.filter((a) => a.alive && dist(a.position, enc.center) <= 5);
        if (prey.length && Math.random() < 0.1) applyDamage(choice(prey), 6 + Math.random() * 6, 'wolves', 'attack');
      } else if (enc.kind === 'cave_in') {
        const prey = aliveAgents.filter((a) => a.alive && currentZone(a) === 'cave');
        if (prey.length && Math.random() < 0.08) applyDamage(choice(prey), 8 + Math.random() * 8, 'cave_in', 'hazard');
      }
    }
    world.encounters = world.encounters.filter((e) => e.active || e.ttl > -10);
  }

  if (world.ship.integrity <= 0 && world.phase !== 'ended') {
    world.phase = 'ended';
    pushEvent('end', 'The ship is destroyed. The expedition ends in disaster.', { position: { ...ZONES.ship } });
  }
}


function refreshPerceptionAndSchedule() {
  const now = Date.now();
  for (const agent of appState.agents) {
    if (!agent.alive) continue;
    if (!agent.nextDecisionAt) {
      agent.nextDecisionAt = now + intRand(1800, 3200);
    }
    if (agent.pendingDecisionAt && now >= agent.pendingDecisionAt) {
      if (!agent.decisionLock) appState.queue.add(agent.id);
    } else if (now >= agent.nextDecisionAt) {
      if (!agent.decisionLock) appState.queue.add(agent.id);
    }
  }
}

function maybeImmediateDecisions() {
  const recent = appState.world.events.slice(-8);
  if (recent.some((e) => isCriticalEvent(e.type))) {
    for (const agent of appState.agents) {
      if (!agent.alive) continue;
      if (dist(agent.position, recent[recent.length - 1].data?.position || agent.position) <= 7) {
        if (!agent.decisionLock) appState.queue.add(agent.id);
      }
    }
  }
}

function processQueue() {
  if (!appState.running) return;
  const now = Date.now();
  if (!appState.queue.size) return;
  const ids = Array.from(appState.queue).slice(0, 1);
  for (const id of ids) appState.queue.delete(id);
  for (const id of ids) {
    const agent = targetFromId(id);
    if (!agent || !agent.alive) continue;
    if (agent.decisionLock) continue;
    agent.decisionLock = true;
    thinkForAgent(agent).finally(() => {
      agent.decisionLock = false;
      agent.nextDecisionAt = now + intRand(DEFAULT_DECISION_MIN, DEFAULT_DECISION_MAX);
    });
  }
}


function serializePublicState() {
  const { world, agents, config, running, mode, assignment } = appState;
  const aliveCount = agents.filter((a) => a.alive).length;
  const deadCount = agents.length - aliveCount;
  const prisonerCount = world.prisoners.length;
  const topSuspicion = agents
    .flatMap((a) => Object.entries(a.memory.suspicions || {}).map(([id, score]) => ({ from: a.id, id, score })))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  return {
    running,
    mode,
    matchId: world.matchId,
    tick: world.tick,
    day: world.day,
    timeOfDay: world.timeOfDay,
    weatherLabel: world.weatherLabel,
    temperature: world.temperature,
    phase: world.phase,
    sot: world.sot || buildWorldSot(),
    ship: world.ship,
    overworld: world.overworld ? {
      route: Array.isArray(world.overworld.route) ? world.overworld.route.slice() : [],
      routeIndex: world.overworld.routeIndex ?? 0,
      voyageProgress: world.overworld.voyageProgress ?? 0,
      shipPosition: world.overworld.shipPosition ? { ...world.overworld.shipPosition } : null,
      landings: Array.isArray(world.overworld.landings) ? world.overworld.landings.slice() : [],
      canDisembark: Boolean(world.overworld.canDisembark),
    } : null,
    shipPosition: shipWorldPosition(world) ? { ...shipWorldPosition(world) } : null,
    shipCanDisembark: Boolean(world.overworld?.canDisembark ?? world.ship.canDisembark),
    shipState: world.ship ? {
      position: world.ship.position ? { ...world.ship.position } : null,
      worldPosition: world.ship.worldPosition ? { ...world.ship.worldPosition } : null,
      interior: { ...(world.ship.interior || {}) },
      systems: { ...world.ship.systems },
      canDisembark: Boolean(world.ship.canDisembark),
      heading: world.ship.heading,
    } : null,
    ecs: world.ecs || null,
    overworldState: world.overworld ? {
      route: Array.isArray(world.overworld.route) ? world.overworld.route.slice() : [],
      routeIndex: world.overworld.routeIndex ?? 0,
      voyageProgress: world.overworld.voyageProgress ?? 0,
      shipPosition: world.overworld.shipPosition ? { ...world.overworld.shipPosition } : null,
      landings: Array.isArray(world.overworld.landings) ? world.overworld.landings.slice() : [],
      canDisembark: Boolean(world.overworld.canDisembark),
    } : null,
    map: world.map,
    terrain: world.terrain,
    zones: world.zones,
    boulders: world.boulders,
    expeditionSites: world.expeditionSites,
    landings: world.landings,
    resources: world.resources,
    fauna: world.fauna,
    faunaEntities: (world.faunaEntities || []).filter((f) => f.active !== false).map((f) => ({
      id: f.id,
      kind: f.kind,
      label: f.label,
      position: { ...f.position },
      health: f.health,
      hunger: f.hunger,
      aggression: f.aggression,
      speed: f.speed,
      state: f.state,
      active: f.active !== false,
      spawnTick: f.spawnTick,
    })),
    route: world.route,
    routeIndex: world.routeIndex,
    voyageProgress: world.voyageProgress,
    traps: world.traps,
    totems: world.totems,
    tracks: world.tracks.slice(-60),
    encounters: world.encounters.filter((e) => e.active),
    expedition: world.expedition,
    crewCohesion: Number(world.crewCohesion.toFixed(2)),
    terror: Number(world.terror.toFixed(2)),
    signalStrength: Number(world.signalStrength.toFixed(2)),
    alerts: world.alerts,
    events: world.events.slice(-80),
    speeches: world.speeches.slice(-30),
    evidence: Array.isArray(world.evidence) ? world.evidence.slice(-80) : [],
    shipMeta: shipMetaSnapshot(world),
    shipPower: world.ship?.power || null,
    shipRadio: world.ship?.radio || null,
    shipFire: world.ship?.fire || null,
    mutiny: world.mutiny || null,
    crewRoles: world.crewRoles?.catalog || null,
    corpses: world.corpses.slice(-20),
    prisoners: world.prisoners,
    overview: {
      aliveCount,
      deadCount,
      prisonerCount,
      routeTarget: world.route[world.routeIndex] || 'unknown',
      routeProgress: Number(world.voyageProgress.toFixed(2)),
      alertCount: world.alerts.length,
      storm: Number(world.storm.toFixed(2)),
      averageHunger: Number((agents.reduce((s, a) => s + (a.alive ? a.hunger : 0), 0) / Math.max(1, aliveCount)).toFixed(1)),
      averageMorale: Number((agents.reduce((s, a) => s + (a.alive ? a.morale : 0), 0) / Math.max(1, aliveCount)).toFixed(2)),
      cohesion: Number(world.crewCohesion.toFixed(2)),
      terror: Number(world.terror.toFixed(2)),
      signalStrength: Number(world.signalStrength.toFixed(2)),
      topSuspicion,
    },
    agents: agents.map((a) => ({
      id: a.id,
      name: a.name,
      profession: a.profession,
      role: config.debugRevealRoles ? a.role : undefined,
      alive: a.alive,
      imprisoned: a.imprisoned,
      health: Number(a.health.toFixed(1)),
      hunger: Number(a.hunger.toFixed(1)),
      temperature: Number(a.temperature.toFixed(1)),
      stamina: Number(a.stamina.toFixed(1)),
      morale: Number(a.morale.toFixed(2)),
      position: { ...a.position },
      carrying: a.carrying,
      inventory: { ...a.inventory },
      currentAction: a.currentAction,
      lastThought: a.lastThought || '',
      lastSpeech: a.lastSpeech || '',
      pendingDecisionAt: a.pendingDecisionAt,
      nextDecisionAt: a.nextDecisionAt,
      slotIndex: a.slotIndex,
      provider: a.provider,
      model: a.model,
      visualTag: a.visualTag,
      crewRole: a.crewRole,
      memory: a.memory,
      suspicions: a.memory.suspicions,
      relationships: a.memory.relationships,
      goals: a.memory.goals,
      lastDecision: a.lastDecision,
      trustBias: a.trustBias,
      alertness: a.alertness,
      fatigue: Number((a.fatigue || 0).toFixed(2)),
      injury: Number((a.injury || 0).toFixed(2)),
      discipline: Number((a.discipline || 0).toFixed(2)),
      knownSites: a.knownSites || [],
      stealth: Number((a.stealth || 0).toFixed(2)),
      lastSeen: a.lastSeen,
      onShip: Boolean(a.onShip),
      shipCompartment: a.shipCompartment || null,
      swimming: Boolean(a.swimming),
      movementIntent: a.movementIntent ? {
        kind: a.movementIntent.kind,
        targetId: a.movementIntent.targetId,
        target: a.movementIntent.target ? { ...a.movementIntent.target } : null,
        budget: a.movementIntent.budget,
        updatedAt: a.movementIntent.updatedAt,
      } : null,
      movementOrder: a.movementOrder ? {
        kind: a.movementOrder.kind,
        targetId: a.movementOrder.targetId,
        target: a.movementOrder.target ? { ...a.movementOrder.target } : null,
        remainingSteps: Math.max(0, (a.movementOrder.path || []).length - (a.movementOrder.pathIndex || 0)),
        etaMs: Math.max(0, (a.movementOrder.arrivalAt || 0) - Date.now()),
      } : null,
    })),
    config: {
      computeSlots: config.computeSlots.map((s) => ({
        provider: s.provider,
        model: s.model,
        visual_name: s.visual_name || '',
      })),
      debugRevealRoles: config.debugRevealRoles,
    },
    assignment,
  };
}


function isMaskedApiKey(value) {
  const raw = String(value || '').trim();
  return !raw || /^•+$/.test(raw) || raw === '••••••••';
}

async function validateStartConfig(payload) {
  const errors = [];
  const slots = Array.isArray(payload.computeSlots) ? payload.computeSlots : [];
  if (slots.length < MIN_SLOTS) errors.push(`Se requieren al menos ${MIN_SLOTS} Compute Slots.`);
  if (slots.length > MAX_SLOTS) errors.push(`Se permiten como máximo ${MAX_SLOTS} Compute Slots.`);

  const currentSlots = Array.isArray(appState?.config?.computeSlots) ? appState.config.computeSlots : loadInitialConfig().computeSlots;
  const seenKeys = new Set();
  const normalizedSlots = [];

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i] || {};
    const provider = String(slot.provider || '').trim().toLowerCase();
    const model = String(slot.model || '').trim();
    const visual_name = String(slot.visual_name || '').trim();
    const incomingApiKey = String(slot.api_key || '').trim();
    const existingApiKey = String(currentSlots[i]?.api_key || '').trim();
    const api_key = isMaskedApiKey(incomingApiKey) ? existingApiKey : incomingApiKey;

    if (!['groq', 'openrouter', 'google', 'google ai studio', 'gemini'].includes(provider)) {
      errors.push(`Slot ${i + 1}: provider no soportado.`);
      continue;
    }
    if (!api_key) errors.push(`Slot ${i + 1}: api_key vacía.`);
    if (!model) errors.push(`Slot ${i + 1}: modelo vacío.`);

    if (api_key && seenKeys.has(api_key)) {
      errors.push(`API Key duplicada detectada en slot ${i + 1}.`);
    }
    if (api_key) seenKeys.add(api_key);

    normalizedSlots.push({ provider, api_key, model, visual_name });
  }
  if (errors.length) return { ok: false, errors };

  for (const slot of normalizedSlots) {
    try {
      await providerProbe(slot);
    } catch (err) {
      return { ok: false, errors: [`Validación fallida para ${slot.provider}/${slot.model}: ${err.message}`] };
    }
  }

  return { ok: true, slots: normalizedSlots };
}

function startMatch(validated) {
  const config = {
    computeSlots: validated.slots,
    debugRevealRoles: Boolean(appState.config.debugRevealRoles),
    agentNames: appState.config.agentNames || [],
  };
  const world = normalizeWorldRuntime(createWorld());
  const { agents, assignment } = createAgentsFromConfig(config);
  appState.world = world;
  appState.agents = agents;
  appState.assignment = assignment;
  appState.running = true;
  appState.mode = 'live';
  world.phase = 'running';
  appState.config = persistConfigSnapshot({
    ...appState.config,
    computeSlots: validated.slots,
    debugRevealRoles: Boolean(appState.config.debugRevealRoles),
    agentNames: Array.isArray(appState.config.agentNames) ? appState.config.agentNames : ['', '', '', '', '', '', '', ''],
  });
  appState.queue.clear();
  appState.lastSaveAt = Date.now();
  pushEvent('start', 'Match started.', {});
  for (const agent of appState.agents) {
    normalizeAgentRuntime(agent);
    agent.nextDecisionAt = Date.now() + intRand(2500, 6000);
    agent.pendingDecisionAt = 0;
    agent.decisionLock = false;
  }
}

function stopMatch(reason = 'Match stopped.') {
  appState.running = false;
  appState.mode = 'offline';
  if (appState.world) appState.world.phase = 'lobby';
  pushEvent('stop', reason, {});
  saveAutosave();
}

function resetAutosave() {
  try {
    if (fs.existsSync(AUTOSAVE_PATH)) fs.unlinkSync(AUTOSAVE_PATH);
  } catch (err) {
    console.error('Autosave reset failed:', err.message);
  }
}

function saveAutosave() {
  try {
    saveJson(AUTOSAVE_PATH, buildAutosaveSnapshot());
    appState.lastSaveAt = Date.now();
  } catch (err) {
    console.error('Autosave failed:', err.message);
  }
}

function restoreAutosave() {
  const data = loadJson(AUTOSAVE_PATH, null);
  if (!isRestorableAutosaveSnapshot(data)) return false;

  const world = sanitizeAutosaveWorldForLoad(data.world);
  const agents = normalizeAutosaveAgents(data.agents);

  appState.world = world;
  appState.agents = agents;

  for (const agent of appState.agents) {
    const interior = agent?.position ? shipInterior.shipCompartmentForPosition(agent.position, appState.world) : null;
    if (!agent.onShip && (agent.shipCompartment || interior)) {
      agent.onShip = true;
    }
    if (agent.onShip) {
      normalizeShipOccupant(agent, appState.world);
    }
    if (agent?.position && !canOccupyTile(agent, Math.round(agent.position.x), Math.round(agent.position.y), { world: appState.world })) {
      agent.position = nearestOpenTile(agent.position, 6);
    }
    agent.decisionLock = false;
  }

  appState.assignment = sanitizeAutosaveAssignment(data.assignment);
  appState.running = true;
  appState.mode = 'live';
  appState.config = sanitizeAutosaveConfig(data.config, appState.config);

  return true;
}

function loadInitialConfig() {
  const fallback = {
    server: { port: PORT },
    debugRevealRoles: false,
    agentNames: ['', '', '', '', '', '', '', ''],
    computeSlots: [
      { provider: 'groq', api_key: '', model: 'llama-3.1-70b-versatile', visual_name: 'Slot A' },
      { provider: 'openrouter', api_key: '', model: 'deepseek/deepseek-r1', visual_name: 'Slot B' },
    ],
  };
  const cfg = loadJson(CONFIG_PATH, fallback);
  return normalizeConfigInput(cfg, fallback);
}

function sanitizeConfigForPublic(cfg) {
  return {
    server: { port: cfg.server?.port || PORT },
    debugRevealRoles: Boolean(cfg.debugRevealRoles),
    agentNames: Array.isArray(cfg.agentNames) ? cfg.agentNames : [],
    computeSlots: (cfg.computeSlots || []).map((s) => ({
      provider: s.provider,
      model: s.model,
      visual_name: s.visual_name || '',
      api_key: s.api_key ? '••••••••' : '',
    })),
  };
}

async function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e7) {
        reject(new Error('Body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, code, value) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

function contentTypeFor(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (file.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'text/plain; charset=utf-8';
}

function serveStatic(req, res, pathname) {
  let file = pathname === '/' ? '/index.html' : pathname;
  file = path.normalize(file).replace(/^\.+/, '');
  const abs = path.join(PUBLIC, file);
  if (!abs.startsWith(PUBLIC)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(abs, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, {
      'Content-Type': contentTypeFor(abs),
      'Cache-Control': abs.endsWith('.html') ? 'no-store' : 'public, max-age=60',
    });
    res.end(data);
  });
}




function createFaunaEntities() {
  const spawnTicks = [360, 780, 1260, 1740, 2280, 2880];
  const entities = [];
  let index = 0;
  for (const blueprint of FAUNA_BLUEPRINTS) {
    const kind = blueprint.kind;
    const startZone = blueprint.zones?.[0] || 'forest';
    const base = zoneCenter(startZone) || { x: WORLD_W / 2, y: WORLD_H / 2 };
    entities.push({
      id: `${kind}_${index + 1}`,
      kind,
      label: blueprint.label,
      position: {
        x: clamp(base.x + rand(-4, 4), 0, WORLD_W - 1),
        y: clamp(base.y + rand(-4, 4), 0, WORLD_H - 1),
      },
      health: kind === 'bear' ? 30 : 16,
      hunger: kind === 'bear' ? 0.25 : 0.15,
      aggression: blueprint.threat,
      speed: blueprint.speed,
      zones: blueprint.zones,
      pack: blueprint.pack,
      alive: true,
      active: false,
      spawnTick: spawnTicks[index % spawnTicks.length] + index * 90,
      lastAction: 'idle',
      target: null,
      state: 'hibernating',
    });
    index += 1;
  }
  return entities;
}


function syncShipSystems() {
  const ship = appState.world.ship;
  ship.sections = ship.sections || { boiler: 100, helm: 100, hull: 100, deck: 100, cargo: 100, brig: 100 };
  ship.sections.boiler = clamp(Math.min(ship.sections.boiler, ship.boilerHeat), 0, 100);
  ship.sections.helm = clamp(Math.min(ship.sections.helm, ship.helmHealth), 0, 100);
  ship.sections.hull = clamp(ship.sections.hull, 0, 100);
  ship.sections.deck = clamp(ship.sections.deck, 0, 100);
  ship.sections.cargo = clamp(ship.sections.cargo, 0, 100);
  ship.sections.brig = clamp(ship.sections.brig, 0, 100);
  ship.systems = { ...ship.sections };
  ship.boilerHeat = clamp(ship.boilerHeat, 0, 100);
  ship.helmHealth = clamp(ship.helmHealth, 0, 100);
  ship.integrity = clamp(Math.round((ship.sections.hull + ship.sections.deck + ship.sections.cargo) / 3), 0, 100);
}

function resolveTargetEntity(id) {
  if (!id) return null;
  const value = String(id);
  if (value.startsWith('fauna:')) {
    return appState.world.faunaEntities.find((f) => f.id === value.slice(6)) || null;
  }
  return targetFromId(value);
}

function moveFauna(entity, dx, dy) {
  const next = {
    x: clamp(entity.position.x + dx, 0, WORLD_W - 1),
    y: clamp(entity.position.y + dy, 0, WORLD_H - 1),
  };
  if (!canOccupyTile(entity, next.x, next.y)) return false;
  entity.position = next;
  return true;
}

function refreshShipAndFauna() {
  const world = appState.world;
  const overworld = world.overworld || (world.overworld = {
    route: Array.isArray(world.route) ? world.route.slice() : ['ship'],
    routeIndex: world.routeIndex || 0,
    voyageProgress: world.voyageProgress || 0,
    shipPosition: { ...shipWorldPosition(world) },
    landings: Array.isArray(world.landings) ? world.landings.slice() : [],
    canDisembark: Boolean(world.ship?.canDisembark),
  });
  const route = Array.isArray(overworld.route) && overworld.route.length ? overworld.route : ['ship'];
  const currentName = route[overworld.routeIndex % route.length] || 'ship';
  const nextName = route[(overworld.routeIndex + 1) % route.length] || currentName;
  const from = zoneCenter(currentName) || overworld.shipPosition || zoneCenter('ship') || { x: WORLD_W / 2, y: WORLD_H / 2 };
  const to = zoneCenter(nextName) || from;
  overworld.shipPosition = {
    x: clamp(lerp(from.x, to.x, clamp(overworld.voyageProgress, 0, 1)), 0, WORLD_W - 1),
    y: clamp(lerp(from.y, to.y, clamp(overworld.voyageProgress, 0, 1)), 0, WORLD_H - 1),
  };
  world.ship.worldPosition = { ...overworld.shipPosition };
  overworld.canDisembark = (overworld.landings || []).some((name) => {
    const z = ZONES[name];
    return z ? dist(overworld.shipPosition, z) <= z.radius + 1.5 : false;
  });
  world.ship.canDisembark = overworld.canDisembark;
  world.route = overworld.route;
  world.routeIndex = overworld.routeIndex;
  world.voyageProgress = overworld.voyageProgress;
  world.landings = overworld.landings;

  const aliveCrew = appState.agents.filter((a) => a.alive);
  for (const fauna of world.faunaEntities || []) {
    if (!fauna.alive) continue;
    if (!fauna.active && world.tick >= fauna.spawnTick) {
      fauna.active = true;
      fauna.state = 'active';
      pushEvent('fauna', `${fauna.label} has emerged from the snow.`, { position: { ...fauna.position }, kind: fauna.kind });
      pushWorldAlert('fauna', `${fauna.label} activity detected.`, { position: { ...fauna.position }, kind: fauna.kind });
    }
    if (!fauna.active) continue;

    fauna.hunger = clamp(fauna.hunger + (fauna.kind === 'bear' ? 0.0007 : 0.0012), 0, 1);
    const crewInRange = aliveCrew
      .filter((a) => a.alive && !a.imprisoned && dist(a.position, fauna.position) <= (fauna.kind === 'bear' ? 7 : 5))
      .sort((a, b) => dist(a.position, fauna.position) - dist(b.position, fauna.position));
    const targetCrew = crewInRange[0] || null;

    let target = null;
    if (fauna.hunger > 0.82 && targetCrew) {
      target = targetCrew.position;
      fauna.state = 'hunting';
    } else if (fauna.hunger > 0.93 && overworld.canDisembark && dist(fauna.position, overworld.shipPosition) <= (fauna.kind === 'bear' ? 14 : 10)) {
      target = overworld.shipPosition;
      fauna.state = 'circling_ship';
    } else {
      const zoneName = choice(fauna.zones || ['forest']);
      target = zoneCenter(zoneName) || fauna.position;
      fauna.state = 'roaming';
    }

    if (target) {
      const step = basicPathStep(fauna.position, target, fauna, { allowWater: true });
      const moveChance = (fauna.kind === 'bear' ? 0.10 : 0.20) * Math.max(0.4, fauna.speed || 1) * SIM_PACE;
      const extra = fauna.hunger > 0.9 ? 1 : 0;
      if (Math.random() < moveChance) {
        moveFauna(fauna, step.x, step.y);
        if (extra && Math.random() < 0.12) moveFauna(fauna, step.x, step.y);
      }
    }

    if (targetCrew && dist(targetCrew.position, fauna.position) <= (fauna.kind === 'bear' ? 2.2 : 1.8)) {
      const attackChance = fauna.kind === 'bear' ? 0.012 : 0.008;
      if (Math.random() < attackChance) {
        const dmg = fauna.kind === 'bear' ? 1.4 + Math.random() * 1.8 : 0.8 + Math.random() * 1.6;
        applyDamage(targetCrew, dmg, fauna.label.toLowerCase(), 'attack');
        fauna.lastAction = 'attack';
        pushEvent('attack', `${fauna.label} attacked ${targetCrew.name}.`, { position: { ...fauna.position }, target: targetCrew.id });
      }
    } else {
      fauna.lastAction = fauna.state;
    }
  }

  world.fauna = {
    wolves: (world.faunaEntities || []).filter((f) => f.active && f.kind === 'wolf').length,
    bears: (world.faunaEntities || []).filter((f) => f.active && f.kind === 'bear').length,
  };
}


const appState = {
  config: loadInitialConfig(),
  world: createWorld(),
  agents: [],
  assignment: { counts: [], slotOfAgent: [] },
  running: false,
  mode: 'offline',
  queue: new Set(),
  lastSaveAt: Date.now(),
};

runtimeAppState = appState;

restoreAutosave();

function runGameOrchestrator() {
  if (!appState.running) return;
  applyWorldEffects();
  shipMeta.updateShipMetaSystems(appState.world, appState.agents);
  refreshPerceptionAndSchedule();
  maybeImmediateDecisions();
  processQueue();
  appState.world.sot = buildWorldSot();
  if (Date.now() - appState.lastSaveAt > 10000) saveAutosave();
}

setInterval(() => {
  if (!appState.running) return;
  runGameOrchestrator();
}, TICK_MS);


setInterval(() => {
  if (appState.running) saveAutosave();
}, 30000);

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = decodeURIComponent(parsed.pathname || '/');

  if (pathname === '/api/state' && req.method === 'GET') {
    return sendJson(res, 200, serializePublicState());
  }

  if (pathname === '/api/config' && req.method === 'GET') {
    return sendJson(res, 200, sanitizeConfigForPublic(appState.config));
  }

  if (pathname === '/api/config' && req.method === 'POST') {
    try {
      const body = await readRequestBody(req);
      const saved = persistConfigSnapshot(body);
      return sendJson(res, 200, { ok: true, config: sanitizeConfigForPublic(saved) });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  }

  if (pathname === '/api/start' && req.method === 'POST') {
    try {
      const body = await readRequestBody(req);
      const validation = await validateStartConfig(body);
      if (!validation.ok) return sendJson(res, 400, { ok: false, errors: validation.errors });
      appState.config.computeSlots = validation.slots;
      appState.config.debugRevealRoles = Boolean(body.debugRevealRoles);
      appState.config.agentNames = Array.isArray(body.agentNames) ? body.agentNames : appState.config.agentNames;
      startMatch(validation);
      saveJson(CONFIG_PATH, appState.config);
      return sendJson(res, 200, { ok: true, state: serializePublicState(), config: sanitizeConfigForPublic(appState.config) });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  }

  if (pathname === '/api/stop' && req.method === 'POST') {
    stopMatch('Match stopped by server command.');
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/reset' && req.method === 'POST') {
    stopMatch('Reset to lobby.');
    appState.world = createWorld();
    appState.agents = [];
    appState.assignment = { counts: [], slotOfAgent: [] };
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/export' && req.method === 'GET') {
    return sendJson(res, 200, { ok: true, snapshot: serializePublicState() });
  }

  if (pathname === '/api/recover' && req.method === 'POST') {
    const ok = restoreAutosave();
    return sendJson(res, ok ? 200 : 404, { ok });
  }

  if (pathname === '/api/save' && req.method === 'POST') {
    saveAutosave();
    return sendJson(res, 200, { ok: true });
  }

  if (pathname.startsWith('/api/agent/') && req.method === 'GET') {
    const id = pathname.split('/').pop();
    const agent = targetFromId(id);
    if (!agent) return sendJson(res, 404, { ok: false, error: 'Agent not found' });
    return sendJson(res, 200, { ok: true, agent });
  }

  if (pathname.startsWith('/api/probe-model') && req.method === 'POST') {
    try {
      const body = await readRequestBody(req);
      const slot = {
        provider: String(body.provider || '').trim().toLowerCase(),
        api_key: String(body.api_key || '').trim(),
        model: String(body.model || '').trim(),
      };
      await providerProbe(slot);
      return sendJson(res, 200, { ok: true });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }

  return serveStatic(req, res, pathname);
});

function startServer(port, retries = 10) {
  const onError = (err) => {
    if (err && err.code === 'EADDRINUSE' && retries > 0) {
      const nextPort = port + 1;
      console.warn(`Port ${port} is in use, trying ${nextPort}...`);
      server.removeListener('error', onError);
      startServer(nextPort, retries - 1);
      return;
    }
    console.error('Server failed to start:', err);
    process.exit(1);
  };

  server.once('error', onError);
  server.listen(port, () => {
    console.log(`Arctic Betrayal LLM Simulator running on http://localhost:${port}`);
  });
}

startServer(PORT);

process.on('SIGINT', () => {
  saveAutosave();
  process.exit(0);
});

process.on('SIGTERM', () => {
  saveAutosave();
  process.exit(0);
});


// --- Movement / pacing / resource-system override layer ---
const TILE_MOVE_MS = 320;
const HUMAN_MOVE_MAX_STEPS = 1;
const FAUNA_MOVE_MAX_STEPS = 1;
const HUMAN_DECISION_MIN_MS = 9000;
const HUMAN_DECISION_MAX_MS = 16000;
const FAUNA_STEP_MS = 500;

function etaSeconds(ms) {
  return Math.max(0.25, Number(ms || 0) / 1000);
}

function formatEta(ms) {
  const s = etaSeconds(ms);
  return s < 10 ? `${s.toFixed(2)}s` : `${Math.round(s)}s`;
}

function getEntityPosition(entity) {
  return entity?.position ? { x: Math.round(entity.position.x), y: Math.round(entity.position.y) } : null;
}

function setEntityPosition(entity, pos) {
  if (!entity || !pos) return false;
  const next = {
    x: clamp(Math.round(pos.x), 0, WORLD_W - 1),
    y: clamp(Math.round(pos.y), 0, WORLD_H - 1),
  };
  if (!canOccupyTile(entity, next.x, next.y, { world: appState.world })) return false;
  entity.position = next;
  entity.lastSeen = { x: next.x, y: next.y, tick: appState?.world?.tick || 0 };
  if (entity.onShip) normalizeShipOccupant(entity, appState.world);
  return true;
}

function nearestOpenTile(origin, maxRadius = 2) {
  const base = origin || { x: WORLD_W / 2, y: WORLD_H / 2 };
  const candidates = [];
  for (let r = 0; r <= maxRadius; r += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      for (let dy = -r; dy <= r; dy += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = clamp(Math.round(base.x + dx), 0, WORLD_W - 1);
        const y = clamp(Math.round(base.y + dy), 0, WORLD_H - 1);
        if (!tileBlocked(x, y)) candidates.push({ x, y });
      }
    }
  }
  return candidates[0] || { x: clamp(Math.round(base.x), 0, WORLD_W - 1), y: clamp(Math.round(base.y), 0, WORLD_H - 1) };
}

function findNearestDisembarkTile(world = appState.world) {
  const shipPos = shipWorldPosition(world) || { x: WORLD_W / 2, y: WORLD_H / 2 };
  const maxRadius = 8;
  for (let r = 2; r <= maxRadius; r += 1) {
    const candidates = [];
    for (let dx = -r; dx <= r; dx += 1) {
      for (let dy = -r; dy <= r; dy += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = clamp(Math.round(shipPos.x + dx), 0, WORLD_W - 1);
        const y = clamp(Math.round(shipPos.y + dy), 0, WORLD_H - 1);
        if (tileBlocked(x, y)) continue;
        if (terrainCodeAt(x, y) === '~') continue;
        if (dist({ x, y }, shipPos) <= ZONES.ship.radius + 1) continue;
        candidates.push({ x, y });
      }
    }
    if (candidates.length) {
      candidates.sort((a, b) => dist(a, shipPos) - dist(b, shipPos));
      return candidates[0];
    }
  }
  return nearestOpenTile(shipPos, 4);
}

function buildTilePath(from, to, maxSteps = 12, entity = null) {
  return buildTilePathCore({
    from,
    to,
    maxSteps,
    basicPathStep,
    canOccupy: (x, y) => canOccupyTile(entity, x, y),
    clampX: (x) => clamp(x, 0, WORLD_W - 1),
    clampY: (y) => clamp(y, 0, WORLD_H - 1),
  });
}

function shipSafeTileBlocked(x, y) {
  // Boulders are overworld obstacles; inside ship they do not apply.
  return false;
}

function movementStepMsFor(entity) {
  if (entity?.kind) return entity.kind === 'bear' ? 500 : FAUNA_STEP_MS;
  return TILE_MOVE_MS;
}

function clearMovementOrder(entity) {
  if (!entity) return;
  entity.movementOrder = null;
  entity.movementIntent = null;
}

function scheduleMovementOrder(entity, target, opts = {}) {
  if (!entity || !entity.alive || !target) return false;
  const origin = getEntityPosition(entity);
  if (!origin) return false;
  const maxSteps = Math.max(1, Math.min(opts.maxSteps || (entity?.kind ? FAUNA_MOVE_MAX_STEPS : HUMAN_MOVE_MAX_STEPS), 8));
  const path = buildTilePath(origin, target, maxSteps, entity);
  if (!path.length) return false;

  const now = Date.now();
  const stepMs = Math.max(200, Math.min(1000, Number(opts.stepMs || movementStepMsFor(entity))));
  const etaMs = path.length * stepMs;
  const label = opts.label || opts.kind || 'move';

  entity.movementOrder = {
    kind: String(opts.kind || 'move'),
    label: String(label),
    targetId: opts.targetId ? String(opts.targetId) : null,
    target: { x: Math.round(target.x), y: Math.round(target.y) },
    path,
    pathIndex: 0,
    stepMs,
    nextStepAt: now + stepMs,
    startedAt: now,
    etaMs,
    arrivalAt: now + etaMs,
    updatedAt: now,
  };
  entity.movementIntent = entity.movementOrder;
  entity.currentAction = 'move';

  const etaText = formatEta(etaMs);
  const dest = opts.destinationName || opts.label || opts.kind || 'destination';
  addMemory(entity, `Planned ${entity.movementOrder.kind} toward ${dest}; ETA ${etaText}.`, 'movement');
  pushEvent('movement_plan', `${entity.name} will reach ${dest} in about ${etaText}.`, {
    agent: entity.id,
    kind: entity.movementOrder.kind,
    target: { x: Math.round(target.x), y: Math.round(target.y) },
    etaMs,
    pathLength: path.length,
  });
  if (opts.speech) processSpeech(entity, String(opts.speech).slice(0, 220));
  return true;
}

function movementProgressSummary(entity) {
  const order = entity?.movementOrder;
  if (!order) return null;
  const remaining = Math.max(0, (order.path || []).length - (order.pathIndex || 0));
  return {
    kind: order.kind,
    targetId: order.targetId,
    target: order.target ? { ...order.target } : null,
    pathLength: order.path.length,
    remainingSteps: remaining,
    etaMs: Math.max(0, order.arrivalAt - Date.now()),
    stepMs: order.stepMs,
    updatedAt: order.updatedAt,
  };
}

function resyncMovementOrder(entity) {
  if (!entity?.movementOrder || !entity.alive) return null;
  const order = entity.movementOrder;
  const target = order.targetId ? resolveTargetEntity(order.targetId) : null;
  const intended = target && target.position ? { ...target.position } : order.target;
  if (!intended) return order;
  order.target = { x: Math.round(intended.x), y: Math.round(intended.y) };
  const from = getEntityPosition(entity);
  if (!from) return order;
  const remaining = buildTilePath(from, order.target, entity?.kind ? FAUNA_MOVE_MAX_STEPS : HUMAN_MOVE_MAX_STEPS, entity);
  if (remaining.length) {
    order.path = remaining;
    order.pathIndex = 0;
    order.etaMs = remaining.length * order.stepMs;
    order.arrivalAt = Date.now() + order.etaMs;
    order.updatedAt = Date.now();
  }
  return order;
}

function completeMovementOrder(entity) {
  const order = entity?.movementOrder;
  if (!order) return;
  if (order.kind === 'embark') {
    entity.onShip = true;
    setEntityPosition(entity, shipInteriorCenter(appState.world));
    normalizeShipOccupant(entity, appState.world);
  } else if (order.kind === 'disembark') {
    const landing = order.target || findNearestDisembarkTile(appState.world);
    entity.onShip = false;
    entity.shipCompartment = null;
    entity.position = {
      x: clamp(Math.round(landing?.x ?? entity.position?.x ?? 0), 0, WORLD_W - 1),
      y: clamp(Math.round(landing?.y ?? entity.position?.y ?? 0), 0, WORLD_H - 1),
    };
    entity.swimming = false;
    entity.lastSeen = { x: entity.position.x, y: entity.position.y, tick: appState?.world?.tick || 0 };
  } else if (entity.onShip) {
    normalizeShipOccupant(entity, appState.world);
  }
  addMemory(entity, `Arrived after ${order.kind}.`, 'movement');
  pushEvent('movement_arrival', `${entity.name} arrived at ${order.targetId || order.kind}.`, {
    agent: entity.id,
    kind: order.kind,
    position: { ...entity.position },
  });
  clearMovementOrder(entity);
}

function stepMovementEntity(entity) {
  if (!entity?.alive || !entity.movementOrder) return false;
  const order = resyncMovementOrder(entity);
  if (!order) return false;
  if (Date.now() < order.nextStepAt) return false;

  const nextPos = order.path[order.pathIndex];
  if (!nextPos) {
    completeMovementOrder(entity);
    return false;
  }

  const moved = setEntityPosition(entity, nextPos);
  order.pathIndex += 1;
  order.updatedAt = Date.now();

  if (!moved) {
    clearMovementOrder(entity);
    return false;
  }

  const site = siteForPosition(entity.position);
  if (site && entity.id) registerSiteDiscovery(entity, site, 'movement');
  const trap = trapAtPosition(entity.position);
  if (trap) triggerTrap(entity, trap);

  if (order.pathIndex >= order.path.length || dist(entity.position, order.target) <= 1) {
    completeMovementOrder(entity);
    return true;
  }

  order.nextStepAt = Date.now() + order.stepMs;
  order.etaMs = Math.max(0, order.arrivalAt - Date.now());

  if (entity.kind) entity.lastAction = order.kind;
  return true;
}

function movementAwareSpeech(agent, targetName, steps) {
  const etaText = formatEta(steps * TILE_MOVE_MS);
  return `Voy hacia ${targetName} en ${steps} paso${steps === 1 ? '' : 's'}; ETA ${etaText}.`;
}

function processMovementOrders() {
  const world = appState.world;
  if (!world) return;

  if (!Array.isArray(world.groundSupplies)) world.groundSupplies = [];
  world.groundSupplies = world.groundSupplies.filter((s) => s && !s.expired);
  for (const supply of world.groundSupplies) {
    supply.ttl = Number.isFinite(supply.ttl) ? supply.ttl - 1 : 220;
    if (supply.ttl <= 0) supply.expired = true;
  }
  world.groundSupplies = world.groundSupplies.filter((s) => !s.expired);

  for (const agent of appState.agents) {
    if (!agent.alive) continue;
    if (agent.movementOrder) stepMovementEntity(agent);
  }

  for (const fauna of world.faunaEntities || []) {
    if (!fauna.alive) continue;
    if (fauna.movementOrder) stepMovementEntity(fauna);
  }
}














if (appState?.world) {
  if (!Array.isArray(appState.world.groundSupplies)) appState.world.groundSupplies = [];
  for (const ag of appState.agents || []) ag.movementOrder = ag.movementOrder || null;
  for (const fauna of appState.world.faunaEntities || []) fauna.isFauna = true;
}


// --- Refactor layer: urgency-driven decisions and unified tile movement ---

function decisionPressureScore(agent, obs = null) {
  if (!agent?.alive) return 0;
  const env = obs || computeEnvironmentForAgent(agent);
  let score = 0;
  const hunger = Number(env.hunger || 0);
  const health = Number(env.health || 100);
  const stamina = Number(env.stamina || 100);
  const morale = Number(env.morale || 1);
  const visible = Array.isArray(env.visible_entities) ? env.visible_entities : [];
  const localEvents = Array.isArray(env.local_events) ? env.local_events : [];
  const heard = Array.isArray(env.heard_messages) ? env.heard_messages : [];
  const encounters = Array.isArray(env.encounters) ? env.encounters : [];

  score += hunger > 0.8 ? 0.3 : hunger * 0.05;
  score += health < 30 ? 0.35 : health < 60 ? 0.16 : 0;
  score += stamina < 30 ? 0.18 : 0;
  score += morale < 0.35 ? 0.08 : 0;
  if (visible.some((e) => e.distance <= 2.5)) score += 0.45;
  if (visible.some((e) => e.current_action === 'attack' || e.current_action === 'sabotage' || e.imprisoned)) score += 0.2;
  if (heard.length) score += Math.min(0.18, heard.length * 0.04);
  if (localEvents.some((e) => isCriticalEvent(e.type))) score += 0.55;
  if (encounters.length) score += 0.12;
  if (agent.movementOrder || agent.movementIntent) score -= 0.2;
  if (agent.imprisoned) score += 0.08;
  return clamp(score, 0, 1);
}

function nextDecisionDelayMs(agent, decision, obs = null) {
  const urgency = decisionPressureScore(agent, obs);
  const actionType = decision?.action?.type || 'wait';
  const movement = agent?.movementOrder;

  if (movement?.arrivalAt) {
    return clamp(Math.round((movement.arrivalAt - Date.now()) * 0.5) + intRand(300, 900), 900, 4200);
  }

  const actionBias = {
    attack: -2200,
    hunt: -2000,
    sabotage: -1800,
    imprison: -1400,
    move: -1100,
    move_to_zone: -1100,
    follow: -700,
    patrol: -650,
    search: -550,
    gather: -400,
    salvage: -400,
    craft: -350,
    share: -220,
    take: -220,
    drop: 700,
    rest: 2800,
    wait: 3600,
  };

  const speechBias = decision?.speech ? -1000 : 0;
  const repeatBias = agent?.lastDecision?.action?.type === actionType ? 550 : 0;
  const base = decision?.speech ? intRand(3800, 7600) : intRand(8600, 16000);
  const bias = actionBias[actionType] || 0;
  const urgencyBias = Math.round(urgency * 5200);
  const result = base + bias + speechBias + repeatBias - urgencyBias;
  return clamp(Math.round(result), 1200, 22000);
}








// --- Goal / memory / ECS / action expansion layer ---
function ensureShipSystemsShape(ship = {}) {
  const base = ship.systems && typeof ship.systems === 'object' ? ship.systems : {};
  const defaults = {
    boiler: 100,
    helm: 100,
    hull: 100,
    nav: 100,
    lights: 90,
    security: 80,
    comms: 70,
    lifeSupport: 100,
    drainage: 100,
    alarm: 10,
    pressure: 0,
  };
  return { ...defaults, ...base };
}








function shipDoorIndex(world = {}) {
  const doors = shipInterior.buildShipDoors(world);
  const map = new Map();
  for (const door of doors) map.set(door.id, door);
  return map;
}

function resolveShipDoorTarget(action = {}, obs = {}, agent = null) {
  const candidate = action.door || action.target || action.compartment || action.room || action.mode || null;
  if (!candidate) return null;
  const world = appState.world;
  const doors = shipInterior.buildShipDoors(world);
  if (doors.some((d) => d.id === candidate)) return candidate;
  const current = agent ? shipInterior.shipCompartmentForPosition(agent.position, world) : null;
  const room = String(candidate);
  if (room.includes('door:')) return room.replace('door:', '');
  if (doors.some((d) => d.from === room || d.to === room)) return doors.find((d) => d.from === room || d.to === room)?.id || null;
  if (current) {
    const match = doors.find((d) => (d.from === current.id && d.to === room) || (d.to === current.id && d.from === room));
    if (match) return match.id;
  }
  return null;
}

function setDoorState(world, doorId, state) {
  if (!world?.ship) return false;
  world.ship.doors = world.ship.doors || {};
  const doorMap = shipDoorIndex(world);
  const door = doorMap.get(doorId);
  if (!door) return false;
  world.ship.doors[doorId] = {
    ...(world.ship.doors[doorId] || {}),
    state,
    flooded: Number(world.ship.doors[doorId]?.flooded ?? 0),
    noise: state === 'open' ? 0.28 : state === 'ajar' ? 0.18 : 0.08,
    integrity: Number(world.ship.doors[doorId]?.integrity ?? 100),
  };
  return true;
}

function currentShipCompartment(agent) {
  const world = appState.world;
  return shipInterior.shipCompartmentForPosition(agent?.position, world)?.id || agent?.shipCompartment || (agent?.onShip ? shipInterior.shipCompartmentForPosition(agent.position, world)?.id : null) || null;
}

function shipActionContext(agent, obs) {
  const world = appState.world;
  const comp = currentShipCompartment(agent);
  const visibility = obs.ship_visibility || shipInterior.shipVisibilityForAgent(agent, world, appState.agents);
  const flood = visibility.flood || shipInterior.shipFloodingState(world);
  const sounds = visibility.audibleSources || [];
  const goals = Array.isArray(agent?.memory?.goals) ? agent.memory.goals.slice() : [];
  return { world, comp, visibility, flood, sounds, goals };
}


function chooseShipGoalAction(agent, obs) {
  const ctx = shipActionContext(agent, obs);
  const directive = shipMeta.buildCrewDirective(agent, ctx.world, obs, appState.agents);
  if (directive?.action) return directive.action;

  const utilities = agent.utility || {};
  const ship = ctx.world.ship || {};
  const comp = ctx.comp;
  const hiddenGoals = Array.isArray(agent?.memory?.hiddenGoals) ? agent.memory.hiddenGoals : [];
  const isTraitor = agent.role === 'traitor';
  const evidenceCount = Array.isArray(ctx.world.evidence) ? ctx.world.evidence.length : 0;
  const mutinyRisk = Number(ctx.world.mutiny?.risk || 0);
  const fireHere = Number(ctx.world.ship?.fire?.compartments?.[comp] || 0);
  const powerHere = Number(ctx.world.ship?.power?.grid?.[comp] ?? ctx.world.ship?.power?.reserve ?? 0.5);
  const radioGood = Number(ctx.world.ship?.radio?.signal || 0);
  const visibleCrew = Array.isArray(obs.nearbyCrew) ? obs.nearbyCrew : [];
  const visibleThreat = Array.isArray(obs.visible_entities) ? obs.visible_entities.find((e) => e.id !== agent.id && (e.current_action === 'attack' || e.current_action === 'sabotage' || e.imprisoned)) : null;
  const woundedCrew = visibleCrew.find((c) => {
    const target = ctx.world.agents?.find?.((a) => a.id === c.id) || appState.agents.find((a) => a.id === c.id);
    return target && target.alive && target.health < 70;
  }) || null;

  if (fireHere > 0.14 && !isTraitor) return { type: 'extinguish_fire', compartment: comp || 'mess' };
  if (!isTraitor && mutinyRisk > 0.55 && (agent.profession === 'Captain' || agent.profession === 'Pastor')) return { type: 'rally' };
  if (!isTraitor && evidenceCount > 0 && (agent.profession === 'Captain' || agent.profession === 'Royal Marine' || agent.profession === 'Doctor')) return { type: 'report', channel: agent.crewRole?.channel || 'all', message: 'I have evidence to share.' };
  if (!isTraitor && agent.profession === 'Engineer' && powerHere < 0.45) return { type: 'reroute_power', compartment: comp || 'boiler' };
  if (!isTraitor && radioGood > 0.35 && utilities.social > 0.68) return { type: 'radio', message: 'Status check. Stay alert.' };
  if (!isTraitor && woundedCrew && agent.profession === 'Doctor') return { type: 'heal', target: woundedCrew.id };
  if (!isTraitor && visibleThreat && (agent.profession === 'Royal Marine' || agent.profession === 'Hunter')) return { type: 'attack', target: visibleThreat.id };

  if (isTraitor && (utilities.sabotage > 0.6 || hiddenGoals.length)) {
    const door = shipInterior.buildShipDoors(ctx.world).find((d) => d.from === comp || d.to === comp || d.open) || null;
    if (door && Math.random() < 0.5) return { type: 'sabotage_door', door: door.id };
    if (fireHere <= 0.08 && radioGood > 0.2 && Math.random() < 0.35) return { type: 'start_fire', compartment: comp || 'cargo' };
    return { type: 'sabotage_ship', target: comp || 'ship' };
  }

  if ((ctx.flood[comp] || 0) > 0.35) return { type: 'pump', target: comp || 'ship' };
  if ((ship.integrity ?? 100) < 70) return { type: 'repair' };
  if ((ship.boilerHeat ?? 0) < 40) return { type: 'refuel' };
  if (utilities.conceal > 0.72) return { type: 'hide' };
  if (utilities.social > 0.72 && visibleCrew.length) return { type: 'whisper', target: visibleCrew[0].id };
  if (visibleThreat) return { type: 'inspect_room' };
  return null;
}








if (!appState.world.ecs) appState.world.ecs = null;
if (!appState.world.ship) appState.world.ship = {};
appState.world.ship.systems = ensureShipSystemsShape(appState.world.ship);
