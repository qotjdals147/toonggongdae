/**
 * 퉁공대 타이머 — PIP 전용 (설정 ↔ 사냥 화면 전환)
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
  let pipStyleEl = null;
  let pipClickBound = false;
  const pipUi = { muted: false };

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

  function assetUrl(path) {
    if (!path) return '';
    if (/^https?:\/\//i.test(path) || path.startsWith('data:')) return path;
    try {
      return new URL(path, global.location.href).href;
    } catch (e) {
      return path;
    }
  }

  function enabledSlots() {
    return getActivePreset().slots.filter((s) => s.enabled);
  }

  function injectPipStyles(doc) {
    if (pipStyleEl) doc.head.appendChild(pipStyleEl.cloneNode(true));
  }

  function fitPipWindowSize() {
    if (!pipWindow || pipWindow.closed) return;
    const doc = pipWindow.document;
    const app = doc.getElementById('pipApp');
    if (!app) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const rect = app.getBoundingClientRect();
        const w = Math.min(560, Math.max(300, Math.ceil(rect.width) + 20));
        const h = Math.min(780, Math.max(160, Math.ceil(rect.height) + 24));
        try {
          if (typeof pipWindow.resizeTo === 'function') pipWindow.resizeTo(w, h);
        } catch (e) { /* ignore */ }
      });
    });
  }

  function pipToolbarHtml() {
    return `
      <header class="pip-toolbar">
        <span class="pip-toolbar-brand">퉁공대</span>
        <div class="pip-toolbar-actions">
          <button type="button" class="pip-tb-btn pip-tb-play" data-pip-act="play" title="전체 재개">▶</button>
          <button type="button" class="pip-tb-btn pip-tb-pause" data-pip-act="pause-all" title="전체 일시정지">⏸</button>
          <button type="button" class="pip-tb-btn pip-tb-reset" data-pip-act="reset-all" title="전체 설정 시간으로">↺</button>
          <button type="button" class="pip-tb-btn pip-tb-mute${pipUi.muted ? ' is-muted' : ''}" data-pip-act="mute" title="알림음">${pipUi.muted ? '🔇' : '🔊'}</button>
        </div>
      </header>
    `;
  }

  function pipTileHtml(slot) {
    const icon = slot.icon
      ? `<img class="pip-tile-icon" src="${assetUrl(slot.icon)}" alt="">`
      : '<span class="pip-tile-icon pip-tile-icon--ph" aria-hidden="true"></span>';
    return `
      <article class="pip-tile" data-slot-id="${slot.id}">
        <div class="pip-tile-top">
          <button type="button" class="pip-corner-btn pip-corner-loop" data-pip-act="noop" tabindex="-1" aria-hidden="true">⟲</button>
          <button type="button" class="pip-corner-btn pip-corner-sound" data-pip-act="noop" tabindex="-1" aria-hidden="true">🔊</button>
        </div>
        <div class="pip-tile-head">${icon}<span class="pip-tile-name">${slot.label}</span></div>
        <div class="pip-tile-time">00:00</div>
        <div class="pip-tile-foot">
          <button type="button" class="pip-btn-pause" data-pip-act="slot-pause" title="일시정지">⏸</button>
          <button type="button" class="pip-btn-reset" data-pip-act="slot-reset" title="설정 시간으로">↺</button>
        </div>
      </article>
    `;
  }

  function pipHuntViewHtml() {
    const n = enabledSlots().length;
    const cols = n <= 1 ? 1 : 2;
    return `
      <div class="pip-hunt">
        ${pipToolbarHtml()}
        <div class="pip-grid pip-grid--${cols}" id="pipGrid" style="--pip-cols:${cols}">
          ${enabledSlots().map((s) => pipTileHtml(s)).join('')}
        </div>
        <button type="button" class="pip-cta pip-cta-end" data-pip-act="hunt-end">사냥 종료</button>
      </div>
    `;
  }

  function pipSetupViewHtml() {
    const preset = getActivePreset();
    const slotRows = preset.slots.map((slot) => {
      const icon = slot.icon ? `<img class="pip-setup-icon" src="${assetUrl(slot.icon)}" alt="">` : '';
      return `
        <div class="pip-setup-slot" data-slot-id="${slot.id}">
          ${icon}
          <span class="pip-setup-slot-name">${slot.label}</span>
          <input type="number" class="pip-setup-sec" min="1" max="86400" value="${slot.durationSec}" data-pip-field="sec">
          <label class="pip-setup-use"><input type="checkbox" data-pip-field="enabled" ${slot.enabled ? 'checked' : ''}> 사용</label>
        </div>
      `;
    }).join('');

    return `
      <div class="pip-setup">
        <div class="pip-setup-title">퉁공대 타이머</div>
        <p class="pip-setup-sub">방 ${getRoomId()}${getRealtimeReady() && getStorageMode() === 'cloud' ? ' · 실시간' : ''}</p>
        <div class="pip-setup-block">
          <div class="pip-setup-label">사냥터</div>
          <div class="pip-setup-presets">
            <select id="pipPresetSelect" data-pip-field="preset"></select>
            <input type="text" id="pipPresetName" value="${preset.name}" placeholder="이름" data-pip-field="preset-name">
            <button type="button" class="pip-setup-mini" data-pip-act="preset-save">저장</button>
            <button type="button" class="pip-setup-mini" data-pip-act="preset-add">+</button>
            <button type="button" class="pip-setup-mini" data-pip-act="preset-del">삭제</button>
          </div>
        </div>
        <div class="pip-setup-block">
          <div class="pip-setup-label">버프 · 초</div>
          <div class="pip-setup-slots">${slotRows}</div>
        </div>
        <button type="button" class="pip-cta pip-cta-start" data-pip-act="hunt-start">사냥 시작</button>
      </div>
    `;
  }

  function renderPipView() {
    if (!pipWindow || pipWindow.closed) return;
    const doc = pipWindow.document;
    const app = doc.getElementById('pipApp');
    if (!app) return;
    const hunt = partyTimer().runtime.huntActive;
    app.className = 'pip-app' + (hunt ? ' pip-app--hunt' : ' pip-app--setup');
    app.innerHTML = hunt ? pipHuntViewHtml() : pipSetupViewHtml();

    const sel = doc.getElementById('pipPresetSelect');
    if (sel) {
      sel.innerHTML = '';
      partyTimer().presets.forEach((p) => {
        const opt = doc.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        if (p.id === partyTimer().activePresetId) opt.selected = true;
        sel.appendChild(opt);
      });
    }

    bindPipEvents(app);
    if (hunt) updatePipDisplay();
    fitPipWindowSize();
    syncPipTick();
  }

  function bindPipEvents(app) {
    if (!pipClickBound) {
      pipClickBound = true;
    }
    app.onclick = (e) => {
      const btn = e.target.closest('[data-pip-act]');
      if (btn && btn.dataset.pipAct !== 'noop') {
        handlePipAction(btn.dataset.pipAct, btn.closest('.pip-tile')?.dataset.slotId);
        return;
      }
    };
    app.onchange = (e) => {
      const t = e.target;
      if (t.id === 'pipPresetSelect' || t.dataset.pipField === 'preset') {
        partyTimer().activePresetId = t.value;
        if (!partyTimer().runtime.huntActive) {
          getActivePreset().slots.forEach((s) => {
            partyTimer().runtime.slotRemaining[s.id] = s.durationSec * 1000;
          });
        }
        bumpRuntimeRev();
        scheduleSave();
        renderPipView();
        return;
      }
      const row = t.closest('.pip-setup-slot');
      if (!row) return;
      const slotId = row.dataset.slotId;
      const slot = findSlot(slotId);
      if (!slot) return;
      if (t.dataset.pipField === 'sec') {
        const sec = Math.max(1, Math.round(Number(t.value) || 60));
        slot.durationSec = sec;
        t.value = String(sec);
        if (!partyTimer().runtime.huntActive) partyTimer().runtime.slotRemaining[slotId] = sec * 1000;
      } else if (t.dataset.pipField === 'enabled') {
        slot.enabled = t.checked;
      }
      bumpRuntimeRev();
      scheduleSave();
      fitPipWindowSize();
    };
  }

  function handlePipAction(act, slotId) {
    if (act === 'hunt-start') huntStart();
    else if (act === 'hunt-end') huntEnd();
    else if (act === 'play') pipGlobalPlay();
    else if (act === 'pause-all') pipGlobalPauseAll();
    else if (act === 'reset-all') pipResetAllSlots();
    else if (act === 'mute') {
      pipUi.muted = !pipUi.muted;
      renderPipView();
    } else if (act === 'preset-save') {
      const doc = pipWindow.document;
      const name = doc.getElementById('pipPresetName')?.value?.trim() || '사냥터';
      getActivePreset().name = name;
      bumpRuntimeRev();
      scheduleSave();
      renderPipView();
    } else if (act === 'preset-add') {
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
      renderPipView();
    } else if (act === 'preset-del') {
      const pt = partyTimer();
      if (pt.presets.length <= 1) return;
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
      renderPipView();
    } else if (act === 'slot-pause' && slotId) toggleSlotPause(slotId);
    else if (act === 'slot-reset' && slotId) resetSlot(slotId);
  }

  function updatePipDisplay() {
    if (!pipWindow || pipWindow.closed || !partyTimer().runtime.huntActive) return;
    const doc = pipWindow.document;
    const now = Date.now();
    const rt = partyTimer().runtime;
    enabledSlots().forEach((slot) => {
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
      const pauseBtn = tile.querySelector('.pip-btn-pause');
      if (pauseBtn) {
        const paused = !!rt.slotPaused[slot.id];
        pauseBtn.textContent = paused ? '▶' : '⏸';
        pauseBtn.classList.toggle('is-play', paused);
        pauseBtn.title = paused ? '재개' : '일시정지';
      }
    });
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
    } catch (e) { /* ignore */ }
  }

  function checkPipAlarms(now) {
    if (!pipWindow || pipWindow.closed || !partyTimer().runtime.huntActive) return;
    enabledSlots().forEach((slot) => {
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

  function syncPipTick() {
    stopPipTick();
    if (!pipWindow || pipWindow.closed || !partyTimer().runtime.huntActive) return;
    pipTickId = setInterval(() => {
      if (!pipWindow || pipWindow.closed) {
        stopPipTick();
        return;
      }
      const now = Date.now();
      syncRuntimeRemainingFromEndsAt(now);
      updatePipDisplay();
      checkPipAlarms(now);
    }, 200);
  }

  async function openPip() {
    if (!('documentPictureInPicture' in global)) {
      alert('PIP는 Chrome·Edge(데스크톱)에서 지원됩니다.');
      return false;
    }
    ensurePartyTimerState();
    if (pipWindow && !pipWindow.closed) {
      pipWindow.focus();
      renderPipView();
      return true;
    }
    try {
      const hunt = partyTimer().runtime.huntActive;
      const n = enabledSlots().length;
      const cols = n <= 1 ? 1 : 2;
      const rows = Math.max(1, Math.ceil(n / cols));
      const initW = cols === 1 ? 220 : 400;
      const initH = hunt ? 120 + rows * 168 + 52 : 340;
      pipWindow = await global.documentPictureInPicture.requestWindow({
        width: initW,
        height: Math.min(initH, 720),
      });
      pipClickBound = false;
      injectPipStyles(pipWindow.document);
      pipWindow.document.title = '퉁공대 타이머';
      pipWindow.document.body.className = 'pip-root';
      pipWindow.document.body.innerHTML = '<div id="pipApp" class="pip-app"></div>';
      pipWindow.addEventListener('pagehide', () => {
        pipWindow = null;
        stopPipTick();
      });
      renderPipView();
      return true;
    } catch (e) {
      alert('PIP를 열지 못했어요. 주소창 옆 권한에서 Picture-in-Picture를 허용해 주세요.');
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
    enabledSlots().forEach((s) => resetSlot(s.id));
  }

  function pipGlobalPauseAll() {
    const rt = partyTimer().runtime;
    if (!rt.huntActive) return;
    const now = Date.now();
    enabledSlots().forEach((slot) => {
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
    if (!rt.huntActive) return;
    const now = Date.now();
    enabledSlots().forEach((slot) => {
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
    renderPipView();
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
    renderPipView();
  }

  function openFromUserGesture() {
    void openPip();
  }

  function onRemoteStateApplied() {
    ensurePartyTimerState();
    if (pipWindow && !pipWindow.closed) renderPipView();
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
  }

  global.PartyTimerApp = {
    init,
    ensurePartyTimerState,
    normalizePartyTimer,
    openFromUserGesture,
    openPip,
    onRemoteStateApplied,
    isPipOpen: () => pipWindow && !pipWindow.closed,
  };
})(typeof window !== 'undefined' ? window : globalThis);
