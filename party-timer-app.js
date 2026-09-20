/**
 * 퉁공대 타이머 — index.html 모달 + Document PiP (장부 페이지 이동 없음)
 */
(function (global) {
  let $ = (id) => document.getElementById(id);
  let genId = () => String(Date.now());
  let getState = () => ({ partyTimer: null });
  let scheduleSave = () => {};
  let getRealtimeReady = () => false;
  let getStorageMode = () => 'local';
  let getRoomId = () => 'tongtongi';

  let pipWindow = null;
  let pipTickId = null;
  let slotAlarmFired = {};
  let modalOpen = false;
  let pipStyleEl = null;
  let pipShellReady = false;
  const pipUi = { muted: false, zoom: 100 };

  function defaultSlots() {
    return [
      { id: 'slot-holy', label: '홀리심볼', durationSec: 180, icon: null, enabled: true },
      { id: 'slot-session', label: '한타임', durationSec: 1200, icon: null, enabled: true },
      { id: 'slot-buff1', label: '버프 1', durationSec: 90, icon: null, enabled: true },
      { id: 'slot-consume', label: '소모품', durationSec: 600, icon: null, enabled: true },
    ];
  }

  function defaultPartyTimer() {
    const slots = defaultSlots();
    const presetId = 'preset-default';
    const slotRemaining = {};
    slots.forEach((s) => { slotRemaining[s.id] = s.durationSec * 1000; });
    return {
      schema: 1,
      activePresetId: presetId,
      presets: [{ id: presetId, name: '기본', slots: slots.map((s) => ({ ...s })) }],
      runtime: { huntActive: false, rev: 0, slotRemaining, slotEndsAt: {}, slotPaused: {} },
    };
  }

  function normalizePartyTimer(raw) {
    const base = defaultPartyTimer();
    if (!raw || typeof raw !== 'object') return base;
    const pt = { ...base, ...raw };
    if (!Array.isArray(pt.presets) || !pt.presets.length) pt.presets = base.presets;
    pt.presets = pt.presets.map((p, pi) => ({
      id: p.id || genId(),
      name: String(p.name || '사냥터').trim() || '사냥터',
      slots: (Array.isArray(p.slots) && p.slots.length ? p.slots : defaultSlots()).map((s, i) => ({
        id: s.id || `slot-${pi}-${i}`,
        label: String(s.label || `버프 ${i + 1}`),
        durationSec: Math.max(1, Math.round(Number(s.durationSec) || 60)),
        icon: s.icon || null,
        enabled: s.enabled !== false,
      })),
    }));
    if (!pt.activePresetId || !pt.presets.some((p) => p.id === pt.activePresetId)) {
      pt.activePresetId = pt.presets[0].id;
    }
    const preset = pt.presets.find((p) => p.id === pt.activePresetId) || pt.presets[0];
    const rt = pt.runtime && typeof pt.runtime === 'object' ? pt.runtime : {};
    pt.runtime = {
      huntActive: !!rt.huntActive,
      rev: Number(rt.rev) || 0,
      slotRemaining: rt.slotRemaining && typeof rt.slotRemaining === 'object' ? { ...rt.slotRemaining } : {},
      slotEndsAt: rt.slotEndsAt && typeof rt.slotEndsAt === 'object' ? { ...rt.slotEndsAt } : {},
      slotPaused: rt.slotPaused && typeof rt.slotPaused === 'object' ? { ...rt.slotPaused } : {},
    };
    preset.slots.forEach((s) => {
      if (pt.runtime.slotRemaining[s.id] == null) pt.runtime.slotRemaining[s.id] = s.durationSec * 1000;
    });
    return pt;
  }

  function partyTimer() {
    const st = getState();
    if (!st.partyTimer) st.partyTimer = defaultPartyTimer();
    return st.partyTimer;
  }

  function ensurePartyTimerState() {
    const st = getState();
    st.partyTimer = normalizePartyTimer(st.partyTimer);
    return st.partyTimer;
  }

  function getActivePreset() {
    const pt = partyTimer();
    return pt.presets.find((p) => p.id === pt.activePresetId) || pt.presets[0];
  }

  function findSlot(slotId) {
    return getActivePreset().slots.find((s) => s.id === slotId);
  }

  function bumpRuntimeRev() {
    partyTimer().runtime.rev = (Number(partyTimer().runtime.rev) || 0) + 1;
  }

  function slotRemainingMs(slot, now) {
    const rt = partyTimer().runtime;
    if (rt.huntActive && rt.slotPaused[slot.id]) {
      return Math.max(0, Math.round(Number(rt.slotRemaining[slot.id]) || 0));
    }
    if (rt.huntActive && rt.slotEndsAt[slot.id] != null) {
      return Math.max(0, Math.round(rt.slotEndsAt[slot.id] - now));
    }
    return Math.max(0, Math.round(Number(rt.slotRemaining[slot.id]) || slot.durationSec * 1000));
  }

  function formatMs(ms) {
    const sec = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function syncRuntimeRemainingFromEndsAt(now) {
    const rt = partyTimer().runtime;
    if (!rt.huntActive) return;
    getActivePreset().slots.filter((s) => s.enabled).forEach((s) => {
      if (rt.slotPaused[s.id]) return;
      if (rt.slotEndsAt[s.id] != null) rt.slotRemaining[s.id] = Math.max(0, rt.slotEndsAt[s.id] - now);
    });
  }

  function setPipBannerMessage(msg, isOk) {
    const banner = $('ptPipBanner');
    if (!banner) return;
    banner.textContent = msg;
    banner.classList.toggle('off', !isOk);
  }

  function updateStatusUi() {
    const pt = partyTimer();
    const hunt = pt.runtime.huntActive;
    const live = getStorageMode() === 'cloud' && getRealtimeReady();
    const status = $('ptTimerStatus');
    if (status) {
      status.textContent = `${live ? '실시간 · ' : ''}방 ${getRoomId()}${hunt ? ' · 사냥 중' : ''}`;
    }
    if (pipWindow && !pipWindow.closed) {
      setPipBannerMessage('PIP 활성 — 알림음은 이 PIP 창에서만 재생됩니다. 크기는 모서리를 드래그해 조절하세요.', true);
    } else {
      setPipBannerMessage('PIP가 꺼져 있으면 알림음이 나지 않습니다. 「PIP 열기」를 누르거나 퉁공대 타이머 버튼을 다시 눌러 보세요.', false);
    }
    const startBtn = $('ptHuntStartBtn');
    const endBtn = $('ptHuntEndBtn');
    if (startBtn) startBtn.disabled = hunt;
    if (endBtn) endBtn.disabled = !hunt;
  }

  function renderPresetSelect() {
    const pt = partyTimer();
    const sel = $('ptPresetSelect');
    if (!sel) return;
    sel.innerHTML = '';
    pt.presets.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      if (p.id === pt.activePresetId) opt.selected = true;
      sel.appendChild(opt);
    });
    const nameInp = $('ptPresetNameInput');
    if (nameInp) nameInp.value = getActivePreset().name;
  }

  function renderSlotList() {
    const list = $('ptSlotList');
    if (!list) return;
    list.innerHTML = '';
    const preset = getActivePreset();
    const hunt = partyTimer().runtime.huntActive;
    preset.slots.forEach((slot) => {
      const row = document.createElement('div');
      row.className = 'pt-slot-row';
      const iconHtml = slot.icon ? `<img class="pt-slot-icon" src="${slot.icon}" alt="">` : '';
      row.innerHTML = `
        ${iconHtml}
        <span class="pt-slot-label">${slot.label}</span>
        <input type="number" min="1" max="86400" step="1" data-slot-id="${slot.id}" value="${slot.durationSec}" ${hunt ? 'disabled' : ''}>
        <label class="pt-slot-enable"><input type="checkbox" data-enable-id="${slot.id}" ${slot.enabled ? 'checked' : ''} ${hunt ? 'disabled' : ''}> 사용</label>
      `;
      list.appendChild(row);
    });
    list.querySelectorAll('input[type=number]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const id = inp.dataset.slotId;
        const sec = Math.max(1, Math.round(Number(inp.value) || 60));
        const s = getActivePreset().slots.find((x) => x.id === id);
        if (!s) return;
        s.durationSec = sec;
        inp.value = String(sec);
        if (!partyTimer().runtime.huntActive) partyTimer().runtime.slotRemaining[id] = sec * 1000;
        bumpRuntimeRev();
        scheduleSave();
        rebuildPipTiles();
        updatePipDisplay();
      });
    });
    list.querySelectorAll('input[type=checkbox]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.enableId;
        const s = getActivePreset().slots.find((x) => x.id === id);
        if (s) s.enabled = cb.checked;
        bumpRuntimeRev();
        scheduleSave();
        rebuildPipTiles();
        updatePipDisplay();
      });
    });
  }

  function renderAll() {
    if (!modalOpen) return;
    renderPresetSelect();
    renderSlotList();
    updateStatusUi();
    rebuildPipTiles();
    updatePipDisplay();
  }

  function playPipAlarm() {
    if (pipUi.muted || !pipWindow || pipWindow.closed) return;
    try {
      const ctx = new (pipWindow.AudioContext || pipWindow.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.15;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      setTimeout(() => { osc.stop(); ctx.close(); }, 280);
      setTimeout(() => {
        if (pipUi.muted) return;
        const ctx2 = new (pipWindow.AudioContext || pipWindow.webkitAudioContext)();
        const o2 = ctx2.createOscillator();
        const g2 = ctx2.createGain();
        o2.frequency.value = 660;
        g2.gain.value = 0.15;
        o2.connect(g2);
        g2.connect(ctx2.destination);
        o2.start();
        setTimeout(() => { o2.stop(); ctx2.close(); }, 280);
      }, 320);
    } catch (e) { /* ignore */ }
  }

  function injectPipStyles(doc) {
    if (pipStyleEl) {
      doc.head.appendChild(pipStyleEl.cloneNode(true));
      return;
    }
    document.querySelectorAll('style').forEach((st) => {
      if (st.textContent && st.textContent.includes('pip-app')) {
        doc.head.appendChild(st.cloneNode(true));
      }
    });
  }

  function applyPipZoom(doc) {
    const app = doc.getElementById('pipApp');
    if (app) app.style.setProperty('--pip-zoom', String(pipUi.zoom / 100));
    const zoomLabel = doc.getElementById('pipZoomLabel');
    if (zoomLabel) zoomLabel.textContent = `${pipUi.zoom}%`;
  }

  function pipToolbarHtml() {
    return `
      <header class="pip-toolbar">
        <span class="pip-toolbar-brand">퉁공대</span>
        <div class="pip-toolbar-actions">
          <button type="button" class="pip-tb-btn pip-tb-play" data-pip-act="play" title="전체 재개">▶</button>
          <button type="button" class="pip-tb-btn pip-tb-pause" data-pip-act="pause-all" title="전체 일시정지">⏸</button>
          <button type="button" class="pip-tb-btn pip-tb-reset" data-pip-act="reset-all" title="전체 설정 시간으로">↺</button>
          <button type="button" class="pip-tb-btn pip-tb-mute" data-pip-act="mute" title="알림음">🔊</button>
          <span class="pip-zoom-wrap">
            <button type="button" class="pip-tb-btn pip-tb-zoom" data-pip-act="zoom-out">−</button>
            <span class="pip-zoom-label" id="pipZoomLabel">${pipUi.zoom}%</span>
            <button type="button" class="pip-tb-btn pip-tb-zoom" data-pip-act="zoom-in">+</button>
          </span>
        </div>
      </header>
    `;
  }

  function pipTileHtml(slot) {
    const icon = slot.icon
      ? `<img class="pip-tile-icon" src="${slot.icon}" alt="">`
      : '<span class="pip-tile-icon pip-tile-icon--ph"></span>';
    return `
      <div class="pip-tile" data-slot-id="${slot.id}">
        <div class="pip-tile-top">
          <span class="pip-tile-spacer"></span>
          <button type="button" class="pip-mini-btn pip-slot-mute" data-pip-act="slot-mute" title="이 버프 알림 (준비)" disabled aria-hidden="true">🔈</button>
        </div>
        <div class="pip-tile-head">${icon}<span class="pip-tile-name">${slot.label}</span></div>
        <div class="pip-tile-time">00:00</div>
        <div class="pip-tile-foot">
          <button type="button" class="pip-btn-pause" data-pip-act="slot-pause" title="일시정지">⏸</button>
          <button type="button" class="pip-btn-reset" data-pip-act="slot-reset" title="설정 시간으로">↺</button>
        </div>
      </div>
    `;
  }

  function ensurePipShell() {
    if (!pipWindow || pipWindow.closed) return;
    const doc = pipWindow.document;
    if (pipShellReady && doc.getElementById('pipApp')) return;

    doc.body.innerHTML = '';
    doc.body.className = 'pip-root';
    const app = doc.createElement('div');
    app.id = 'pipApp';
    app.className = 'pip-app';
    app.innerHTML = pipToolbarHtml() + '<div class="pip-grid" id="pipGrid"></div>';
    doc.body.appendChild(app);

    app.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-pip-act]');
      if (!btn) return;
      const act = btn.dataset.pipAct;
      const tile = btn.closest('.pip-tile');
      const slotId = tile ? tile.dataset.slotId : null;
      if (act === 'play') pipGlobalPlay();
      else if (act === 'pause-all') pipGlobalPauseAll();
      else if (act === 'reset-all') pipResetAllSlots();
      else if (act === 'mute') {
        pipUi.muted = !pipUi.muted;
        btn.textContent = pipUi.muted ? '🔇' : '🔊';
        btn.classList.toggle('is-muted', pipUi.muted);
      } else if (act === 'zoom-in') {
        pipUi.zoom = Math.min(140, pipUi.zoom + 10);
        applyPipZoom(doc);
      } else if (act === 'zoom-out') {
        pipUi.zoom = Math.max(70, pipUi.zoom - 10);
        applyPipZoom(doc);
      } else if (act === 'slot-pause' && slotId) toggleSlotPause(slotId);
      else if (act === 'slot-reset' && slotId) resetSlot(slotId);
    });

    pipShellReady = true;
    rebuildPipTiles();
    applyPipZoom(doc);
  }

  function rebuildPipTiles() {
    if (!pipWindow || pipWindow.closed) return;
    ensurePipShell();
    const grid = pipWindow.document.getElementById('pipGrid');
    if (!grid) return;
    const slots = getActivePreset().slots.filter((s) => s.enabled);
    grid.innerHTML = slots.map((s) => pipTileHtml(s)).join('');
  }

  function updatePipDisplay() {
    if (!pipWindow || pipWindow.closed) return;
    ensurePipShell();
    const doc = pipWindow.document;
    const now = Date.now();
    const rt = partyTimer().runtime;
    getActivePreset().slots.filter((s) => s.enabled).forEach((slot) => {
      const tile = doc.querySelector(`.pip-tile[data-slot-id="${slot.id}"]`);
      if (!tile) return;
      const rem = slotRemainingMs(slot, now);
      const timeEl = tile.querySelector('.pip-tile-time');
      if (timeEl) {
        timeEl.textContent = formatMs(rem);
        timeEl.classList.toggle('is-zero', rem <= 0);
      }
      tile.classList.toggle('is-paused', !!rt.slotPaused[slot.id]);
      tile.classList.toggle('is-urgent', rem > 0 && rem <= 3000);
      tile.classList.toggle('is-idle', !rt.huntActive);
      const pauseBtn = tile.querySelector('.pip-btn-pause');
      if (pauseBtn) {
        pauseBtn.textContent = rt.slotPaused[slot.id] ? '▶' : '⏸';
        pauseBtn.title = rt.slotPaused[slot.id] ? '재개' : '일시정지';
      }
    });
    const muteBtn = doc.querySelector('[data-pip-act="mute"]');
    if (muteBtn) {
      muteBtn.textContent = pipUi.muted ? '🔇' : '🔊';
      muteBtn.classList.toggle('is-muted', pipUi.muted);
    }
  }

  function checkPipAlarms(now) {
    if (!pipWindow || pipWindow.closed || !partyTimer().runtime.huntActive) return;
    getActivePreset().slots.filter((s) => s.enabled).forEach((slot) => {
      if (partyTimer().runtime.slotPaused[slot.id]) return;
      const rem = slotRemainingMs(slot, now);
      if (rem > 0) {
        delete slotAlarmFired[slot.id];
        return;
      }
      if (slotAlarmFired[slot.id]) return;
      slotAlarmFired[slot.id] = true;
      playPipAlarm();
      const tile = pipWindow.document.querySelector(`.pip-tile[data-slot-id="${slot.id}"]`);
      if (tile) {
        tile.classList.add('is-alarm');
        setTimeout(() => tile.classList.remove('is-alarm'), 2000);
      }
    });
  }

  function stopPipTick() {
    if (pipTickId) {
      clearInterval(pipTickId);
      pipTickId = null;
    }
  }

  function startPipTick() {
    stopPipTick();
    pipTickId = setInterval(() => {
      if (!pipWindow || pipWindow.closed) {
        stopPipTick();
        pipShellReady = false;
        updateStatusUi();
        return;
      }
      const now = Date.now();
      if (partyTimer().runtime.huntActive) syncRuntimeRemainingFromEndsAt(now);
      updatePipDisplay();
      checkPipAlarms(now);
    }, 200);
  }

  async function openPip() {
    if (!('documentPictureInPicture' in global)) {
      setPipBannerMessage('PIP는 Chrome·Edge(데스크톱)에서 지원됩니다. 설정은 이 창에서 계속할 수 있어요.', false);
      return false;
    }
    if (pipWindow && !pipWindow.closed) {
      pipWindow.focus();
      return true;
    }
    try {
      pipWindow = await global.documentPictureInPicture.requestWindow({ width: 400, height: 440 });
      pipShellReady = false;
      injectPipStyles(pipWindow.document);
      pipWindow.document.title = '퉁공대 타이머';
      pipWindow.addEventListener('pagehide', () => {
        pipWindow = null;
        pipShellReady = false;
        stopPipTick();
        updateStatusUi();
      });
      ensurePipShell();
      startPipTick();
      updateStatusUi();
      return true;
    } catch (e) {
      setPipBannerMessage('PIP를 열지 못했어요. 주소창 자물쇠/권한에서 Picture-in-Picture를 허용한 뒤 「PIP 열기」를 다시 눌러 주세요.', false);
      return false;
    }
  }

  function toggleSlotPause(slotId) {
    const rt = partyTimer().runtime;
    const slot = findSlot(slotId);
    if (!slot || !rt.huntActive) return;
    const now = Date.now();
    if (rt.slotPaused[slotId]) {
      delete rt.slotPaused[slotId];
      const rem = Math.max(0, Number(rt.slotRemaining[slotId]) || slot.durationSec * 1000);
      rt.slotEndsAt[slotId] = now + rem;
    } else {
      if (rt.slotEndsAt[slotId] != null) {
        rt.slotRemaining[slotId] = Math.max(0, rt.slotEndsAt[slotId] - now);
      }
      delete rt.slotEndsAt[slotId];
      rt.slotPaused[slotId] = true;
    }
    bumpRuntimeRev();
    scheduleSave();
    updatePipDisplay();
  }

  function resetSlot(slotId) {
    const rt = partyTimer().runtime;
    const slot = findSlot(slotId);
    if (!slot) return;
    const rem = slot.durationSec * 1000;
    rt.slotRemaining[slotId] = rem;
    delete rt.slotPaused[slotId];
    delete slotAlarmFired[slotId];
    if (rt.huntActive) rt.slotEndsAt[slotId] = Date.now() + rem;
    else delete rt.slotEndsAt[slotId];
    bumpRuntimeRev();
    scheduleSave();
    updatePipDisplay();
  }

  function pipResetAllSlots() {
    getActivePreset().slots.filter((s) => s.enabled).forEach((s) => resetSlot(s.id));
  }

  function pipGlobalPauseAll() {
    const rt = partyTimer().runtime;
    if (!rt.huntActive) return;
    const now = Date.now();
    getActivePreset().slots.filter((s) => s.enabled).forEach((slot) => {
      if (rt.slotPaused[slot.id]) return;
      if (rt.slotEndsAt[slot.id] != null) {
        rt.slotRemaining[slot.id] = Math.max(0, rt.slotEndsAt[slot.id] - now);
      }
      delete rt.slotEndsAt[slot.id];
      rt.slotPaused[slot.id] = true;
    });
    bumpRuntimeRev();
    scheduleSave();
    updatePipDisplay();
  }

  function pipGlobalPlay() {
    const rt = partyTimer().runtime;
    if (!rt.huntActive) {
      huntStart();
      return;
    }
    const now = Date.now();
    getActivePreset().slots.filter((s) => s.enabled).forEach((slot) => {
      if (!rt.slotPaused[slot.id]) return;
      delete rt.slotPaused[slot.id];
      const rem = Math.max(0, Number(rt.slotRemaining[slot.id]) || slot.durationSec * 1000);
      rt.slotEndsAt[slot.id] = now + rem;
    });
    bumpRuntimeRev();
    scheduleSave();
    updatePipDisplay();
  }

  function huntStart() {
    const pt = partyTimer();
    if (pt.runtime.huntActive) return;
    const now = Date.now();
    const preset = getActivePreset();
    pt.runtime.huntActive = true;
    pt.runtime.slotPaused = {};
    preset.slots.filter((s) => s.enabled).forEach((s) => {
      const rem = Math.max(0, Number(pt.runtime.slotRemaining[s.id]) || s.durationSec * 1000);
      pt.runtime.slotEndsAt[s.id] = now + rem;
    });
    bumpRuntimeRev();
    Object.keys(slotAlarmFired).forEach((k) => delete slotAlarmFired[k]);
    scheduleSave();
    renderAll();
    updatePipDisplay();
  }

  function huntEnd() {
    const pt = partyTimer();
    if (!pt.runtime.huntActive) return;
    const preset = getActivePreset();
    pt.runtime.huntActive = false;
    pt.runtime.slotEndsAt = {};
    pt.runtime.slotPaused = {};
    preset.slots.forEach((s) => {
      pt.runtime.slotRemaining[s.id] = s.durationSec * 1000;
    });
    bumpRuntimeRev();
    Object.keys(slotAlarmFired).forEach((k) => delete slotAlarmFired[k]);
    scheduleSave();
    renderAll();
    updatePipDisplay();
  }

  function closeModal() {
    modalOpen = false;
    const modal = $('partyTimerModal');
    if (modal) modal.hidden = true;
    stopPipTick();
    if (pipWindow && !pipWindow.closed) {
      try { pipWindow.close(); } catch (err) { /* ignore */ }
    }
    pipWindow = null;
    pipShellReady = false;
  }

  function openModal() {
    ensurePartyTimerState();
    modalOpen = true;
    const modal = $('partyTimerModal');
    if (modal) modal.hidden = false;
    renderAll();
  }

  function openFromUserGesture() {
    openModal();
    void openPip();
  }

  function onRemoteStateApplied() {
    ensurePartyTimerState();
    if (modalOpen) renderAll();
    else if (pipWindow && !pipWindow.closed) {
      rebuildPipTiles();
      updatePipDisplay();
    }
  }

  function bindUiOnce() {
    if (bindUiOnce.done) return;
    bindUiOnce.done = true;

    $('ptPresetSelect')?.addEventListener('change', () => {
      const pt = partyTimer();
      pt.activePresetId = $('ptPresetSelect').value;
      if (!pt.runtime.huntActive) {
        getActivePreset().slots.forEach((s) => {
          pt.runtime.slotRemaining[s.id] = s.durationSec * 1000;
        });
      }
      bumpRuntimeRev();
      scheduleSave();
      renderAll();
    });

    $('ptPresetSaveBtn')?.addEventListener('click', () => {
      getActivePreset().name = ($('ptPresetNameInput').value || '').trim() || '사냥터';
      bumpRuntimeRev();
      scheduleSave();
      renderPresetSelect();
    });

    $('ptPresetAddBtn')?.addEventListener('click', () => {
      const id = genId();
      const slots = defaultSlots().map((s) => ({ ...s, id: genId() }));
      const pt = partyTimer();
      pt.presets.push({ id, name: '새 사냥터', slots });
      pt.activePresetId = id;
      if (!pt.runtime.huntActive) {
        slots.forEach((s) => { pt.runtime.slotRemaining[s.id] = s.durationSec * 1000; });
      }
      bumpRuntimeRev();
      scheduleSave();
      renderAll();
    });

    $('ptPresetDeleteBtn')?.addEventListener('click', () => {
      const pt = partyTimer();
      if (pt.presets.length <= 1) {
        setPipBannerMessage('마지막 프리셋은 삭제할 수 없어요.', false);
        return;
      }
      if (!global.confirm('이 사냥터 프리셋을 삭제할까요?')) return;
      pt.presets = pt.presets.filter((p) => p.id !== pt.activePresetId);
      pt.activePresetId = pt.presets[0].id;
      if (!pt.runtime.huntActive) {
        getActivePreset().slots.forEach((s) => {
          pt.runtime.slotRemaining[s.id] = s.durationSec * 1000;
        });
      }
      bumpRuntimeRev();
      scheduleSave();
      renderAll();
    });

    $('ptHuntStartBtn')?.addEventListener('click', huntStart);
    $('ptHuntEndBtn')?.addEventListener('click', huntEnd);
    $('ptPipOpenBtn')?.addEventListener('click', () => { void openPip(); });
    $('ptLeaveBtn')?.addEventListener('click', closeModal);
    $('ptTimerCloseBtn')?.addEventListener('click', closeModal);
    $('partyTimerModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'partyTimerModal') closeModal();
    });
  }

  function init(options) {
    $ = options.$ || $;
    genId = options.genId || genId;
    getState = options.getState || getState;
    scheduleSave = options.scheduleSave || scheduleSave;
    getRealtimeReady = options.getRealtimeReady || getRealtimeReady;
    getStorageMode = options.getStorageMode || getStorageMode;
    getRoomId = options.getRoomId || getRoomId;
    pipStyleEl = $('partyTimerPipStyles');
    bindUiOnce();
  }

  global.PartyTimerApp = {
    init,
    ensurePartyTimerState,
    normalizePartyTimer,
    openFromUserGesture,
    openModal,
    openPip,
    closeModal,
    onRemoteStateApplied,
    isModalOpen: () => modalOpen,
  };
})(typeof window !== 'undefined' ? window : globalThis);
