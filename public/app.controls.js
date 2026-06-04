function toggleTTS() {
  state.ttsEnabled = !state.ttsEnabled;
  if (!state.ttsEnabled && window.speechSynthesis) window.speechSynthesis.cancel();
  $('ttsToggle').classList.toggle('active', state.ttsEnabled);
  $('ttsStatus').textContent = state.ttsEnabled ? 'TTS on' : 'TTS off';
  scheduleConfigSave();
  if (state.ttsEnabled) pumpTTS();
}

function toggleNarration() {
  state.viewerSettings.autoNarration = !state.viewerSettings.autoNarration;
  $('autoNarrationToggle').classList.toggle('active', state.viewerSettings.autoNarration);
  $('autoNarrationStatus').textContent = state.viewerSettings.autoNarration ? 'Narration live' : 'Narration held';
  scheduleConfigSave();
}

function togglePause() {
  state.paused = !state.paused;
  $('pauseToggle').classList.toggle('active', state.paused);
  $('pauseStatus').textContent = state.paused ? 'Paused' : 'Playing';
  scheduleConfigSave();
}

function exportSnapshot() {
  api('/api/export').then((data) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `arctic-betrayal-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

function attachControls() {
  const on = (id, event, handler) => {
    const el = $(id);
    if (el) el.addEventListener(event, handler);
  };

  on('startBtn', 'click', startMatch);
  on('stopBtn', 'click', stopMatch);
  on('resetBtn', 'click', resetMatch);
  on('recoverBtn', 'click', recoverMatch);
  on('saveBtn', 'click', saveNow);
  on('exportBtn', 'click', exportSnapshot);
  on('ttsToggle', 'click', toggleTTS);
  on('autoNarrationToggle', 'click', toggleNarration);
  on('pauseToggle', 'click', togglePause);
  on('zoomOutBtn', 'click', () => shiftZoom(-0.12));
  on('zoomInBtn', 'click', () => shiftZoom(0.12));
  on('followShipBtn', 'click', () => setFollowMode('ship'));
  on('followSelectedBtn', 'click', () => setFollowMode('selected'));
  on('freeCamBtn', 'click', () => setFollowMode('free'));
  on('shipViewBtn', 'click', () => setSceneMode('ship'));
  on('overworldViewBtn', 'click', () => setSceneMode('overworld'));
  on('tabLobby', 'click', () => setActivePanel('lobby'));
  on('tabOverview', 'click', () => setActivePanel('overview'));
  on('tabCrew', 'click', () => setActivePanel('crew'));
  on('tabFocus', 'click', () => setActivePanel('focus'));
  on('tabFeed', 'click', () => setActivePanel('feed'));

  on('addSlotBtn', 'click', () => {
    state.slotDrafts.push(defaultSlot(state.slotDrafts.length));
    renderLobby();
    scheduleConfigSave();
  });
  on('removeSlotBtn', 'click', () => {
    if (state.slotDrafts.length <= 2) return;
    state.slotDrafts.pop();
    renderLobby();
    scheduleConfigSave();
  });
  on('debugRolesToggle', 'change', () => {
    state.debugRevealRoles = $('debugRolesToggle').checked;
    renderStaticUI();
    scheduleConfigSave();
  });
  on('clearFeedBtn', 'click', () => {
    state.feedItems = [];
    renderFeed();
  });
  on('focusNextBtn', 'click', () => {
    const agents = state.world?.agents || [];
    if (!agents.length) return;
    const idx = Math.max(0, agents.findIndex((a) => a.id === state.selectedAgentId));
    state.selectedAgentId = agents[(idx + 1) % agents.length].id;
    renderCrew();
    renderDetail();
    if (state.camera.follow === 'selected') renderStaticUI();
  });
  on('focusPrevBtn', 'click', () => {
    const agents = state.world?.agents || [];
    if (!agents.length) return;
    const idx = Math.max(0, agents.findIndex((a) => a.id === state.selectedAgentId));
    state.selectedAgentId = agents[(idx - 1 + agents.length) % agents.length].id;
    renderCrew();
    renderDetail();
    if (state.camera.follow === 'selected') renderStaticUI();
  });

  const canvas = $('worldCanvas');
  if (canvas) {
    canvas.style.touchAction = 'none';
    canvas.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      shiftZoom(ev.deltaY > 0 ? -0.12 : 0.12);
    }, { passive: false });

    const pickAgentAt = (px, py) => {
      if (!state.world?.agents?.length) return null;
      const focus = getCameraFocus();
      const zoom = clamp(Number(state.camera.zoom || 1.25), MIN_ZOOM, MAX_ZOOM);
      const tile = getTileSize(zoom);
      let best = null;
      let bestD = Infinity;
      for (const ag of state.world.agents) {
        const pos = ag.position || { x: 0, y: 0 };
        const ax = pos.x * tile + tile / 2;
        const ay = pos.y * tile + tile / 2;
        const d = Math.hypot(ax - px, ay - py);
        if (d < bestD && d < tile * 1.4) {
          best = ag;
          bestD = d;
        }
      }
      return best;
    };

    canvas.addEventListener('pointerdown', (ev) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const px = (ev.clientX - rect.left) * scaleX;
      const py = (ev.clientY - rect.top) * scaleY;
      state.camera.dragging = true;
      state.camera.dragStartX = px;
      state.camera.dragStartY = py;
      state.camera.dragOriginX = state.camera.x;
      state.camera.dragOriginY = state.camera.y;
      canvas.setPointerCapture(ev.pointerId);
    });

    canvas.addEventListener('pointermove', (ev) => {
      if (!state.camera.dragging) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const px = (ev.clientX - rect.left) * scaleX;
      const py = (ev.clientY - rect.top) * scaleY;
      const zoom = clamp(Number(state.camera.zoom || 1.25), MIN_ZOOM, MAX_ZOOM);
      const tile = getTileSize(zoom);
      const dxTiles = (state.camera.dragStartX - px) / tile;
      const dyTiles = (state.camera.dragStartY - py) / tile;
      state.camera.follow = 'free';
      state.viewerSettings.followMode = 'free';
      state.camera.x = clamp(state.camera.dragOriginX + dxTiles, 0, WORLD_W - 1);
      state.camera.y = clamp(state.camera.dragOriginY + dyTiles, 0, WORLD_H - 1);
      $('followModeValue').textContent = state.camera.follow;
      $('freeCamBtn').classList.add('active');
      $('followShipBtn').classList.remove('active');
      $('followSelectedBtn').classList.remove('active');
    });

    const stopDrag = (ev) => {
      if (!state.camera.dragging) return;
      state.camera.dragging = false;
      try { canvas.releasePointerCapture(ev.pointerId); } catch {}
    };
    canvas.addEventListener('pointerup', stopDrag);
    canvas.addEventListener('pointercancel', stopDrag);
    canvas.addEventListener('pointerleave', stopDrag);

    canvas.addEventListener('click', (ev) => {
      if (state.camera.dragging) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const px = (ev.clientX - rect.left) * scaleX;
      const py = (ev.clientY - rect.top) * scaleY;
      const best = pickAgentAt(px, py);
      if (best) {
        state.selectedAgentId = best.id;
        setFollowMode('selected');
        renderCrew();
        renderDetail();
        renderStaticUI();
      }
    });
  }

  window.addEventListener('resize', resizeCanvasToContainer);
}

async function boot() {
  attachControls();
  resizeCanvasToContainer();
  state.renderHandle = requestAnimationFrame(frame);
  try {
    await loadConfig();
    await loadState();
    setConnection(true, 'ready');
  } catch (err) {
    setConnection(false, err.message);
    $('statusLine').textContent = `Error: ${err.message}`;
  }
  renderUI();
  state.pollHandle = setInterval(pollLoop, API_POLL_MS);
  setInterval(() => {
    if (state.ttsEnabled && state.ttsQueue.length) pumpTTS();
  }, 300);
  if ($('voiceHint')) $('voiceHint').textContent = 'TTS is enabled by default; click the toggle if your browser blocks speech until interaction.';
}

boot().catch((err) => {
  showError(err.message);
  setConnection(false, err.message);
});

