const API_POLL_MS = 200;
const TARGET_FPS = 30;
const FRAME_MS = 1000 / TARGET_FPS;
const WORLD_W = 96;
const WORLD_H = 64;
const MAX_FEED_ITEMS = 48;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 100;
const MAX_RENDER_TILE = 180;

const PROVIDERS = ['groq', 'openrouter', 'google'];
const BEAT_TYPES = new Set(['event', 'speech', 'alert', 'navigation', 'death', 'attack', 'kill', 'hunt', 'explosion', 'site', 'prison_break']);

const state = {
  config: null,
  world: null,
  previousWorld: null,
  worldLoadedAt: 0,
  lastPollAt: 0,
  backendOnline: false,
  selectedAgentId: null,
  slotDrafts: [],
  agentNames: Array(8).fill(''),
  debugRevealRoles: false,
  activePanel: 'overview',
  sceneMode: 'overworld',
  camera: {
    x: 0,
    y: 0,
    zoom: 1.25,
    follow: 'ship',
  },
  viewerSettings: {
    ttsEnabled: true,
    autoNarration: true,
    showTrails: true,
    renderFps: TARGET_FPS,
    zoom: 1.25,
    followMode: 'ship',
    sceneMode: 'overworld',
    activePanel: 'overview',
  },
  ttsQueue: [],
  ttsEnabled: false,
  ttsSpeaking: false,
  lastSpokenSpeechId: null,
  seenSpeechIds: new Set(),
  seenEventIds: new Set(),
  feedItems: [],
  beat: 'Waiting for the expedition to start.',
  lastBeatId: null,
  renderHandle: 0,
  pollHandle: 0,
  lastFrameAt: 0,
  fpsSamples: [],
  configSaveTimer: null,
  canvas: {
    width: 0,
    height: 0,
    dpr: 1,
  },
  terrainCache: {
    key: '',
    canvas: null,
    width: 0,
    height: 0,
  },
  paused: false,
};

const $ = (id) => document.getElementById(id);

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(t) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function deepClone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function pct(value, digits = 0) {
  return `${Number(value).toFixed(digits)}%`;
}

function tileLabel(name) {
  return String(name || '').replaceAll('_', ' ');
}

function formatPos(pos) {
  if (!pos) return '—';
  return `${Math.round(pos.x)},${Math.round(pos.y)}`;
}

function formatMs(ms) {
  if (!Number.isFinite(ms)) return "—";
  const s = ms / 1000;
  return s < 10 ? `${s.toFixed(2)}s` : `${Math.round(s)}s`;
}


function getShipPosition() {
  return state.world?.shipPosition || state.world?.ship?.position || null;
}

function getShipInteriorBounds(world = state.world) {
  const center = world?.ship?.position || getShipPosition() || { x: WORLD_W / 2, y: WORLD_H / 2 };
  const interior = world?.ship?.interior || {};
  const width = Math.max(34, Math.round(interior.width || 40));
  const height = Math.max(12, Math.round(interior.height || 14));
  const halfW = Math.floor(width / 2);
  const halfH = Math.floor(height / 2);
  return {
    minX: clamp(Math.round(center.x - halfW), 0, WORLD_W - 1),
    maxX: clamp(Math.round(center.x + halfW), 0, WORLD_W - 1),
    minY: clamp(Math.round(center.y - halfH), 0, WORLD_H - 1),
    maxY: clamp(Math.round(center.y + halfH), 0, WORLD_H - 1),
  };
}

function isShipInteriorPoint(pos, world = state.world) {
  if (!pos) return false;
  const b = getShipInteriorBounds(world);
  return pos.x >= b.minX && pos.x <= b.maxX && pos.y >= b.minY && pos.y <= b.maxY;
}

function getAgentShipState(agent, world = state.world) {
  const compartment = shipCompartmentForAgent(agent, world);
  const insideInterior = isShipInteriorPoint(agent?.position, world);
  const declaredOnShip = Boolean(agent?.onShip);
  const onShip = declaredOnShip || Boolean(compartment) || insideInterior;
  return { onShip, compartment, insideInterior, declaredOnShip };
}

function getCameraFocus() {
  const world = state.world;
  if (!world) return { x: WORLD_W / 2, y: WORLD_H / 2 };
  if (state.camera.follow === 'selected') {
    const selected = world.agents?.find((a) => a.id === state.selectedAgentId);
    if (selected?.position) return selected.position;
  }
  if (state.camera.follow === 'free') {
    return { x: Number(state.camera.x || WORLD_W / 2), y: Number(state.camera.y || WORLD_H / 2) };
  }
  return getShipPosition() || { x: WORLD_W / 2, y: WORLD_H / 2 };
}

function setFreeCameraFocus(pos) {
  state.camera.follow = 'free';
  state.camera.x = clamp(Number(pos?.x ?? WORLD_W / 2), 0, WORLD_W - 1);
  state.camera.y = clamp(Number(pos?.y ?? WORLD_H / 2), 0, WORLD_H - 1);
  state.viewerSettings.followMode = state.camera.follow;
  scheduleConfigSave();
}

