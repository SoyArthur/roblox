const shipInterior = require('./ship_interior');

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(16).slice(2, 8)}`;
}

function dist(a, b) {
  if (!a || !b) return Infinity;
  return Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.y ?? 0) - (b.y ?? 0));
}

const CREW_ROLE_CATALOG = {
  Captain: {
    duty: 'command',
    channel: 'bridge',
    responsibilities: ['command', 'discipline', 'mutiny response'],
    permissions: ['radio', 'inspect_system', 'rally', 'appease', 'report'],
  },
  Doctor: {
    duty: 'medical',
    channel: 'medical',
    responsibilities: ['treat injuries', 'triage', 'contain panic'],
    permissions: ['heal', 'tend', 'report', 'inspect_room'],
  },
  Engineer: {
    duty: 'systems',
    channel: 'engine',
    responsibilities: ['power grid', 'flood control', 'fire suppression', 'mechanical repairs'],
    permissions: ['reroute_power', 'extinguish_fire', 'repair', 'pump', 'inspect_system'],
  },
  Cook: {
    duty: 'logistics',
    channel: 'all',
    responsibilities: ['food', 'morale', 'crew rhythm'],
    permissions: ['cook', 'share', 'report', 'inspect_room'],
  },
  Hunter: {
    duty: 'security',
    channel: 'security',
    responsibilities: ['threat response', 'patrol', 'tracking'],
    permissions: ['attack', 'track', 'inspect_room', 'report'],
  },
  Navigator: {
    duty: 'navigation',
    channel: 'bridge',
    responsibilities: ['route awareness', 'external risk', 'ship positioning'],
    permissions: ['signal', 'radio', 'inspect_system', 'report'],
  },
  Pastor: {
    duty: 'morale',
    channel: 'all',
    responsibilities: ['trust', 'appeasement', 'mutiny de-escalation'],
    permissions: ['appease', 'report', 'rally', 'share'],
  },
  'Royal Marine': {
    duty: 'enforcement',
    channel: 'security',
    responsibilities: ['order', 'containment', 'boarding defense'],
    permissions: ['imprison', 'free', 'attack', 'rally', 'report'],
  },
  default: {
    duty: 'crew',
    channel: 'all',
    responsibilities: ['daily survival', 'local response'],
    permissions: ['report', 'inspect_room', 'signal'],
  },
};

function buildCrewRoleProfile(agent = {}) {
  const base = CREW_ROLE_CATALOG[agent.profession] || CREW_ROLE_CATALOG.default;
  return {
    profession: agent.profession || 'Crew',
    duty: base.duty,
    channel: base.channel,
    responsibilities: base.responsibilities.slice(),
    permissions: base.permissions.slice(),
    isLeader: agent.profession === 'Captain',
    isSystems: agent.profession === 'Engineer',
    isSecurity: agent.profession === 'Royal Marine' || agent.profession === 'Hunter',
    isMedical: agent.profession === 'Doctor',
  };
}

function buildCrewRoleCatalog() {
  const out = {};
  for (const [k, v] of Object.entries(CREW_ROLE_CATALOG)) out[k] = clone(v);
  return out;
}

function initShipPowerState() {
  return {
    generation: 0.78,
    reserve: 0.66,
    demand: 0.34,
    grid: {},
    allocations: {
      lights: 0.85,
      radio: 0.72,
      pumps: 0.78,
      doors: 0.72,
      sensors: 0.68,
      lifeSupport: 0.88,
      alarm: 0.5,
      fireSuppression: 0.45,
    },
    outages: [],
    reroutes: {},
    history: [],
    lastUpdateTick: 0,
  };
}

function initShipRadioState() {
  return {
    active: true,
    signal: 0.72,
    interference: 0.08,
    channels: {
      all: [],
      bridge: [],
      engine: [],
      medical: [],
      security: [],
    },
    log: [],
    lastBroadcasts: [],
    lastUpdateTick: 0,
  };
}

function initShipFireState() {
  return {
    compartments: {},
    smoke: {},
    sources: [],
    alarms: [],
    lastUpdateTick: 0,
  };
}

function initMutinyState() {
  return {
    risk: 0.06,
    stage: 'quiet',
    pressure: 0,
    supporters: [],
    triggers: [],
    lastUpdateTick: 0,
  };
}

function initEvidenceState() {
  return [];
}

function ensureShipMetaState(world = {}, agents = []) {
  if (!world.ship) world.ship = {};
  world.ship.power = { ...initShipPowerState(), ...(world.ship.power || {}) };
  world.ship.radio = { ...initShipRadioState(), ...(world.ship.radio || {}) };
  world.ship.fire = { ...initShipFireState(), ...(world.ship.fire || {}) };
  world.evidence = Array.isArray(world.evidence) ? world.evidence : initEvidenceState();
  world.mutiny = { ...initMutinyState(), ...(world.mutiny || {}) };
  world.crewRoles = { ...(world.crewRoles || {}), catalog: buildCrewRoleCatalog() };
  for (const agent of agents || []) {
    if (!agent) continue;
    agent.crewRole = agent.crewRole || buildCrewRoleProfile(agent);
  }
  return world;
}

function compartmentFromEvent(world = {}, event = {}) {
  const comp = event.compartment || event.room || event.targetCompartment || null;
  if (comp) return String(comp);
  const pos = event.position || event.sourcePosition || null;
  if (pos) return shipInterior.shipCompartmentForPosition(pos, world)?.id || null;
  const agentPos = event.agent?.position || null;
  if (agentPos) return shipInterior.shipCompartmentForPosition(agentPos, world)?.id || null;
  return null;
}

function witnessesForEvent(world = {}, agents = [], event = {}) {
  const witnesses = [];
  const sourceId = event.agentId || event.sourceAgentId || event.agent?.id || null;
  const position = event.position || event.sourcePosition || event.agent?.position || null;
  const comp = compartmentFromEvent(world, event);
  const radius = Number(event.radius ?? (event.type === 'fire' ? 7 : event.type === 'radio' ? 10 : 5));

  for (const agent of agents || []) {
    if (!agent?.alive) continue;
    if (sourceId && agent.id === sourceId) continue;
    let seen = false;
    let reason = '';

    if (agent.onShip && comp) {
      const vis = shipInterior.shipVisibilityForAgent(agent, world, agents);
      if (vis.visibleCompartments?.includes(comp)) {
        seen = true;
        reason = 'ship-visibility';
      }
    }

    if (!seen && position && agent.position) {
      const d = dist(agent.position, position);
      if (d <= radius) {
        seen = true;
        reason = 'radius';
      }
    }

    if (!seen && event.channel && agent.crewRole?.channel === event.channel) {
      seen = true;
      reason = 'radio-channel';
    }

    if (!seen && event.type === 'radio' && agent.onShip) {
      seen = true;
      reason = 'radio-audible';
    }

    if (seen) witnesses.push({ id: agent.id, reason });
  }

  return witnesses;
}

function recordEvidence(world = {}, agents = [], event = {}) {
  ensureShipMetaState(world, agents);
  const entry = {
    id: uid('ev'),
    tick: Number(world.tick || 0),
    ts: Date.now(),
    type: String(event.type || 'event'),
    text: String(event.text || '').slice(0, 220),
    compartment: compartmentFromEvent(world, event),
    position: event.position ? { x: Math.round(event.position.x), y: Math.round(event.position.y) } : null,
    agentId: event.agentId || event.agent?.id || null,
    targetId: event.targetId || null,
    channel: event.channel || null,
    severity: clamp(Number(event.severity ?? 0.5), 0, 1),
    data: event.data ? clone(event.data) : {},
  };
  entry.witnesses = witnessesForEvent(world, agents, event);
  world.evidence.push(entry);
  while (world.evidence.length > 140) world.evidence.shift();
  return entry;
}

function broadcastRadio(world = {}, agents = [], sourceAgent = null, message = '', options = {}) {
  ensureShipMetaState(world, agents);
  if (!sourceAgent || !message || !String(message).trim()) return null;
  const ship = world.ship || {};
  const channel = String(options.channel || sourceAgent.crewRole?.channel || 'all').toLowerCase();
  const entry = {
    id: uid('rad'),
    tick: Number(world.tick || 0),
    ts: Date.now(),
    agentId: sourceAgent.id,
    agentName: sourceAgent.name,
    profession: sourceAgent.profession,
    role: sourceAgent.role,
    channel,
    compartment: shipInterior.shipCompartmentForPosition(sourceAgent.position, world)?.id || sourceAgent.shipCompartment || null,
    message: String(message).trim().slice(0, 240),
    strength: clamp(Number(options.strength ?? ship.radio.signal ?? 0.5), 0, 1),
  };
  ship.radio.log.push(entry);
  while (ship.radio.log.length > 60) ship.radio.log.shift();
  ship.radio.channels[channel] = ship.radio.channels[channel] || [];
  ship.radio.channels[channel].push(entry);
  while (ship.radio.channels[channel].length > 18) ship.radio.channels[channel].shift();
  ship.radio.lastBroadcasts.push(entry);
  while (ship.radio.lastBroadcasts.length > 10) ship.radio.lastBroadcasts.shift();
  return entry;
}

function startFire(world = {}, agents = [], compartmentId = null, sourceAgent = null, intensity = 0.22, reason = 'fire') {
  ensureShipMetaState(world, agents);
  if (!compartmentId) return null;
  const id = String(compartmentId);
  const next = clamp((Number(world.ship.fire.compartments[id] || 0) + Number(intensity || 0.1)), 0, 1);
  world.ship.fire.compartments[id] = next;
  world.ship.fire.sources.push({
    id: uid('src'),
    tick: Number(world.tick || 0),
    compartment: id,
    agentId: sourceAgent?.id || null,
    reason,
    intensity: next,
  });
  while (world.ship.fire.sources.length > 30) world.ship.fire.sources.shift();
  return next;
}

function extinguishFire(world = {}, compartmentId = null, amount = 0.2) {
  if (!world?.ship?.fire || !compartmentId) return 0;
  const id = String(compartmentId);
  const current = Number(world.ship.fire.compartments[id] || 0);
  const next = clamp(current - Number(amount || 0), 0, 1);
  world.ship.fire.compartments[id] = next;
  if (next <= 0.01) delete world.ship.fire.compartments[id];
  return next;
}

function summarizeShipMeta(world = {}) {
  const ship = world.ship || {};
  const power = ship.power || {};
  const fire = ship.fire || {};
  const radio = ship.radio || {};
  const mutiny = world.mutiny || {};
  const evidence = Array.isArray(world.evidence) ? world.evidence : [];
  const totalFire = Object.values(fire.compartments || {}).reduce((a, b) => a + Number(b || 0), 0);
  const totalEvidence = evidence.length;
  const powerOut = Object.values(power.grid || {}).filter((v) => Number(v || 0) < 0.35).length;
  return {
    power: {
      generation: Number((power.generation ?? 0).toFixed(2)),
      reserve: Number((power.reserve ?? 0).toFixed(2)),
      demand: Number((power.demand ?? 0).toFixed(2)),
      lowZones: powerOut,
    },
    radio: {
      active: Boolean(radio.active),
      signal: Number((radio.signal ?? 0).toFixed(2)),
      interference: Number((radio.interference ?? 0).toFixed(2)),
      channels: Object.fromEntries(Object.entries(radio.channels || {}).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0])),
    },
    fire: {
      active: totalFire > 0,
      compartments: Object.keys(fire.compartments || {}).length,
      total: Number(totalFire.toFixed(2)),
      alarm: Boolean((fire.alarms || []).length),
    },
    evidence: {
      total: totalEvidence,
      recent: evidence.slice(-6).map((e) => ({ id: e.id, type: e.type, text: e.text, compartment: e.compartment, tick: e.tick })),
    },
    mutiny: {
      risk: Number((mutiny.risk ?? 0).toFixed(2)),
      stage: mutiny.stage || 'quiet',
      supporters: Array.isArray(mutiny.supporters) ? mutiny.supporters.slice(0, 8) : [],
      pressure: Number((mutiny.pressure ?? 0).toFixed(2)),
    },
  };
}

function updateCrewRoleAssignments(world = {}, agents = []) {
  ensureShipMetaState(world, agents);
  for (const agent of agents || []) {
    if (!agent) continue;
    agent.crewRole = buildCrewRoleProfile(agent);
  }
  return world.crewRoles;
}

function updatePowerGrid(world = {}, agents = []) {
  ensureShipMetaState(world, agents);
  const ship = world.ship || {};
  const comps = shipInterior.buildShipCompartments(world);
  const fire = ship.fire || { compartments: {} };
  const flooding = shipInterior.shipFloodingState(world);
  const fireTotal = Object.values(fire.compartments || {}).reduce((a, b) => a + Number(b || 0), 0);
  const crewOnShip = (agents || []).filter((a) => a?.alive && a.onShip).length;
  const reserveFromShip = clamp((Number(ship.boilerHeat ?? 0) * 0.004) + (Number(ship.fuel ?? 0) * 0.0025) + (Number(ship.integrity ?? 100) / 220), 0, 1);
  const generation = clamp(0.28 + reserveFromShip, 0, 1);
  const demand = clamp(0.2 + crewOnShip * 0.025 + fireTotal * 0.18 + Object.values(flooding).reduce((a, b) => a + Number(b || 0), 0) * 0.11, 0, 1);
  const reserve = clamp((Number(ship.power?.reserve ?? 0.66) * 0.7) + (generation - demand) * 0.55, 0, 1);
  const grid = {};
  for (const comp of comps) {
    const flood = Number(flooding[comp.id] || 0);
    const fireHere = Number(fire.compartments?.[comp.id] || 0);
    const laneBias = comp.lane === 'upper' ? 0.06 : comp.lane === 'middle' ? 0.02 : -0.04;
    const local = clamp(reserve + laneBias - flood * 0.34 - fireHere * 0.42 + (comp.id === 'boiler' ? 0.08 : 0), 0, 1);
    grid[comp.id] = local;
  }
  ship.power = {
    ...(ship.power || initShipPowerState()),
    generation,
    reserve,
    demand,
    grid,
    outages: Object.entries(grid).filter(([, v]) => v < 0.25).map(([k]) => k),
    reroutes: ship.power?.reroutes || {},
    history: Array.isArray(ship.power?.history) ? ship.power.history : [],
    lastUpdateTick: Number(world.tick || 0),
  };
  ship.systems = ship.systems || {};
  ship.systems.boiler = clamp((ship.boilerHeat ?? 0) * (0.8 + reserve * 0.2), 0, 100);
  ship.systems.helm = clamp((ship.helmHealth ?? 0) * (0.7 + reserve * 0.3), 0, 100);
  ship.systems.hull = clamp((ship.integrity ?? 100) * (0.75 + reserve * 0.25), 0, 100);
  ship.systems.nav = clamp(65 + reserve * 35, 0, 100);
  ship.systems.lights = clamp(100 * reserve, 0, 100);
  ship.systems.security = clamp(75 * reserve + (ship.fire?.alarms?.length ? -8 : 0), 0, 100);
  ship.systems.comms = clamp(100 * reserve - ship.fire?.alarms?.length * 4, 0, 100);
  ship.systems.lifeSupport = clamp(80 + reserve * 20 - fireTotal * 8, 0, 100);
  ship.systems.drainage = clamp(100 - Object.values(flooding).reduce((a, b) => a + Number(b || 0), 0) * 22, 0, 100);
  ship.systems.alarm = clamp((ship.fire?.alarms?.length ? 100 : 10) + fireTotal * 20, 0, 100);
  ship.power.history.push({ tick: Number(world.tick || 0), generation, demand, reserve });
  while (ship.power.history.length > 40) ship.power.history.shift();
  return ship.power;
}

function updateRadioNetwork(world = {}, agents = []) {
  ensureShipMetaState(world, agents);
  const ship = world.ship || {};
  const power = ship.power || initShipPowerState();
  const fire = ship.fire || initShipFireState();
  const flooding = shipInterior.shipFloodingState(world);
  const fireTotal = Object.values(fire.compartments || {}).reduce((a, b) => a + Number(b || 0), 0);
  const floodTotal = Object.values(flooding).reduce((a, b) => a + Number(b || 0), 0);
  ship.radio.signal = clamp(0.35 + (power.reserve || 0) * 0.45 - fireTotal * 0.18 - floodTotal * 0.12, 0, 1);
  ship.radio.interference = clamp(0.04 + (fireTotal * 0.12) + (floodTotal * 0.05) + (power.reserve < 0.3 ? 0.16 : 0), 0, 1);
  ship.radio.active = ship.radio.signal > 0.15;
  ship.radio.lastUpdateTick = Number(world.tick || 0);
  return ship.radio;
}

function spreadFire(world = {}, agents = []) {
  ensureShipMetaState(world, agents);
  const ship = world.ship || {};
  const current = { ...(ship.fire?.compartments || {}) };
  const doors = shipInterior.buildShipDoors(world);
  const adjacency = shipInterior.buildShipAdjacency(world);
  const flooding = shipInterior.shipFloodingState(world);
  const power = ship.power || initShipPowerState();
  const next = { ...current };
  const newlyBurning = [];

  const baseIgnition = clamp(((ship.boilerHeat ?? 0) - 55) / 120, 0, 0.12) + (ship.integrity < 65 ? 0.02 : 0);
  if ((ship.boilerHeat ?? 0) > 72 && Math.random() < 0.03) {
    const source = ['boiler', 'cargo', 'mess', 'hall'][Math.floor(Math.random() * 4)];
    next[source] = clamp((next[source] || 0) + 0.12 + baseIgnition, 0, 1);
    newlyBurning.push(source);
  }

  for (const [comp, value] of Object.entries(current)) {
    const flood = Number(flooding[comp] || 0);
    const localPower = Number(power.grid?.[comp] ?? power.reserve ?? 0.5);
    const decay = 0.01 + flood * 0.12 + localPower * 0.02;
    const growth = 0.02 + (ship.boilerHeat > 68 ? 0.02 : 0) + (ship.systems?.alarm > 60 ? 0.01 : 0);
    next[comp] = clamp(value + growth - decay, 0, 1);
    if (next[comp] <= 0.02) delete next[comp];
  }

  for (const [comp, value] of Object.entries({ ...next })) {
    if (value <= 0.05) continue;
    for (const neighbor of adjacency.get(comp) || []) {
      if (next[neighbor] >= 0.08) continue;
      const door = doors.find((d) => (d.from === comp && d.to === neighbor) || (d.from === neighbor && d.to === comp));
      const openFactor = door?.open ? 0.45 : door?.locked ? 0.05 : 0.18;
      const flood = Number(flooding[neighbor] || 0);
      const transfer = value * openFactor * (1 - flood * 0.45);
      if (transfer > 0.06 && Math.random() < 0.28) {
        next[neighbor] = clamp((next[neighbor] || 0) + transfer * 0.35, 0, 1);
        newlyBurning.push(neighbor);
      }
    }
  }

  ship.fire = ship.fire || initShipFireState();
  ship.fire.compartments = next;
  ship.fire.smoke = Object.fromEntries(Object.entries(next).map(([k, v]) => [k, clamp(v * 0.9, 0, 1)]));
  if (Object.keys(next).length) {
    ship.fire.alarms = Array.from(new Set([...(ship.fire.alarms || []), ...Object.keys(next)]));
  } else {
    ship.fire.alarms = [];
  }
  ship.fire.lastUpdateTick = Number(world.tick || 0);
  return {
    compartments: next,
    newlyBurning,
  };
}

function updateMutinyState(world = {}, agents = []) {
  ensureShipMetaState(world, agents);
  const ship = world.ship || {};
  const crew = (agents || []).filter((a) => a?.alive && a.onShip);
  const captain = crew.find((a) => a.profession === 'Captain') || null;
  const engineer = crew.find((a) => a.profession === 'Engineer') || null;
  const marine = crew.find((a) => a.profession === 'Royal Marine') || null;
  const fireTotal = Object.values(ship.fire?.compartments || {}).reduce((a, b) => a + Number(b || 0), 0);
  const floodTotal = Object.values(shipInterior.shipFloodingState(world)).reduce((a, b) => a + Number(b || 0), 0);
  const evidenceScore = Math.min(1, (world.evidence?.length || 0) / 12);
  const cohesion = clamp(Number(world.crewCohesion ?? 0.55), 0, 1);
  const trustPressure = crew.length
    ? crew.reduce((sum, a) => {
      const trust = Object.values(a.memory?.relationships || {}).reduce((s, v) => s + Number(v || 0), 0);
      return sum + trust;
    }, 0) / (crew.length * 5)
    : 0;
  const injured = crew.filter((a) => (a.health ?? 100) < 55).length;
  const prison = Number(world.prisoners?.length || 0);
  const mutinyRisk = clamp(
    0.08
    + evidenceScore * 0.2
    + fireTotal * 0.12
    + floodTotal * 0.08
    + injured * 0.04
    + prison * 0.03
    + (ship.power?.reserve < 0.3 ? 0.1 : 0)
    - cohesion * 0.18
    - trustPressure * 0.08
    - (captain ? 0.03 : 0)
    - (marine ? 0.02 : 0)
    - (engineer ? 0.02 : 0),
    0,
    1,
  );

  let stage = 'quiet';
  if (mutinyRisk > 0.78) stage = 'open';
  else if (mutinyRisk > 0.52) stage = 'brewing';
  else if (mutinyRisk > 0.28) stage = 'restless';

  const supporters = crew
    .filter((a) => {
      if (a.role === 'traitor') return false;
      const morale = Number(a.morale ?? 0.5);
      const suspicion = captain ? Number(a.memory?.suspicions?.[captain.id] || 0) : 0;
      const pressure = Number(a.injury || 0) + (a.imprisoned ? 0.15 : 0) + (morale < 0.35 ? 0.12 : 0) + suspicion * 0.3;
      return pressure > 0.28 || (stage === 'open' && morale < 0.45);
    })
    .map((a) => a.id);

  world.mutiny = {
    ...(world.mutiny || initMutinyState()),
    risk: mutinyRisk,
    stage,
    pressure: clamp((world.mutiny?.pressure ?? 0) * 0.8 + mutinyRisk * 0.2, 0, 1),
    supporters,
    triggers: [
      fireTotal > 0 ? 'fire' : null,
      floodTotal > 0.6 ? 'flooding' : null,
      evidenceScore > 0.45 ? 'evidence' : null,
      ship.power?.reserve < 0.35 ? 'blackout' : null,
      prison > 0 ? 'prisoners' : null,
    ].filter(Boolean),
    lastUpdateTick: Number(world.tick || 0),
  };
  return world.mutiny;
}


function buildCrewDirective(agent, world = {}, obs = {}, agents = []) {
  ensureShipMetaState(world, agents);
  const ship = world.ship || {};
  const comp = agent?.onShip ? shipInterior.shipCompartmentForPosition(agent.position, world)?.id || agent.shipCompartment || null : null;
  const role = buildCrewRoleProfile(agent || {});
  const visibility = obs.ship_visibility || (agent?.onShip ? shipInterior.shipVisibilityForAgent(agent, world, agents) : null) || {};
  const fireHere = Number(ship.fire?.compartments?.[comp] || 0);
  const floodHere = Number(visibility.flood?.[comp] ?? shipInterior.shipFloodingState(world)?.[comp] ?? 0);
  const powerHere = Number(ship.power?.grid?.[comp] ?? ship.power?.reserve ?? 0.5);
  const mutinyRisk = Number(world.mutiny?.risk ?? 0);
  const evidence = Array.isArray(obs.evidence) ? obs.evidence : Array.isArray(world.evidence) ? world.evidence : [];
  const radioMessages = Array.isArray(obs.radio_messages) ? obs.radio_messages : [];
  const visibleCrew = Array.isArray(obs.nearbyCrew) ? obs.nearbyCrew : [];
  const visibleThreats = Array.isArray(obs.visible_entities) ? obs.visible_entities.filter((e) => e.id !== agent?.id && (e.current_action === 'attack' || e.current_action === 'sabotage' || e.imprisoned || e.hostile)) : [];
  const isTraitor = agent?.role === 'traitor';
  const heardFire = evidence.some((e) => e.type === 'fire' && (!comp || e.compartment === comp)) || fireHere > 0.08;
  const heardConflict = evidence.some((e) => e.type === 'mutiny' || e.type === 'attack');
  const suspicionLead = evidence
    .slice()
    .reverse()
    .find((e) => e.agentId && e.agentId !== agent?.id) || null;

  if (fireHere > 0.12) {
    if (role.isSystems) return { action: { type: 'extinguish_fire', compartment: comp || 'mess' }, thought: 'Fire is a local systems emergency.', speech: role.isLeader ? 'Fire reported. Move and contain.' : 'Extinguishing fire.' };
    if (!isTraitor && role.isSecurity) return { action: { type: 'report', channel: role.channel, message: `Fire detected in ${comp || 'the ship'}.` }, thought: 'Report the fire to coordinate response.', speech: `Fire in ${comp || 'the ship'}.` };
  }

  if (floodHere > 0.2) {
    if (role.isSystems || role.isLeader) return { action: { type: 'pump', compartment: comp || 'lower' }, thought: 'Contain flooding before it spreads.', speech: 'Pump the water out now.' };
    if (isTraitor && role.isSecurity) return { action: { type: 'seal', compartment: comp || 'lower' }, thought: 'Seal the compartment to isolate crew and hinder response.', speech: '' };
  }

  if ((ship.power?.reserve ?? 0.5) < 0.35 || powerHere < 0.4) {
    if (role.isSystems) return { action: { type: 'reroute_power', compartment: comp || 'boiler' }, thought: 'Power needs rerouting to critical systems.', speech: 'Rerouting power.' };
    if (!isTraitor && role.isLeader) return { action: { type: 'report', channel: role.channel, message: 'Power is dropping. Prioritize essential systems.' }, thought: 'The crew should know about low power.', speech: 'Power is dropping.' };
  }

  if (mutinyRisk > 0.55) {
    if (role.isLeader) return { action: { type: 'rally' }, thought: 'The crew needs leadership before panic grows.', speech: 'Stay together and keep discipline.' };
    if (role.isMedical) return { action: { type: 'appease' }, thought: 'Reduce panic and stabilize morale.', speech: 'Breathe. We can stabilize this.' };
    if (isTraitor) return { action: { type: 'mutiny' }, thought: 'Push the ship closer to internal fracture.', speech: '' };
  }

  if (visibleThreats.length) {
    const threat = visibleThreats[0];
    if (!isTraitor && role.isSecurity) return { action: { type: 'attack', target: threat.id }, thought: 'Neutralize the nearby threat quickly.', speech: `I see ${threat.id}.` };
    if (!isTraitor && role.isLeader && visibleCrew.length) return { action: { type: 'report', channel: role.channel, message: 'Threat nearby. Hold formation.' }, thought: 'Issue a clear command under stress.', speech: 'Threat nearby.' };
    if (isTraitor && visibleCrew.length) return { action: { type: 'whisper', target: visibleCrew[0].id, message: 'Stay quiet.' }, thought: 'Use the crowd and sound to stay hidden.', speech: '' };
  }

  if (evidence.length) {
    const lead = suspicionLead || evidence[evidence.length - 1];
    if (!isTraitor && (role.isLeader || role.isSecurity || role.isMedical)) {
      const text = lead?.agentId ? `Evidence points to ${lead.agentId}.` : 'There is fresh evidence to report.';
      return { action: { type: 'report', channel: role.channel, message: text }, thought: 'Evidence should be shared with the crew.', speech: text };
    }
    if (isTraitor && lead?.compartment) {
      return { action: { type: 'hide', compartment: lead.compartment }, thought: 'Evidence exists nearby; reduce exposure and witnesses.', speech: '' };
    }
  }

  if (radioMessages.length && (role.isLeader || role.isSecurity || role.isSystems || role.channel !== 'all')) {
    const latest = radioMessages[radioMessages.length - 1];
    return { action: { type: 'radio', channel: role.channel, message: latest?.message ? `Acknowledged: ${String(latest.message).slice(0, 80)}` : 'Status received.' }, thought: 'Radio should stay active when the ship is under stress.', speech: 'Acknowledged.' };
  }

  if (isTraitor) {
    if ((agent?.memory?.hiddenGoals || []).length && visibleCrew.length) {
      return { action: { type: 'sabotage_door', door: null, compartment: comp || 'hallway' }, thought: 'Create friction between crew and rooms.', speech: '' };
    }
    if (fireHere <= 0.08 && floodHere <= 0.15 && powerHere > 0.35) {
      return { action: { type: 'sabotage_ship', compartment: comp || 'cargo' }, thought: 'A quiet hit will create problems without immediate exposure.', speech: '' };
    }
    return { action: { type: 'hide' }, thought: 'Stay unseen until the right opening appears.', speech: '' };
  }

  if (role.isSystems && comp && (floodHere > 0.05 || fireHere > 0.05)) {
    return { action: floodHere > 0.05 ? { type: 'pump', compartment: comp } : { type: 'extinguish_fire', compartment: comp }, thought: 'Maintain the compartment before it becomes a larger problem.', speech: 'Holding the line here.' };
  }

  if (role.isMedical && Array.isArray(obs.visible_entities)) {
    const wounded = obs.visible_entities.find((e) => e.health != null && e.health < 70 && e.id !== agent?.id);
    if (wounded) return { action: { type: 'heal', target: wounded.id }, thought: 'An injured crew member should be treated.', speech: `I am moving to ${wounded.name || wounded.id}.` };
  }

  if (role.isLeader && (obs.nearbyCrew || []).length >= 2) {
    return { action: { type: 'rally' }, thought: 'Presence alone can stabilize the room.', speech: 'Everyone hold position.' };
  }

  return { action: null, thought: '', speech: '' };
}

function updateShipMetaSystems(world = {}, agents = []) {
  ensureShipMetaState(world, agents);
  updateCrewRoleAssignments(world, agents);
  updatePowerGrid(world, agents);
  updateRadioNetwork(world, agents);
  const fireState = spreadFire(world, agents);
  const mutiny = updateMutinyState(world, agents);
  const evidenceCount = Array.isArray(world.evidence) ? world.evidence.length : 0;
  world.ship.meta = summarizeShipMeta(world);
  world.ship.meta.lastUpdateTick = Number(world.tick || 0);
  return {
    power: world.ship.power,
    radio: world.ship.radio,
    fire: fireState,
    mutiny,
    evidenceCount,
  };
}

function shipVisibilityHints(world = {}, agent = null, agents = []) {
  const scene = shipInterior.shipVisibilityForAgent(agent, world, agents);
  const fire = world?.ship?.fire?.compartments || {};
  const power = world?.ship?.power?.grid || {};
  const light = { ...(scene.light || {}) };
  for (const comp of Object.keys(light)) {
    const fireGlow = Number(fire[comp] || 0);
    const localPower = Number(power[comp] ?? 1);
    light[comp] = clamp((light[comp] || 1) * (0.55 + localPower * 0.45) - fireGlow * 0.22, 0.05, 1);
  }
  return {
    ...scene,
    light,
    fire,
    power,
    mutiny: world.mutiny || initMutinyState(),
    evidenceCount: Array.isArray(world.evidence) ? world.evidence.length : 0,
  };
}

function radioMessagesForAgent(world = {}, agent = null) {
  const radio = world?.ship?.radio || initShipRadioState();
  const comp = agent?.onShip ? shipInterior.shipCompartmentForPosition(agent.position, world)?.id || agent.shipCompartment || null : null;
  const channel = agent?.crewRole?.channel || 'all';
  const log = Array.isArray(radio.log) ? radio.log : [];
  return log
    .slice(-18)
    .filter((entry) => entry.channel === 'all' || entry.channel === channel || entry.agentId === agent?.id)
    .map((entry) => ({
      ...entry,
      strength: Number(clamp(entry.strength ?? 0, 0, 1).toFixed(2)),
      local: Boolean(entry.compartment && comp && entry.compartment === comp),
    }));
}

module.exports = {
  CREW_ROLE_CATALOG,
  buildCrewRoleCatalog,
  buildCrewRoleProfile,
  ensureShipMetaState,
  initShipPowerState,
  initShipRadioState,
  initShipFireState,
  initMutinyState,
  initEvidenceState,
  updateCrewRoleAssignments,
  updatePowerGrid,
  updateRadioNetwork,
  updateMutinyState,
  buildCrewDirective,
  updateShipMetaSystems,
  recordEvidence,
  witnessesForEvent,
  broadcastRadio,
  startFire,
  extinguishFire,
  summarizeShipMeta,
  shipVisibilityHints,
  radioMessagesForAgent,
};
