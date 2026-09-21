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
  let huntRuntimeTickId = null;
  let slotAlarmFired = {};
  /** slotId → 재생 중 Audio (같은 슬롯만 정지 · 슬롯끼리 겹침 허용) */
  let slotActiveAudios = {};
  /** slotId → generation (stale 콜백 무시) */
  let slotAlarmGen = {};
  /** slotId → { src, audio } · PiP에서 preload만 (재생은 매회 새 Audio) */
  let slotAudioWarm = {};
  const HUNT_RUNTIME_TICK_MS = 80;
  /** slotId → setTimeout id · endsAt 시각에 맞춰 0초 알람 */
  let slotEndTimers = {};
  let pipStyleEl = null;
  let pipClickBound = false;
  const pipUi = { muted: false, notice: '' };
  const TIMER_SOUND_SLOT_IDS = ['slot-holy', 'slot-session', 'slot-buff1', 'slot-consume'];

  const BUILTIN_SLOT_DEFAULTS = {
    'slot-holy': { label: '홀리 심볼', icon: 'image/스킬아이콘/홀리심볼.png' },
    'slot-session': { label: '한타임', icon: 'image/스킬아이콘/한타임.png' },
    'slot-buff1': { label: '경쿠', icon: 'image/아이템아이콘/경쿠.png' },
    'slot-consume': { label: '기타', icon: null, freeLabel: true },
  };

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(str) {
    return escapeHtml(str);
  }

  function applyBuiltinSlotDefaults(slot) {
    const def = BUILTIN_SLOT_DEFAULTS[slot.id];
    if (!def) return slot;
    if (def.icon) slot.icon = def.icon;
    if (def.freeLabel) {
      if (slot.label === '소mo품' || slot.label === '소모품') slot.label = def.label;
    } else {
      slot.label = def.label;
    }
    return slot;
  }

  function setPipSetupNotice(text) {
    pipUi.notice = text || '';
    if (!pipWindow || pipWindow.closed) return;
    const el = pipWindow.document.getElementById('pipSetupNotice');
    if (el) {
      el.textContent = pipUi.notice;
      el.hidden = !pipUi.notice;
    }
  }

  function defaultSlots() {
    return [
      { id: 'slot-holy', label: '홀리 심볼', durationSec: 180, durationUnit: 'sec', icon: BUILTIN_SLOT_DEFAULTS['slot-holy'].icon, enabled: true },
      { id: 'slot-session', label: '한타임', durationSec: 1200, durationUnit: 'min', icon: BUILTIN_SLOT_DEFAULTS['slot-session'].icon, enabled: true },
      { id: 'slot-buff1', label: '경쿠', durationSec: 90, durationUnit: 'sec', icon: BUILTIN_SLOT_DEFAULTS['slot-buff1'].icon, enabled: true },
      { id: 'slot-consume', label: '기타', durationSec: 600, durationUnit: 'min', icon: null, enabled: true },
    ];
  }

  function defaultSoundProfiles() {
    const profiles = {};
    TIMER_SOUND_SLOT_IDS.forEach((id) => {
      profiles[id] = { src: null, volume: 1, repeatCount: 1, fileName: '' };
    });
    return profiles;
  }

  function normalizeSoundProfile(raw) {
    const base = { src: null, volume: 1, repeatCount: 1, fileName: '' };
    if (!raw || typeof raw !== 'object') return { ...base };
    let volume = Number(raw.volume);
    if (!Number.isFinite(volume)) volume = 1;
    volume = Math.max(0, Math.min(1, volume));
    let repeatCount = Math.round(Number(raw.repeatCount) || 1);
    repeatCount = Math.max(1, Math.min(20, repeatCount));
    const src = typeof raw.src === 'string' && raw.src.trim() ? raw.src.trim() : null;
    const fileName = String(raw.fileName || '').trim().slice(0, 160);
    return { src, volume, repeatCount, fileName };
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
      soundProfiles: defaultSoundProfiles(),
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
      slots: (Array.isArray(p.slots) && p.slots.length ? p.slots : defaultSlots()).map((s, i) => {
        const slot = {
          id: s.id || `slot-${pi}-${i}`,
          label: String(s.label || `버프 ${i + 1}`),
          durationSec: Math.max(1, Math.round(Number(s.durationSec) || 60)),
          durationUnit: s.durationUnit === 'min' ? 'min' : 'sec',
          icon: s.icon || null,
          enabled: s.enabled !== false,
        };
        return applyBuiltinSlotDefaults(slot);
      }),
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
    const mergedSound = defaultSoundProfiles();
    const rawSound = raw && raw.soundProfiles && typeof raw.soundProfiles === 'object' ? raw.soundProfiles : {};
    TIMER_SOUND_SLOT_IDS.forEach((id) => {
      mergedSound[id] = normalizeSoundProfile({ ...mergedSound[id], ...rawSound[id] });
    });
    pt.soundProfiles = mergedSound;
    return pt;
  }

  function getSoundProfile(slotId) {
    ensurePartyTimerState();
    const profiles = partyTimer().soundProfiles || defaultSoundProfiles();
    return normalizeSoundProfile(profiles[slotId] || {});
  }

  function updateSoundProfile(slotId, patch) {
    if (!TIMER_SOUND_SLOT_IDS.includes(slotId)) return;
    ensurePartyTimerState();
    const pt = partyTimer();
    pt.soundProfiles[slotId] = normalizeSoundProfile({ ...pt.soundProfiles[slotId], ...patch });
    scheduleSave();
    if (pipWindow && !pipWindow.closed) {
      ensureWarmAlarmAudio(pipWindow.document, slotId, pt.soundProfiles[slotId]);
    }
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

  function slotCycleMs(slot) {
    return Math.max(1000, Math.round(Number(slot.durationSec) || 60) * 1000);
  }

  function stopPlaybackItem(item) {
    try {
      if (item && typeof item.stop === 'function') item.stop();
      else if (item && typeof item.pause === 'function') {
        item.pause();
        item.currentTime = 0;
      }
    } catch (e) { /* ignore */ }
  }

  function stopSlotAudios(slotId) {
    const set = slotActiveAudios[slotId];
    if (!set) return;
    set.forEach(stopPlaybackItem);
    set.clear();
  }

  function stopAllSlotAudios() {
    Object.keys(slotActiveAudios).forEach((id) => stopSlotAudios(id));
    slotAlarmGen = {};
  }

  function clearSlotAudioWarm() {
    slotAudioWarm = {};
  }

  function ensureWarmAlarmAudio(doc, slotId, profile) {
    if (!profile || !profile.src || !doc || !doc.defaultView) return null;
    const src = profile.src;
    let entry = slotAudioWarm[slotId];
    if (!entry || entry.src !== src) {
      const audio = new doc.defaultView.Audio(src);
      audio.preload = 'auto';
      try { audio.load(); } catch (e) { /* ignore */ }
      entry = { src, audio };
      slotAudioWarm[slotId] = entry;
    }
    return entry.audio;
  }

  function warmAllAlarmAudiosInPip() {
    if (!pipWindow || pipWindow.closed) return;
    const doc = pipWindow.document;
    TIMER_SOUND_SLOT_IDS.forEach((id) => {
      ensureWarmAlarmAudio(doc, id, getSoundProfile(id));
    });
  }

  function slotDurationUnit(slot) {
    return slot && slot.durationUnit === 'min' ? 'min' : 'sec';
  }

  function slotInputValue(slot) {
    if (slotDurationUnit(slot) === 'min') {
      return Math.max(1, Math.round(slot.durationSec / 60));
    }
    return slot.durationSec;
  }

  function slotInputMax(slot) {
    return slotDurationUnit(slot) === 'min' ? 1440 : 86400;
  }

  function applySlotDurationInput(slot, rawVal) {
    const n = Math.max(1, Math.round(Number(rawVal) || 1));
    if (slotDurationUnit(slot) === 'min') slot.durationSec = n * 60;
    else slot.durationSec = n;
  }

  function injectPipStyles(doc) {
    const el = pipStyleEl || document.getElementById('partyTimerPipStyles');
    const css = el && el.textContent ? el.textContent.trim() : '';
    if (!css) return;
    let st = doc.getElementById('pipStylesInjected');
    if (!st) {
      st = doc.createElement('style');
      st.id = 'pipStylesInjected';
      doc.head.appendChild(st);
    }
    st.textContent = css;
  }

  /** PiP 창 크기 — 타일 172×156 · 2열 · 설정 화면 높이는 슬롯 줄 수 기준 */
  function computePipTargetSize() {
    const TILE_W = 172;
    const TILE_H = 156;
    const GAP = 10;
    const PAD_X = 32;
    const PAD_Y = 36;
    const hunt = partyTimer().runtime.huntActive;
    if (!hunt) {
      const n = getActivePreset().slots.length;
      const gridRows = Math.max(1, Math.ceil(n / 2));
      const w = 368 + PAD_X;
      const h = PAD_Y + 52 + 58 + gridRows * 82 + 56;
      return { w, h };
    }
    const n = Math.max(1, enabledSlots().length);
    const cols = n <= 1 ? 1 : 2;
    const rows = Math.ceil(n / cols);
    const gridW = cols * TILE_W + (cols - 1) * GAP;
    const gridH = rows * TILE_H + (rows - 1) * GAP;
    const TOOLBAR_H = 42;
    const toolbarMinW = 340;
    return {
      w: Math.max(gridW, toolbarMinW) + PAD_X,
      h: PAD_Y + TOOLBAR_H + gridH + 14,
    };
  }

  /** overflow:hidden 상태에서 창이 이미 작으면 scrollHeight가 잘려 잡힘 → 내부 블록 rect로 측정 */
  function measurePipContentSize(doc) {
    const app = doc.getElementById('pipApp');
    if (!app) return { w: 0, h: 0 };
    const inner = app.querySelector('.pip-hunt') || app.querySelector('.pip-setup');
    let w = 0;
    let h = 0;
    if (inner) {
      const innerRect = inner.getBoundingClientRect();
      const cs = pipWindow.getComputedStyle(app);
      const pt = parseFloat(cs.paddingTop) || 0;
      const pb = parseFloat(cs.paddingBottom) || 0;
      const pl = parseFloat(cs.paddingLeft) || 0;
      const pr = parseFloat(cs.paddingRight) || 0;
      w = Math.ceil(innerRect.width + pl + pr);
      h = Math.ceil(innerRect.height + pt + pb);
    } else {
      w = Math.ceil(app.offsetWidth);
      h = Math.ceil(app.offsetHeight);
    }
    const cta = app.querySelector('.pip-cta');
    if (cta) {
      const ctaRect = cta.getBoundingClientRect();
      const appTop = app.getBoundingClientRect().top;
      const needH = Math.ceil(ctaRect.bottom - appTop + (parseFloat(pipWindow.getComputedStyle(app).paddingBottom) || 0));
      h = Math.max(h, needH);
    }
    return { w, h };
  }

  function resizePipWindowToFit() {
    if (!pipWindow || pipWindow.closed) return;
    const doc = pipWindow.document;
    const target = computePipTargetSize();
    const app = doc.getElementById('pipApp');
    const content = measurePipContentSize(doc);
    const measuredW = Math.ceil(Math.max(
      target.w,
      content.w,
      app ? app.scrollWidth : 0
    ));
    const measuredH = Math.ceil(Math.max(
      target.h,
      content.h,
      app ? app.scrollHeight : 0
    ));
    const w = Math.min(620, Math.max(280, measuredW + 20));
    const h = Math.min(920, Math.max(220, measuredH + 40));
    try {
      if (typeof pipWindow.resizeTo === 'function') {
        pipWindow.resizeTo(w, h);
      }
    } catch (e) { /* ignore */ }
    doc.documentElement.style.overflow = 'hidden';
    doc.body.style.overflow = 'hidden';
  }

  function applyPipWindowSize() {
    if (!pipWindow || pipWindow.closed) return;
    const doc = pipWindow.document;
    const run = () => resizePipWindowToFit();
    requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });
    setTimeout(run, 60);
    setTimeout(run, 180);
  }

  function schedulePipResizeAfterImages(root) {
    if (!root) return;
    root.querySelectorAll('img').forEach((img) => {
      if (img.complete) return;
      img.addEventListener('load', () => applyPipWindowSize(), { once: true });
      img.addEventListener('error', () => applyPipWindowSize(), { once: true });
    });
  }

  function pipToolbarHtml() {
    return `
      <header class="pip-toolbar">
        <div class="pip-toolbar-left">
          <button type="button" class="pip-tb-btn pip-tb-play" data-pip-act="play" title="전체 재개">▶</button>
          <button type="button" class="pip-tb-btn pip-tb-pause" data-pip-act="pause-all" title="전체 일시정지">⏸</button>
          <button type="button" class="pip-tb-btn pip-tb-reset" data-pip-act="reset-all" title="전체 설정 시간으로">↺</button>
          <button type="button" class="pip-tb-btn pip-tb-mute${pipUi.muted ? ' is-muted' : ''}" data-pip-act="mute" title="알림음">${pipUi.muted ? '🔇' : '🔊'}</button>
        </div>
        <button type="button" class="pip-toolbar-end" data-pip-act="hunt-end">사냥 종료</button>
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
      </div>
    `;
  }

  function pipSetupSlotHtml(slot) {
    const icon = slot.icon
      ? `<img class="pip-setup-icon" src="${assetUrl(slot.icon)}" alt="" draggable="false">`
      : '';
    const isFreeLabel = slot.id === 'slot-consume' || BUILTIN_SLOT_DEFAULTS[slot.id]?.freeLabel;
    const nameHtml = isFreeLabel
      ? `<input type="text" class="pip-setup-slot-name-input" value="${escapeAttr(slot.label)}" data-pip-field="label" maxlength="24" placeholder="기타" aria-label="슬롯 이름">`
      : `<span class="pip-setup-slot-name">${escapeHtml(slot.label)}</span>`;
    const unit = slotDurationUnit(slot);
    return `
      <div class="pip-setup-slot" data-slot-id="${slot.id}">
        <div class="pip-setup-slot-head">
          <span class="pip-setup-slot-title">${icon}${nameHtml}</span>
          <label class="pip-setup-use"><input type="checkbox" data-pip-field="enabled" ${slot.enabled ? 'checked' : ''}><span>사용</span></label>
        </div>
        <div class="pip-setup-slot-time">
          <input type="number" class="pip-setup-dur" min="1" max="${slotInputMax(slot)}" value="${slotInputValue(slot)}" data-pip-field="dur">
          <span class="pip-unit-toggle" role="group" aria-label="시간 단위">
            <button type="button" class="pip-unit-btn${unit === 'sec' ? ' is-on' : ''}" data-pip-act="unit-sec">초</button>
            <button type="button" class="pip-unit-btn${unit === 'min' ? ' is-on' : ''}" data-pip-act="unit-min">분</button>
          </span>
        </div>
      </div>
    `;
  }

  function pipSetupViewHtml() {
    const preset = getActivePreset();
    const slotRows = preset.slots.map((slot) => pipSetupSlotHtml(slot)).join('');

    return `
      <div class="pip-setup">
        <p class="pip-setup-notice" id="pipSetupNotice" hidden></p>
        <div class="pip-setup-block">
          <div class="pip-setup-label">사냥터</div>
          <div class="pip-setup-presets">
            <div class="pip-preset-row">
              <select id="pipPresetSelect" data-pip-field="preset" aria-label="프리셋"></select>
              <input type="text" id="pipPresetName" value="${preset.name}" placeholder="사냥터 이름" data-pip-field="preset-name">
            </div>
            <div class="pip-preset-actions">
              <button type="button" class="pip-setup-mini" data-pip-act="preset-save">저장</button>
              <button type="button" class="pip-setup-mini" data-pip-act="preset-add">추가</button>
              <button type="button" class="pip-setup-mini pip-setup-mini--danger" data-pip-act="preset-del">삭제</button>
            </div>
          </div>
        </div>
        <div class="pip-setup-block">
          <div class="pip-setup-label">버프 · 시간</div>
          <div class="pip-setup-slots">${slotRows}</div>
        </div>
        <button type="button" class="pip-cta pip-cta-start" data-pip-act="hunt-start">사냥 시작</button>
      </div>
    `;
  }

  function renderPipView() {
    if (!pipWindow || pipWindow.closed) return;
    const doc = pipWindow.document;
    injectPipStyles(doc);
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
    if (!hunt) setPipSetupNotice(pipUi.notice);
    if (hunt) {
      updatePipDisplay();
      warmAllAlarmAudiosInPip();
    }
    schedulePipResizeAfterImages(app);
    applyPipWindowSize();
    syncHuntRuntimeTick();
  }

  function bindPipEvents(app) {
    if (!pipClickBound) {
      pipClickBound = true;
    }
    app.onclick = (e) => {
      const btn = e.target.closest('[data-pip-act]');
      if (btn && btn.dataset.pipAct !== 'noop') {
        const setupSlot = btn.closest('.pip-setup-slot');
        const slotId = btn.closest('.pip-tile')?.dataset.slotId
          || setupSlot?.dataset.slotId
          || null;
        handlePipAction(btn.dataset.pipAct, slotId);
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
      if (t.dataset.pipField === 'dur') {
        applySlotDurationInput(slot, t.value);
        t.value = String(slotInputValue(slot));
        if (!partyTimer().runtime.huntActive) {
          partyTimer().runtime.slotRemaining[slotId] = slot.durationSec * 1000;
        }
      } else if (t.dataset.pipField === 'enabled') {
        slot.enabled = t.checked;
        if (!partyTimer().runtime.huntActive) renderPipView();
        return;
      } else if (t.dataset.pipField === 'label') {
        slot.label = String(t.value || '').trim() || '기타';
        t.value = slot.label;
      }
      bumpRuntimeRev();
      scheduleSave();
      applyPipWindowSize();
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
      if (pt.presets.length <= 1) {
        setPipSetupNotice('마지막 사냥터는 삭제할 수 없어요.');
        return;
      }
      setPipSetupNotice('');
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
    } else if (act === 'unit-sec' && slotId) {
      const slot = findSlot(slotId);
      if (!slot) return;
      slot.durationUnit = 'sec';
      bumpRuntimeRev();
      scheduleSave();
      renderPipView();
    } else if (act === 'unit-min' && slotId) {
      const slot = findSlot(slotId);
      if (!slot) return;
      slot.durationUnit = 'min';
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

  function playFallbackBeep(doc, volume, onDone) {
    const done = typeof onDone === 'function' ? onDone : () => {};
    try {
      const Ctx = doc.defaultView.AudioContext || doc.defaultView.webkitAudioContext;
      if (!Ctx) { done(); return; }
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.15 * Math.max(0, Math.min(1, volume));
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      setTimeout(() => {
        try { osc.stop(); ctx.close(); } catch (e) { /* ignore */ }
        done();
      }, 280);
    } catch (e) {
      done();
    }
  }

  function trackSlotAudio(slotId, handle) {
    if (!slotActiveAudios[slotId]) slotActiveAudios[slotId] = new Set();
    slotActiveAudios[slotId].add(handle);
  }

  /** 1회 재생 · 파일 있으면 **비프 fallback 없음** (겹침 방지) */
  function playAlarmOneShot(doc, slotId, profile, volume, onDone) {
    const done = typeof onDone === 'function' ? onDone : () => {};
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      done();
    };
    const vol = Math.max(0, Math.min(1, volume));
    if (!profile || !profile.src) {
      playFallbackBeep(doc, vol, finish);
      return;
    }
    const watchdog = setTimeout(finish, 45000);
    const wrapFinish = () => {
      clearTimeout(watchdog);
      finish();
    };
    ensureWarmAlarmAudio(doc, slotId, profile);
    try {
      const audio = new doc.defaultView.Audio(profile.src);
      audio.preload = 'auto';
      audio.volume = vol;
      trackSlotAudio(slotId, audio);
      audio.onended = wrapFinish;
      audio.onerror = wrapFinish;
      const untrack = () => {
        const set = slotActiveAudios[slotId];
        if (set) set.delete(audio);
      };
      audio.addEventListener('ended', untrack, { once: true });
      audio.addEventListener('error', untrack, { once: true });
      const p = audio.play();
      if (p && typeof p.catch === 'function') p.catch(wrapFinish);
    } catch (e) {
      finish();
    }
  }

  function runAlarmRepeatSequence(doc, slotId, profile, repeatCount, gen, onComplete) {
    const repeat = Math.max(1, Math.min(20, Math.round(Number(repeatCount) || 1)));
    const gapMs = 280;
    let index = 0;

    function isStale() {
      return slotAlarmGen[slotId] !== gen
        || pipUi.muted
        || !pipWindow
        || pipWindow.closed;
    }

    function next() {
      if (isStale()) {
        if (typeof onComplete === 'function') onComplete();
        return;
      }
      if (index >= repeat) {
        if (typeof onComplete === 'function') onComplete();
        return;
      }
      index += 1;
      playAlarmOneShot(doc, slotId, profile, profile.volume, () => {
        if (isStale()) {
          if (typeof onComplete === 'function') onComplete();
          return;
        }
        if (index >= repeat) {
          if (typeof onComplete === 'function') onComplete();
          return;
        }
        setTimeout(next, gapMs);
      });
    }
    next();
  }

  function playPipAlarmForSlot(slotId) {
    if (pipUi.muted || !pipWindow || pipWindow.closed) return;
    stopSlotAudios(slotId);
    slotAlarmGen[slotId] = (slotAlarmGen[slotId] || 0) + 1;
    const gen = slotAlarmGen[slotId];
    const profile = getSoundProfile(slotId);
    const doc = pipWindow.document;
    runAlarmRepeatSequence(doc, slotId, profile, profile.repeatCount, gen, () => {});
    flashPipTileAlarm(slotId);
  }

  function previewAlarmSound(slotId, usePipWindow, patch) {
    const profile = normalizeSoundProfile({ ...getSoundProfile(slotId), ...(patch || {}) });
    const doc = usePipWindow && pipWindow && !pipWindow.closed ? pipWindow.document : document;
    const previewSlot = `preview-${slotId}`;
    slotAlarmGen[previewSlot] = (slotAlarmGen[previewSlot] || 0) + 1;
    const gen = slotAlarmGen[previewSlot];
    runAlarmRepeatSequence(doc, previewSlot, profile, profile.repeatCount, gen, () => {});
  }

  function flashPipTileAlarm(slotId) {
    if (!pipWindow || pipWindow.closed) return;
    const tile = pipWindow.document.querySelector(`.pip-tile[data-slot-id="${slotId}"]`);
    if (tile) {
      tile.classList.add('is-alarm');
      setTimeout(() => tile.classList.remove('is-alarm'), 2000);
    }
  }

  function clearSlotEndTimer(slotId) {
    if (slotEndTimers[slotId] != null) {
      clearTimeout(slotEndTimers[slotId]);
      delete slotEndTimers[slotId];
    }
  }

  function clearAllSlotEndTimers() {
    Object.keys(slotEndTimers).forEach((id) => clearSlotEndTimer(id));
  }

  function handleSlotExpired(slotId, now) {
    const rt = partyTimer().runtime;
    if (!rt.huntActive) return;
    const slot = findSlot(slotId);
    if (!slot || !slot.enabled) return;
    if (rt.slotPaused[slotId]) return;
    const endsAt = rt.slotEndsAt[slotId];
    if (endsAt == null) return;
    now = now != null ? now : Date.now();
    if (endsAt > now) {
      scheduleSlotExpiryAlarm(slotId);
      return;
    }
    const cycleKey = String(endsAt);
    if (slotAlarmFired[slotId] !== cycleKey) {
      slotAlarmFired[slotId] = cycleKey;
      playPipAlarmForSlot(slotId);
    }
    const cycleMs = slotCycleMs(slot);
    rt.slotRemaining[slotId] = cycleMs;
    rt.slotEndsAt[slotId] = now + cycleMs;
    bumpRuntimeRev();
    scheduleSave();
    scheduleSlotExpiryAlarm(slotId);
    if (pipWindow && !pipWindow.closed) updatePipDisplay();
  }

  function scheduleSlotExpiryAlarm(slotId) {
    clearSlotEndTimer(slotId);
    const rt = partyTimer().runtime;
    if (!rt.huntActive) return;
    const slot = findSlot(slotId);
    if (!slot || !slot.enabled) return;
    if (rt.slotPaused[slotId]) return;
    const endsAt = rt.slotEndsAt[slotId];
    if (endsAt == null) return;
    const delay = endsAt - Date.now();
    if (delay <= 0) {
      handleSlotExpired(slotId, Date.now());
      return;
    }
    slotEndTimers[slotId] = setTimeout(() => {
      delete slotEndTimers[slotId];
      handleSlotExpired(slotId, Date.now());
    }, delay);
  }

  function resyncAllSlotExpiryAlarms() {
    clearAllSlotEndTimers();
    if (!partyTimer().runtime.huntActive) return;
    enabledSlots().forEach((s) => scheduleSlotExpiryAlarm(s.id));
  }

  /** tick 백업 · setTimeout 누락 시 */
  function processSlotTimerLoops(now) {
    const rt = partyTimer().runtime;
    if (!rt.huntActive) return;
    enabledSlots().forEach((slot) => {
      if (rt.slotPaused[slot.id]) return;
      const endsAt = rt.slotEndsAt[slot.id];
      if (endsAt == null) return;
      if (endsAt > now) {
        delete slotAlarmFired[slot.id];
        return;
      }
      handleSlotExpired(slot.id, now);
    });
  }

  function stopHuntRuntimeTick() {
    if (huntRuntimeTickId) {
      clearInterval(huntRuntimeTickId);
      huntRuntimeTickId = null;
    }
  }

  function huntRuntimeTickStep() {
    if (!partyTimer().runtime.huntActive) {
      stopHuntRuntimeTick();
      return;
    }
    const now = Date.now();
    processSlotTimerLoops(now);
    syncRuntimeRemainingFromEndsAt(now);
    if (pipWindow && !pipWindow.closed) updatePipDisplay();
  }

  function syncHuntRuntimeTick() {
    stopHuntRuntimeTick();
    if (!partyTimer().runtime.huntActive) return;
    huntRuntimeTickId = setInterval(huntRuntimeTickStep, HUNT_RUNTIME_TICK_MS);
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
      const { w: initW, h: initH } = computePipTargetSize();
      pipWindow = await global.documentPictureInPicture.requestWindow({
        width: Math.min(620, initW),
        height: Math.min(900, initH),
      });
      pipClickBound = false;
      if (!pipWindow.document.head) {
        pipWindow.document.documentElement.insertBefore(pipWindow.document.createElement('head'), pipWindow.document.body);
      }
      injectPipStyles(pipWindow.document);
      pipWindow.document.title = '퉁공대 타이머';
      pipWindow.document.body.className = 'pip-root';
      pipWindow.document.body.innerHTML = '<div id="pipApp" class="pip-app"></div>';
      pipWindow.addEventListener('pagehide', () => {
        pipWindow = null;
        clearSlotAudioWarm();
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
    resyncAllSlotExpiryAlarms();
    updatePipDisplay();
  }

  function resetSlot(slotId) {
    const rt = partyTimer().runtime;
    const slot = findSlot(slotId);
    if (!slot) return;
    const rem = slotCycleMs(slot);
    rt.slotRemaining[slotId] = rem;
    delete rt.slotPaused[slotId];
    delete slotAlarmFired[slotId];
    if (rt.huntActive) rt.slotEndsAt[slotId] = Date.now() + rem;
    else delete rt.slotEndsAt[slotId];
    bumpRuntimeRev();
    scheduleSave();
    if (rt.huntActive) scheduleSlotExpiryAlarm(slotId);
    else clearSlotEndTimer(slotId);
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
    resyncAllSlotExpiryAlarms();
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
    resyncAllSlotExpiryAlarms();
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
    stopAllSlotAudios();
    clearSlotAudioWarm();
    clearAllSlotEndTimers();
    scheduleSave();
    renderPipView();
    resyncAllSlotExpiryAlarms();
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
    stopAllSlotAudios();
    clearSlotAudioWarm();
    clearAllSlotEndTimers();
    stopHuntRuntimeTick();
    scheduleSave();
    renderPipView();
  }

  function openFromUserGesture() {
    void openPip();
  }

  function onRemoteStateApplied() {
    ensurePartyTimerState();
    syncHuntRuntimeTick();
    if (pipWindow && !pipWindow.closed) {
      renderPipView();
      if (partyTimer().runtime.huntActive) {
        warmAllAlarmAudiosInPip();
        resyncAllSlotExpiryAlarms();
      }
    }
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

  function getTimerSoundSlotDefs() {
    return TIMER_SOUND_SLOT_IDS.map((id) => ({
      id,
      label: (BUILTIN_SLOT_DEFAULTS[id] && BUILTIN_SLOT_DEFAULTS[id].label) || id,
    }));
  }

  global.PartyTimerApp = {
    init,
    ensurePartyTimerState,
    normalizePartyTimer,
    openFromUserGesture,
    openPip,
    onRemoteStateApplied,
    isPipOpen: () => pipWindow && !pipWindow.closed,
    getTimerSoundSlotDefs,
    getSoundProfile,
    updateSoundProfile,
    previewAlarmSound,
    TIMER_SOUND_MAX_BYTES: 900 * 1024,
  };
})(typeof window !== 'undefined' ? window : globalThis);