function getTileSize(zoom = state.camera.zoom || 1.25) {
  return clamp(Math.round(8 * Math.pow(zoom, 0.7)), 8, MAX_RENDER_TILE);
}

function worldToCanvas(pos, focus, tile, canvas) {
  return {
    x: Math.round(canvas.width / 2 - focus.x * tile + pos.x * tile),
    y: Math.round(canvas.height / 2 - focus.y * tile + pos.y * tile),
  };
}

function setActivePanel(panel) {
  state.activePanel = panel;
  state.viewerSettings.activePanel = panel;
  renderStaticUI();
  scheduleConfigSave();
}

function setFollowMode(mode) {
  state.camera.follow = mode;
  state.viewerSettings.followMode = mode;
  renderStaticUI();
  scheduleConfigSave();
}

function setSceneMode(mode) {
  state.sceneMode = mode === 'overworld' ? 'overworld' : 'ship';
  state.viewerSettings.sceneMode = state.sceneMode;
  renderStaticUI();
  scheduleConfigSave();
}

function setZoom(next) {
  state.camera.zoom = clamp(Number(next) || 1, MIN_ZOOM, MAX_ZOOM);
  state.viewerSettings.zoom = state.camera.zoom;
  renderStaticUI();
  scheduleConfigSave();
}

function shiftZoom(delta) {
  setZoom((state.camera.zoom || 1.25) + delta);
}

function api(path, method = 'GET', body = undefined) {
  return fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || (Array.isArray(data.errors) ? data.errors.join('\n') : `HTTP ${res.status}`));
    }
    return data;
  });
}

function providerLabel(provider) {
  const p = String(provider || '').toLowerCase();
  if (p === 'openrouter') return 'OpenRouter';
  if (p === 'google' || p === 'google ai studio' || p === 'gemini') return 'Google AI';
  return 'Groq';
}

function defaultSlot(idx = 0) {
  const templates = [
    { provider: 'groq', model: 'llama-3.1-70b-versatile', visual_name: 'Slot A', api_key: '' },
    { provider: 'openrouter', model: 'deepseek/deepseek-r1', visual_name: 'Slot B', api_key: '' },
    { provider: 'google', model: 'gemini-2.5-pro', visual_name: 'Slot C', api_key: '' },
  ];
  return { ...templates[idx % templates.length] };
}

function setConnection(online, text = '') {
  state.backendOnline = online;
  $('connectionStatus').textContent = online ? `Backend conectado${text ? ` · ${text}` : ''}` : `Backend desconectado${text ? ` · ${text}` : ''}`;
}

function setBeat(text, id = null) {
  if (!text) return;
  if (id && state.lastBeatId === id) return;
  state.beat = text;
  state.lastBeatId = id || null;
  $('beatBanner').textContent = text;
  $('subtitleLine').textContent = text;
}

function showError(text) {
  $('statusLine').textContent = text;
}

function ensureCanvasSize() {
  const canvas = $('worldCanvas');
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    state.canvas = { width, height, dpr };
  }
}

function resizeCanvasToContainer() {
  const canvas = $('worldCanvas');
  if (!canvas) return;
  const parent = canvas.parentElement;
  if (!parent) return;
  const rect = parent.getBoundingClientRect();
  canvas.style.width = '100%';
  canvas.style.height = `${Math.max(700, Math.floor(rect.width * 0.78))}px`;
  ensureCanvasSize();
}

function slotProviders() {
  return PROVIDERS.map((p) => ({ value: p, label: providerLabel(p) }));
}

function renderSlotForm(slot, idx) {
  return `
    <div class="slot-card" data-slot-index="${idx}">
      <div class="slot-head">
        <div>
          <div class="slot-title">Compute Slot ${idx + 1}</div>
          <div class="slot-subtitle">Recursos de inferencia</div>
        </div>
        <div class="slot-pill">${escapeHtml(providerLabel(slot.provider))}</div>
      </div>
      <label>
        Provider
        <select data-slot-field="provider">
          ${slotProviders().map((p) => `<option value="${p.value}" ${String(slot.provider || '').toLowerCase() === p.value ? 'selected' : ''}>${escapeHtml(p.label)}</option>`).join('')}
        </select>
      </label>
      <label>
        API key
        <input data-slot-field="api_key" type="password" value="${escapeHtml(slot.api_key || '')}" placeholder="sk-..." />
      </label>
      <label>
        Model
        <input data-slot-field="model" type="text" value="${escapeHtml(slot.model || '')}" placeholder="llama-3.1-70b-versatile" />
      </label>
      <label>
        Visual name
        <input data-slot-field="visual_name" type="text" value="${escapeHtml(slot.visual_name || '')}" placeholder="Slot A" />
      </label>
    </div>
  `;
}

