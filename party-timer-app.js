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
      runtime: { huntActive: false, rev: 0, slotRemaining, slotEndsAt: {} },
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

  function bumpRuntimeRev() {
    partyTimer().runtime.rev = (Number(partyTimer().runtime.rev) || 0) + 1;
  }

  function slotRemainingMs(slot, now) {
    const rt = partyTimer().runtime;
    if (rt.huntActive && rt.slotEndsAt[slot.id] != null) {
      return Math.max(0, Math.round(rt.slotEndsAt[slot.id] - now));
    }
    return Math.max(0, Math.round(Number(rt.slotRemaining[slot.id]) || slot.durationSec * 1000));
  }

  function formatMs(ms) {
    const sec = Math.ceil(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function syncRuntimeRemainingFromEndsAt(now) {
    const rt = partyTimer().runtime;
    if (!rt.huntActive) return;
    getActivePreset().slots.filter((s) => s.enabled).forEach((s) => {
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
        renderPipTimers();
      });
    });
    list.querySelectorAll('input[type=checkbox]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.enableId;
        const s = getActivePreset().slots.find((x) => x.id === id);
        if (s) s.enabled = cb.checked;
        bumpRuntimeRev();
        scheduleSave();
        renderPipTimers();
      });
    });
  }

  function renderAll() {
    if (!modalOpen) return;
    renderPresetSelect();
    renderSlotList();
    updateStatusUi();
    renderPipTimers();
  }

  function playPipAlarm() {
    if (!pipWindow || pipWindow.closed) return;
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
      if (st.textContent && st.textContent.includes('pip-card')) {
        doc.head.appendChild(st.cloneNode(true));
      }
    });
  }

  function renderPipTimers() {
    if (!pipWindow || pipWindow.closed) return;
    const doc = pipWindow.document;
    let root = doc.getElementById('pipRoot');
    if (!root) {
      doc.body.innerHTML = '';
      doc.body.className = 'pip-root';
      root = doc.createElement('div');
      root.id = 'pipRoot';
      root.className = 'pip-root';
      doc.body.appendChild(root);
    }
    const preset = getActivePreset();
    const now = Date.now();
    const grid = doc.createElement('div');
    grid.className = 'pip-grid';
    preset.slots.filter((s) => s.enabled).forEach((slot) => {
      const rem = slotRemainingMs(slot, now);
      const card = doc.createElement('div');
      card.className = 'pip-card';
      card.dataset.slotId = slot.id;
      const icon = slot.icon ? `<img class="pip-card-icon" src="${slot.icon}" alt="">` : '';
      card.innerHTML = `${icon}<div class="pip-card-label">${slot.label}</div><div class="pip-card-time${rem <= 0 ? ' is-zero' : ''}">${formatMs(rem)}</div>`;
      grid.appendChild(card);
    });
    root.innerHTML = '';
    root.appendChild(grid);
  }

  function checkPipAlarms(now) {
    if (!pipWindow || pipWindow.closed || !partyTimer().runtime.huntActive) return;
    getActivePreset().slots.filter((s) => s.enabled).forEach((slot) => {
      const rem = slotRemainingMs(slot, now);
      if (rem > 0) {
        delete slotAlarmFired[slot.id];
        return;
      }
      if (slotAlarmFired[slot.id]) return;
      slotAlarmFired[slot.id] = true;
      playPipAlarm();
      const card = pipWindow.document.querySelector(`.pip-card[data-slot-id="${slot.id}"]`);
      if (card) {
        card.classList.add('is-alarm');
        setTimeout(() => card.classList.remove('is-alarm'), 2000);
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
        updateStatusUi();
        return;
      }
      const now = Date.now();
      if (partyTimer().runtime.huntActive) syncRuntimeRemainingFromEndsAt(now);
      renderPipTimers();
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
      pipWindow = await global.documentPictureInPicture.requestWindow({ width: 480, height: 320 });
      injectPipStyles(pipWindow.document);
      pipWindow.document.title = '퉁공대 타이머';
      pipWindow.addEventListener('pagehide', () => {
        pipWindow = null;
        stopPipTick();
        updateStatusUi();
      });
      renderPipTimers();
      startPipTick();
      updateStatusUi();
      return true;
    } catch (e) {
      setPipBannerMessage('PIP를 열지 못했어요. 주소창 자물쇠/권한에서 「Picture-in-Picture」를 허용하거나, 팝업·PIP 차단을 해제한 뒤 「PIP 열기」를 다시 눌러 주세요.', false);
      return false;
    }
  }

  function huntStart() {
    const pt = partyTimer();
    if (pt.runtime.huntActive) return;
    const now = Date.now();
    const preset = getActivePreset();
    pt.runtime.huntActive = true;
    preset.slots.filter((s) => s.enabled).forEach((s) => {
      const rem = Math.max(0, Number(pt.runtime.slotRemaining[s.id]) || s.durationSec * 1000);
      pt.runtime.slotEndsAt[s.id] = now + rem;
    });
    bumpRuntimeRev();
    Object.keys(slotAlarmFired).forEach((k) => delete slotAlarmFired[k]);
    scheduleSave();
    renderAll();
  }

  function huntEnd() {
    const pt = partyTimer();
    if (!pt.runtime.huntActive) return;
    const preset = getActivePreset();
    pt.runtime.huntActive = false;
    pt.runtime.slotEndsAt = {};
    preset.slots.forEach((s) => {
      pt.runtime.slotRemaining[s.id] = s.durationSec * 1000;
    });
    bumpRuntimeRev();
    Object.keys(slotAlarmFired).forEach((k) => delete slotAlarmFired[k]);
    scheduleSave();
    renderAll();
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
    else if (pipWindow && !pipWindow.closed) renderPipTimers();
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