function renderLobby() {
  const slots = state.slotDrafts.length ? state.slotDrafts : [defaultSlot(0), defaultSlot(1)];
  $('slotList').innerHTML = slots.map((slot, idx) => renderSlotForm(slot, idx)).join('');
  $('agentNamesGrid').innerHTML = state.agentNames.map((name, idx) => `
    <label class="name-card">
      <span>Agent ${idx + 1}</span>
      <input data-agent-name="${idx}" type="text" value="${escapeHtml(name || '')}" placeholder="Optional visual name" />
    </label>
  `).join('');
  $('debugRolesToggle').checked = Boolean(state.debugRevealRoles);
  $('ttsToggle').classList.toggle('active', state.ttsEnabled);
  $('autoNarrationToggle').classList.toggle('active', state.viewerSettings.autoNarration);
  $('pauseToggle').classList.toggle('active', state.paused);
  $('ttsStatus').textContent = state.ttsEnabled ? 'TTS on' : 'TTS off';
  $('autoNarrationStatus').textContent = state.viewerSettings.autoNarration ? 'Narration live' : 'Narration held';

  bindLobbyInputs();
}

function bindLobbyInputs() {
  document.querySelectorAll('[data-slot-index]').forEach((card) => {
    const idx = Number(card.dataset.slotIndex);
    const slot = state.slotDrafts[idx];
    if (!slot) return;
    card.querySelectorAll('[data-slot-field]').forEach((input) => {
      input.addEventListener('input', () => {
        slot[input.dataset.slotField] = input.value;
        scheduleConfigSave();
      });
    });
  });
  document.querySelectorAll('[data-agent-name]').forEach((input) => {
    input.addEventListener('input', () => {
      const idx = Number(input.dataset.agentName);
      state.agentNames[idx] = input.value;
      scheduleConfigSave();
    });
  });
}


function collectLobbyPayload() {
  return {
    computeSlots: state.slotDrafts.map((slot) => ({
      provider: String(slot.provider || 'groq').trim().toLowerCase(),
      api_key: String(slot.api_key || '').trim(),
      model: String(slot.model || '').trim(),
      visual_name: String(slot.visual_name || '').trim(),
    })),
    debugRevealRoles: Boolean(state.debugRevealRoles),
    agentNames: state.agentNames.map((name) => String(name || '').trim()),
    viewerSettings: {
      ttsEnabled: Boolean(state.ttsEnabled),
      autoNarration: Boolean(state.viewerSettings.autoNarration),
      showTrails: Boolean(state.viewerSettings.showTrails),
      renderFps: TARGET_FPS,
      paused: Boolean(state.paused),
      zoom: Number(state.camera.zoom || 1.25),
      followMode: String(state.camera.follow || 'ship'),
      sceneMode: String(state.sceneMode || 'overworld'),
      activePanel: String(state.activePanel || 'overview'),
    },
  };
}

async function saveLobbyConfig() {
  if (!state.config) return;
  const payload = collectLobbyPayload();
  const res = await api('/api/config', 'POST', payload);
  state.config = res.config || payload;
  $('configSync').textContent = 'Config saved';
}

function scheduleConfigSave() {
  if (state.configSaveTimer) clearTimeout(state.configSaveTimer);
  $('configSync').textContent = 'Saving...';
  state.configSaveTimer = setTimeout(() => {
    saveLobbyConfig().catch((err) => {
      $('configSync').textContent = `Config error: ${err.message}`;
    });
  }, 250);
}

function updateLobbyFromConfig(cfg) {
  state.config = cfg;
  state.slotDrafts = (cfg.computeSlots || []).map((slot, idx) => ({
    provider: String(slot.provider || 'groq').toLowerCase(),
    api_key: String(slot.api_key || ''),
    model: String(slot.model || defaultSlot(idx).model),
    visual_name: String(slot.visual_name || `Slot ${idx + 1}`),
  }));
  while (state.slotDrafts.length < 2) state.slotDrafts.push(defaultSlot(state.slotDrafts.length));
  state.agentNames = (cfg.agentNames || []).slice(0, 8).concat(Array(8).fill('')).slice(0, 8);
  state.debugRevealRoles = Boolean(cfg.debugRevealRoles);
  const viewer = cfg.viewerSettings || {};
  state.ttsEnabled = Boolean(viewer.ttsEnabled);
  state.viewerSettings.autoNarration = viewer.autoNarration !== false;
  state.viewerSettings.showTrails = viewer.showTrails !== false;
  state.viewerSettings.zoom = clamp(Number(viewer.zoom || state.viewerSettings.zoom || 1.25), MIN_ZOOM, MAX_ZOOM);
  state.viewerSettings.followMode = String(viewer.followMode || state.viewerSettings.followMode || 'ship');
  state.viewerSettings.sceneMode = String(viewer.sceneMode || state.viewerSettings.sceneMode || 'overworld');
  state.viewerSettings.activePanel = String(viewer.activePanel || state.viewerSettings.activePanel || 'overview');
  state.camera.zoom = clamp(state.viewerSettings.zoom, MIN_ZOOM, MAX_ZOOM);
  state.camera.follow = state.viewerSettings.followMode;
  state.sceneMode = state.viewerSettings.sceneMode || 'overworld';
  state.activePanel = state.viewerSettings.activePanel;
  state.paused = Boolean(viewer.paused);
  renderLobby();
}

function centerOfZone(zoneName) {
  if (zoneName === 'ship') return getShipPosition() || { x: WORLD_W / 2, y: WORLD_H / 2 };
  const zones = state.world?.zones || {};
  const z = zones[zoneName];
  if (!z) return null;
  return { x: z.x, y: z.y };
}

function entityPosition(entity, alpha = 1) {
  if (!entity) return { x: 0, y: 0 };
  const current = entity.position || { x: 0, y: 0 };
  const previous = entity.__previousPosition || current;
  return {
    x: lerp(previous.x, current.x, alpha),
    y: lerp(previous.y, current.y, alpha),
  };
}

function mapEntityIndex(list) {
  const index = new Map();
  for (const item of list || []) index.set(item.id, item);
  return index;
}

function syncSnapshot(prev, next) {
  state.previousWorld = prev ? deepClone(prev) : null;
  state.world = deepClone(next);
  state.worldLoadedAt = performance.now();
  state.lastPollAt = Date.now();

  const prevSpeechIds = new Set((prev?.speeches || []).map((s) => s.id));
  const prevEventIds = new Set((prev?.events || []).map((e) => e.id));

  for (const speech of next.speeches || []) {
    if (prevSpeechIds.has(speech.id) || state.seenSpeechIds.has(speech.id)) continue;
    state.seenSpeechIds.add(speech.id);
    ingestSpeech(speech);
  }

  for (const evt of next.events || []) {
    if (prevEventIds.has(evt.id) || state.seenEventIds.has(evt.id)) continue;
    state.seenEventIds.add(evt.id);
    ingestEvent(evt);
  }

  if (next.alerts && next.alerts.length) {
    const latest = next.alerts[next.alerts.length - 1];
    if (latest?.text) setBeat(latest.text, latest.id || latest.ts);
  }

  if (next.running && !state.selectedAgentId) {
    state.selectedAgentId = next.agents?.[0]?.id || null;
  }
  if (state.selectedAgentId && !(next.agents || []).some((a) => a.id === state.selectedAgentId)) {
    state.selectedAgentId = next.agents?.[0]?.id || null;
  }

  renderStaticUI();
}

function ingestSpeech(speech) {
  const item = {
    kind: 'speech',
    id: speech.id,
    ts: speech.ts,
    tick: speech.tick,
    title: speech.speakerName || speech.speaker || 'unknown',
    body: speech.speech || '',
    meta: `${speech.action || 'speech'} · ${fmtTime(speech.ts)}`,
    position: speech.position || null,
    speaker: speech.speaker,
  };
  state.feedItems.unshift(item);
  state.feedItems = state.feedItems.slice(0, MAX_FEED_ITEMS);
  setBeat(`${item.title}: ${item.body}`, item.id);
  if (state.ttsEnabled) queueSpeech(item, speech);
}

function ingestEvent(evt) {
  const item = {
    kind: evt.type || 'event',
    id: evt.id,
    ts: evt.ts,
    tick: evt.tick,
    title: evt.type || 'event',
    body: evt.text || '',
    meta: fmtTime(evt.ts),
    data: evt.data || {},
  };
  state.feedItems.unshift(item);
  state.feedItems = state.feedItems.slice(0, MAX_FEED_ITEMS);
  if (BEAT_TYPES.has(item.kind)) setBeat(item.body, item.id);
}

function queueSpeech(item, sourceSpeech) {
  const payload = {
    id: item.id,
    text: item.body,
    sourceSpeech,
  };
  if (state.lastSpokenSpeechId === payload.id) return;
  state.ttsQueue.push(payload);
  pumpTTS();
}

function chooseVoice() {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  return voices.find((v) => /en/i.test(v.lang) && /female|woman|zira|susan|samantha|victoria/i.test(v.name)) || voices.find((v) => /en/i.test(v.lang)) || voices[0] || null;
}

function pumpTTS() {
  if (!state.ttsEnabled || state.ttsSpeaking || !state.ttsQueue.length || !window.speechSynthesis) return;
  const next = state.ttsQueue.shift();
  if (!next?.text) return pumpTTS();
  const utterance = new SpeechSynthesisUtterance(next.text.slice(0, 220));
  const speaker = next.sourceSpeech?.speaker;
  const speakerAgent = state.world?.agents?.find((a) => a.id === speaker);
  const focus = getCameraFocus();
  const zoom = clamp(Number(state.camera.zoom || 1.25), MIN_ZOOM, MAX_ZOOM);
  const d = speakerAgent?.position ? Math.hypot((speakerAgent.position.x || 0) - focus.x, (speakerAgent.position.y || 0) - focus.y) : 0;
  const audibleRadius = 8 + Math.min(zoom, 12) * 12;
  const clarity = speakerAgent ? clamp(1 - d / audibleRadius, 0, 1) : 1;
  if (speakerAgent && clarity < 0.08) {
    state.ttsSpeaking = false;
    $('ttsStatus').textContent = `TTS held · too far`;
    return pumpTTS();
  }
  utterance.volume = clamp(0.12 + clarity * 0.88, 0, 1);
  utterance.rate = 0.86 + (1 - clarity) * 0.12;
  utterance.pitch = 1;
  const voice = chooseVoice();
  if (voice) utterance.voice = voice;
  state.ttsSpeaking = true;
  $('ttsStatus').textContent = `TTS speaking · ${next.sourceSpeech?.speakerName || 'unknown'}`;
  utterance.onend = () => {
    state.ttsSpeaking = false;
    state.lastSpokenSpeechId = next.id;
    $('ttsStatus').textContent = state.ttsEnabled ? 'TTS on' : 'TTS off';
    pumpTTS();
  };
  utterance.onerror = () => {
    state.ttsSpeaking = false;
    $('ttsStatus').textContent = 'TTS error';
    pumpTTS();
  };
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}


if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    if (state.ttsEnabled) pumpTTS();
  };
}
function renderMatchHeader() {
  const w = state.world;
  if (!w) return;
  $('matchId').textContent = w.matchId || '—';
  $('tickValue').textContent = w.tick ?? 0;
  $('dayValue').textContent = w.day ?? 1;
  $('phaseValue').textContent = w.phase || 'lobby';
  $('weatherValue').textContent = w.weatherLabel || '—';
  $('tempValue').textContent = `${Math.round(w.temperature ?? 0)}°`;
  $('progressValue').textContent = pct((w.voyageProgress || 0) * 100, 0);
  $('beatLine').textContent = state.beat || '—';
  const shipScene = w.ship?.scene?.activeCompartment || w.sot?.ship?.scene?.activeCompartment || 'mess';
  $('sceneState').textContent = w.running ? `Live simulation · ${state.sceneMode || 'ship'} · ${tileLabel(w.sot?.terrain?.biome || 'snow')} · ${tileLabel(shipScene)}` : 'Lobby';
  $('configSync').textContent = state.config ? 'Config synced' : 'Loading config';
  $('connectionStatusBottom').textContent = state.backendOnline ? 'online' : 'offline';
  $('ttsStatusBottom').textContent = state.ttsEnabled ? 'on' : 'off';
  $('sceneStateBottom').textContent = w.running ? `${state.sceneMode || 'ship'} · ${tileLabel(shipScene)} · live` : 'lobby';
  $('narrationTicker').textContent = state.beat || '—';
}

function getFocusedAgent() {
  if (!state.world) return null;
  return state.world.agents?.find((a) => a.id === state.selectedAgentId) || state.world.agents?.[0] || null;
}

function renderOverview() {
  const w = state.world;
  if (!w) return;
  const alive = (w.agents || []).filter((a) => a.alive).length;
  const prisoners = w.prisoners?.length || 0;
  const topSuspicion = (w.overview?.topSuspicion || []).slice(0, 4);
  const shipPos = w.shipPosition || w.ship?.position || { x: 0, y: 0 };
  const sot = w.sot || {};
  const localPresence = sot.presence?.counts || {};
  const localBiome = sot.terrain?.biome || 'snow';
  const nearbySites = sot.nearbySites || [];
  $('overviewPanel').innerHTML = `
    <div class="panel-title">World state</div>
    <div class="overview-grid">
      <div class="stat"><span>Alive</span><strong>${alive}</strong></div>
      <div class="stat"><span>Prisoners</span><strong>${prisoners}</strong></div>
      <div class="stat"><span>Biome</span><strong>${escapeHtml(tileLabel(localBiome))}</strong></div>
      <div class="stat"><span>Signal</span><strong>${Number(w.signalStrength ?? 0).toFixed(2)}</strong></div>
      <div class="stat"><span>Terror</span><strong>${Number(w.terror ?? 0).toFixed(2)}</strong></div>
      <div class="stat"><span>Storm</span><strong>${Number(w.storm ?? 0).toFixed(2)}</strong></div>
      <div class="stat"><span>Fauna</span><strong>${(w.faunaEntities || []).filter((f) => f.active !== false).length}</strong></div>
      <div class="stat"><span>Sites</span><strong>${nearbySites.length || (w.objectives || []).length}</strong></div>
    </div>
    <div class="battle-card">
      <div class="battle-line"><span>Ship</span><strong>${formatPos(shipPos)} · ${w.shipCanDisembark ? 'landfall possible' : 'open water'}</strong></div>
      <div class="battle-line"><span>Presence</span><strong>allies ${localPresence.allies || 0} · hostiles ${localPresence.hostiles || 0} · imprisoned ${localPresence.imprisoned || 0}</strong></div>
      <div class="battle-line"><span>Route</span><strong>${(w.route || []).map(tileLabel).join(' → ')}</strong></div>
      <div class="battle-line"><span>Follow</span><strong>${state.camera.follow}</strong></div>
      <div class="battle-line"><span>Zoom</span><strong>${state.camera.zoom.toFixed(2)}x</strong></div>
    </div>
    <div class="battle-card">
      <div class="panel-subtitle">Ship systems</div>
      <div class="battle-line"><span>Power</span><strong>${Number(w.shipPower?.reserve ?? w.ship?.power?.reserve ?? 0).toFixed(2)} · ${Number(w.shipPower?.generation ?? w.ship?.power?.generation ?? 0).toFixed(2)} gen</strong></div>
      <div class="battle-line"><span>Radio</span><strong>${Number(w.shipRadio?.signal ?? w.ship?.radio?.signal ?? 0).toFixed(2)} signal · ${Number(w.shipRadio?.interference ?? w.ship?.radio?.interference ?? 0).toFixed(2)} noise</strong></div>
      <div class="battle-line"><span>Fire</span><strong>${Number(w.shipFire?.compartments ? Object.keys(w.shipFire.compartments).length : 0)} compartments</strong></div>
      <div class="battle-line"><span>Mutiny</span><strong>${w.mutiny?.stage || w.shipMeta?.mutiny?.stage || 'quiet'} · ${Number(w.mutiny?.risk ?? w.shipMeta?.mutiny?.risk ?? 0).toFixed(2)}</strong></div>
      <div class="battle-line"><span>Evidence</span><strong>${(w.evidence || []).length} records</strong></div>
    </div>
    <div class="battle-card">
      <div class="panel-subtitle">Nearby sites</div>
      ${nearbySites.length ? nearbySites.slice(0, 4).map((site) => `<div class="battle-line"><span>${escapeHtml(site.name)}</span><strong>${escapeHtml(site.kind)} · ${site.discovered ? 'seen' : 'unknown'}</strong></div>`).join('') : '<div class="muted">No sites nearby.</div>'}
    </div>
    <div class="battle-card">
      <div class="panel-subtitle">Suspicion peaks</div>
      ${topSuspicion.length ? topSuspicion.map((entry) => `<div class="battle-line"><span>${escapeHtml(entry.id)}</span><strong>${Number(entry.score).toFixed(2)}</strong></div>`).join('') : '<div class="muted">No suspicion spikes yet.</div>'}
    </div>
  `;
}

function renderCrew() {
  if (!state.world) return;
  const agents = state.world.agents || [];
  const visible = agents.slice(0);
  $('crewPanel').innerHTML = `
    <div class="panel-title">Crew</div>
    <div class="crew-list">
      ${visible.map((a) => {
        const selected = a.id === state.selectedAgentId ? 'selected' : '';
        const roleBadge = state.debugRevealRoles && a.role ? `<span class="badge ${a.role === 'traitor' ? 'bad' : 'good'}">${escapeHtml(a.role)}</span>` : '';
        return `
          <button type="button" class="crew-card ${selected}" data-agent-select="${escapeHtml(a.id)}">
            <div class="crew-top">
              <div>
                <div class="crew-name">${escapeHtml(a.name)}</div>
                <div class="crew-meta">${escapeHtml(a.profession)} · ${escapeHtml(a.currentAction || 'idle')}${a.movementOrder?.etaMs ? ` · ETA ${escapeHtml(formatMs(a.movementOrder.etaMs))}` : ''}</div>
                <div class="crew-meta subtle">${escapeHtml(a.crewRole?.duty || 'crew')} · ${escapeHtml(a.crewRole?.channel || 'all')}</div>
              </div>
              <div class="crew-pos">${escapeHtml(formatPos(a.position))}</div>
            </div>
            <div class="bar-row slim"><span>HP</span><div class="bar"><i style="width:${clamp(a.health ?? 0, 0, 100)}%"></i></div><strong>${Math.round(a.health ?? 0)}</strong></div>
            <div class="bar-row slim"><span>Hungry</span><div class="bar"><i style="width:${clamp(a.hunger ?? 0, 0, 100)}%"></i></div><strong>${Math.round(a.hunger ?? 0)}</strong></div>
            <div class="bar-row slim"><span>Morale</span><div class="bar"><i style="width:${clamp((a.morale ?? 0) * 100, 0, 100)}%"></i></div><strong>${Number(a.morale ?? 0).toFixed(2)}</strong></div>
            <div class="badge-row">
              <span class="badge">${escapeHtml(a.carrying || 'empty')}</span>
              <span class="badge">${a.imprisoned ? 'prison' : a.alive ? 'alive' : 'dead'}</span>
              ${roleBadge}
            </div>
          </button>
        `;
      }).join('')}
    </div>
  `;
  document.querySelectorAll('[data-agent-select]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedAgentId = btn.dataset.agentSelect;
      renderCrew();
      renderDetail();
    });
  });
}

function renderDetail() {
  const w = state.world;
  const agent = getFocusedAgent();
  if (!w || !agent) {
    $('detailPanel').innerHTML = '<div class="panel-title">Detail</div><div class="small">No agent selected.</div>';
    return;
  }
  const mem = agent.memory || {};
  const sortedSusp = Object.entries(mem.suspicions || {}).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const rel = Object.entries(mem.relationships || {}).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const goals = (mem.goals || []).slice(0, 5);
  const notes = (mem.memories || []).slice(-6).reverse();
  $('detailPanel').innerHTML = `
    <div class="panel-title">Focus</div>
    <div class="focus-card">
      <div class="focus-head">
        <div>
          <div class="focus-name">${escapeHtml(agent.name)}</div>
          <div class="small">${escapeHtml(agent.profession)} · ${escapeHtml(agent.visualTag || `slot ${agent.slotIndex + 1}`)}</div>
        </div>
        <div class="focus-pill">${escapeHtml(agent.alive ? 'alive' : 'dead')}</div>
      </div>
      <div class="focus-grid">
        <div><span>Health</span><strong>${Math.round(agent.health ?? 0)}</strong></div>
        <div><span>Hunger</span><strong>${Math.round(agent.hunger ?? 0)}</strong></div>
        <div><span>Temp</span><strong>${Math.round(agent.temperature ?? 0)}</strong></div>
        <div><span>Stamina</span><strong>${Math.round(agent.stamina ?? 0)}</strong></div>
      </div>
      <div class="mini-block"><div class="mini-title">Inventory</div><div class="list-inline">${Object.entries(agent.inventory || {}).filter(([, v]) => v || typeof v === 'string').map(([k, v]) => `<span class="token">${escapeHtml(k)}: ${escapeHtml(String(v))}</span>`).join('') || '<span class="small">empty</span>'}</div></div>
      <div class="mini-block"><div class="mini-title">Local biome</div><div class="list-inline"><span class="token">${escapeHtml(tileLabel(w.sot?.terrain?.biome || 'snow'))}</span><span class="token">${escapeHtml(isAgentOnShip(agent, w) ? 'on ship' : 'shore')}</span><span class="token">${escapeHtml(agent.swimming ? 'swimming' : 'dry footing')}</span></div></div>
      <div class="mini-block"><div class="mini-title">Ship compartment</div><div class="list-inline"><span class="token">${escapeHtml(tileLabel(agent.shipCompartment || agent.compartment || w.ship?.scene?.activeCompartment || 'mess'))}</span><span class="token">${escapeHtml(tileLabel(w.ship?.scene?.activeCompartment || 'mess'))}</span><span class="token">${escapeHtml((w.ship?.compartments || []).length ? `${(w.ship?.compartments || []).length} rooms` : 'no rooms')}</span></div></div>
      <div class="mini-block"><div class="mini-title">Presence</div><div class="mini-list">${(w.sot?.presence?.nearby || []).slice(0, 5).map((p) => `<div class="mini-row"><span>${escapeHtml(p.name)} · ${escapeHtml(p.direction)}</span><strong>${Number(p.distance).toFixed(1)}</strong></div>`).join('') || '<div class="small">no nearby crew</div>'}</div></div>
      <div class="mini-block"><div class="mini-title">Systems</div><div class="list-inline"><span class="token">power ${Number(w.shipPower?.reserve ?? w.ship?.power?.reserve ?? 0).toFixed(2)}</span><span class="token">radio ${Number(w.shipRadio?.signal ?? w.ship?.radio?.signal ?? 0).toFixed(2)}</span><span class="token">fire ${(w.shipFire?.compartments ? Object.keys(w.shipFire.compartments).length : 0)}</span><span class="token">mutiny ${Number(w.mutiny?.risk ?? w.shipMeta?.mutiny?.risk ?? 0).toFixed(2)}</span><span class="token">evidence ${(w.evidence || []).length}</span></div></div>
      <div class="mini-block"><div class="mini-title">Goals</div><div class="list-inline">${goals.length ? goals.map((g) => `<span class="token">${escapeHtml(g)}</span>`).join('') : '<span class="small">none</span>'}</div></div>
      <div class="mini-block"><div class="mini-title">Suspicion</div><div class="mini-list">${sortedSusp.length ? sortedSusp.map(([id, score]) => `<div class="mini-row"><span>${escapeHtml(id)}</span><strong>${Number(score).toFixed(2)}</strong></div>`).join('') : '<div class="small">none</div>'}</div></div>
      <div class="mini-block"><div class="mini-title">Relationships</div><div class="mini-list">${rel.length ? rel.map(([id, score]) => `<div class="mini-row"><span>${escapeHtml(id)}</span><strong>${Number(score).toFixed(2)}</strong></div>`).join('') : '<div class="small">none</div>'}</div></div>
      <div class="mini-block"><div class="mini-title">Recent memories</div><div class="memory-list">${notes.length ? notes.map((m) => `<div class="memory-item"><div class="memory-time">${escapeHtml(fmtTime(m.ts))} · ${escapeHtml(m.type || 'note')}</div><div>${escapeHtml(m.text || '')}</div></div>`).join('') : '<div class="small">none</div>'}</div></div>
      <div class="mini-block"><div class="mini-title">Internal thought</div><div class="small">${escapeHtml(agent.lastThought || agent.lastDecision?.thought || '—')}</div></div>
      <div class="mini-block"><div class="mini-title">Last speech</div><div class="small">${escapeHtml(agent.lastSpeech || agent.lastDecision?.speech || '—')}</div></div>
      <div class="mini-block"><div class="mini-title">Last decision</div><pre>${escapeHtml(JSON.stringify(agent.lastDecision || {}, null, 2))}</pre></div>
    </div>
  `;
}

function renderFeed() {
  const items = state.feedItems.slice(0, 20);
  $('feedPanel').innerHTML = `
    <div class="panel-title">Live feed</div>
    <div class="feed-list">
      ${items.length ? items.map((item) => `
        <div class="feed-item ${item.kind}">
          <div class="feed-meta">${escapeHtml(item.kind)} · ${escapeHtml(item.meta || fmtTime(item.ts))}</div>
          <div class="feed-body"><strong>${escapeHtml(item.title || 'event')}</strong> ${escapeHtml(item.body || '')}</div>
        </div>
      `).join('') : '<div class="small">No feed yet.</div>'}
    </div>
  `;
}

function renderStaticUI() {
  renderMatchHeader();
  renderOverview();
  renderCrew();
  renderDetail();
  renderFeed();

  const panels = ['lobby', 'overview', 'crew', 'focus', 'feed'];
  for (const panel of panels) {
    const el = $(`${panel}Panel`);
    if (el) el.classList.toggle('hidden', state.world?.running ? state.activePanel !== panel : panel !== 'lobby');
  }
  $('lobbyPanel').classList.toggle('hidden', Boolean(state.world?.running));
  $('matchStatus').textContent = state.world?.running ? 'Match running' : 'Lobby ready';
  $('ttsStatus').textContent = state.ttsEnabled ? 'TTS on' : 'TTS off';
  $('autoNarrationStatus').textContent = state.viewerSettings.autoNarration ? 'Narration live' : 'Narration held';
  $('pauseStatus').textContent = state.paused ? 'Paused' : 'Playing';
  $('followModeValue').textContent = state.camera.follow;
  const sceneModeValue = $('sceneModeValue');
  if (sceneModeValue) sceneModeValue.textContent = state.sceneMode;
  $('zoomValue').textContent = state.camera.zoom.toFixed(2);
  $('tabLobby').classList.toggle('active', !state.world?.running || state.activePanel === 'lobby');
  $('tabOverview').classList.toggle('active', state.activePanel === 'overview');
  $('tabCrew').classList.toggle('active', state.activePanel === 'crew');
  $('tabFocus').classList.toggle('active', state.activePanel === 'focus');
  $('tabFeed').classList.toggle('active', state.activePanel === 'feed');
  $('followShipBtn').classList.toggle('active', state.camera.follow === 'ship');
  $('followSelectedBtn').classList.toggle('active', state.camera.follow === 'selected');
  $('freeCamBtn').classList.toggle('active', state.camera.follow === 'free');
  $('shipViewBtn').classList.toggle('active', state.sceneMode === 'ship');
  $('overworldViewBtn').classList.toggle('active', state.sceneMode === 'overworld');
}

function bestZoneAt(pos, zones) {
  if (!pos || !zones) return null;
  let best = null;
  let bestDist = Infinity;
  for (const [name, zone] of Object.entries(zones)) {
    const d = Math.hypot(pos.x - zone.x, pos.y - zone.y);
    if (d <= zone.radius && d < bestDist) {
      best = name;
      bestDist = d;
    }
  }
  return best;
}

function getShipCompartments(world = state.world) {
  const ship = world?.ship || {};
  const scene = ship.scene || world?.sot?.ship?.scene || {};
  return Array.isArray(scene.compartments) && scene.compartments.length ? scene.compartments : (Array.isArray(ship.compartments) ? ship.compartments : []);
}

function shipCompartmentForAgent(agent, world = state.world) {
  if (!agent) return null;
  const direct = agent.shipCompartment || agent.compartment || null;
  if (direct) return direct;
  const ship = world?.ship || {};
  const scene = ship.scene || world?.sot?.ship?.scene || {};
  const compartments = getShipCompartments(world);
  const pos = agent.position;
  if (!pos || !compartments.length) return agent.onShip ? (scene.activeCompartment || compartments[0]?.id || compartments[0]?.name || 'mess') : null;
  for (const comp of compartments) {
    const x = Number(comp.x || 0);
    const y = Number(comp.y || 0);
    const w = Math.max(1, Number(comp.w || 1));
    const h = Math.max(1, Number(comp.h || 1));
    if (pos.x >= x && pos.x <= x + w && pos.y >= y && pos.y <= y + h) {
      return comp.id || comp.name || null;
    }
  }
  return agent.onShip ? (scene.activeCompartment || compartments[0]?.id || compartments[0]?.name || 'mess') : null;
}

function isAgentOnShip(agent, world = state.world) {
  return getAgentShipState(agent, world).onShip;
}
