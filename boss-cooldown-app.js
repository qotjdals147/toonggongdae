/**
 * 보스 쿨타임 — 공대 state.bossCooldown · endsAt 기준 실시간(꺼져도 경과)
 */
(function (global) {
  let $ = (id) => document.getElementById(id);
  let genId = () => String(Date.now());
  let getState = () => ({ bossCooldown: null, members: [] });
  let scheduleSave = () => {};
  let getAuthSession = () => null;
  let assetUrl = (relativePath) => String(relativePath || '');

  const MS_DAY = 86400000;
  const MS_WEEK = 7 * MS_DAY;
  const MASTER_IDX = 2;
  const TICK_MS = 1000;

  const BOSS_DEFS = [
    {
      id: 'pianus',
      label: '피아누스',
      badge: '주간 1트',
      durationMs: MS_WEEK,
      image: 'image/몬스터/피아누스(좌붕).png',
      hint: '클리어(또는 역습 클리어) 시각 기준 7일 · 꼬리비늘 퀘 완료 여부에 따라 수령 NPC가 달라져요.',
      pianus: true,
    },
    {
      id: 'papulatus',
      label: '파풀라투스',
      badge: '일간 2트',
      durationMs: MS_DAY,
      image: 'image/몬스터/파풀라투스.png',
      hint: '균열 조각 무료 지급 NPC · 퀘스트 완료 시각부터 24h (일 2회 입장은 게임 00시 초기화).',
    },
    {
      id: 'zakumNormal',
      label: '자쿰 노말',
      badge: '일 2트',
      durationMs: MS_DAY,
      image: 'image/몬스터/자쿰.gif',
      hint: '24h 쿨은 1트 입장 시각만 · 2트는 같은 날 가능(2트 입장은 쿨 재시작 안 함).',
    },
    {
      id: 'zakumChaos',
      label: '자쿰 카오스',
      badge: '주간 1트',
      durationMs: MS_WEEK,
      image: 'image/몬스터/자쿰.gif',
      hint: '1트 입장 시각 기준 7일.',
    },
    {
      id: 'horntailNormal',
      label: '혼테일 노말',
      badge: '일 1트',
      durationMs: MS_DAY,
      image: 'image/몬스터/혼테일.gif',
      hint: '입장 시각 기준 24h.',
    },
  ];

  const BOSS_IDS = BOSS_DEFS.map((b) => b.id);

  let tickId = null;
  let activeBossId = BOSS_DEFS[0].id;
  let mounted = false;

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function memberDisplayName(memberIdx) {
    const st = getState();
    const n = Number(memberIdx);
    if (st.members && st.members[n]) return String(st.members[n]).trim() || `슬롯${n + 1}`;
    return ['순퉁', '지퉁', '배퉁'][n] || `슬롯${n + 1}`;
  }

  function emptyBossEntries() {
    const entries = {};
    BOSS_IDS.forEach((id) => {
      entries[id] = [];
    });
    return entries;
  }

  function normalizeEntry(raw, bossId) {
    const def = BOSS_DEFS.find((b) => b.id === bossId);
    const e = raw && typeof raw === 'object' ? raw : {};
    const memberIdx = Math.min(2, Math.max(0, Number(e.memberIdx) || 0));
    const charName = String(e.charName || '').trim().slice(0, 32);
    if (!charName) return null;
    const out = {
      id: e.id ? String(e.id) : genId(),
      memberIdx,
      charName,
      endsAt: e.endsAt != null && Number.isFinite(Number(e.endsAt)) ? Number(e.endsAt) : null,
      pausedRemainingMs:
        e.pausedRemainingMs != null && Number.isFinite(Number(e.pausedRemainingMs))
          ? Math.max(0, Number(e.pausedRemainingMs))
          : null,
    };
    if (def && def.pianus) out.tailQuestDone = !!e.tailQuestDone;
    if (out.endsAt != null && out.pausedRemainingMs != null) out.pausedRemainingMs = null;
    return out;
  }

  function normalizeBossCooldown(raw) {
    const base = { entries: emptyBossEntries() };
    if (!raw || typeof raw !== 'object') return base;
    const src = raw.entries && typeof raw.entries === 'object' ? raw.entries : raw;
    BOSS_IDS.forEach((bossId) => {
      const list = Array.isArray(src[bossId]) ? src[bossId] : [];
      base.entries[bossId] = list
        .map((row) => normalizeEntry(row, bossId))
        .filter(Boolean);
    });
    return base;
  }

  function entryTimerScore(entry) {
    if (!entry) return -1;
    if (entry.endsAt != null && Number.isFinite(Number(entry.endsAt))) return Number(entry.endsAt);
    if (entry.pausedRemainingMs != null) return Date.now() + Number(entry.pausedRemainingMs);
    return 0;
  }

  /** Realtime·저장 경합 시 돌아가던 타이머(endsAt)가 idle JSON에 덮이지 않게 */
  function pickMergedEntry(a, b) {
    if (!a) return b;
    if (!b) return a;
    const sa = entryTimerScore(a);
    const sb = entryTimerScore(b);
    if (sa === sb) return b;
    return sb > sa ? b : a;
  }

  function mergeBossCooldown(prevRaw, nextRaw) {
    const prev = normalizeBossCooldown(prevRaw);
    const next = normalizeBossCooldown(nextRaw);
    const merged = { entries: emptyBossEntries() };
    BOSS_IDS.forEach((bossId) => {
      const byId = new Map();
      prev.entries[bossId].forEach((e) => byId.set(e.id, e));
      next.entries[bossId].forEach((e) => {
        const existing = byId.get(e.id);
        byId.set(e.id, pickMergedEntry(existing, e));
      });
      merged.entries[bossId] = [...byId.values()];
    });
    return merged;
  }

  function ensureBossCooldownState() {
    const st = getState();
    if (!st.bossCooldown || typeof st.bossCooldown !== 'object') {
      st.bossCooldown = normalizeBossCooldown(null);
    } else {
      st.bossCooldown = normalizeBossCooldown(st.bossCooldown);
    }
    return st.bossCooldown;
  }

  function entriesForBoss(bossId) {
    const bc = ensureBossCooldownState();
    if (!bc.entries[bossId]) bc.entries[bossId] = [];
    return bc.entries[bossId];
  }

  function findEntry(bossId, entryId) {
    return entriesForBoss(bossId).find((x) => x.id === entryId) || null;
  }

  function canEditMember(memberIdx) {
    const session = getAuthSession();
    if (!session) return false;
    const mi = Number(session.memberIdx);
    return mi === Number(memberIdx) || mi === MASTER_IDX;
  }

  function remainingMs(entry) {
    if (!entry) return 0;
    if (entry.pausedRemainingMs != null) return entry.pausedRemainingMs;
    if (entry.endsAt != null) return Math.max(0, entry.endsAt - Date.now());
    return 0;
  }

  function timerPhase(entry) {
    if (entry.pausedRemainingMs != null && entry.endsAt == null) return 'paused';
    if (entry.endsAt != null) {
      if (entry.endsAt - Date.now() > 0) return 'running';
      return 'ready';
    }
    return 'idle';
  }

  function formatDuration(ms) {
    const totalSec = Math.ceil(Math.max(0, ms) / 1000);
    const d = Math.floor(totalSec / 86400);
    const h = Math.floor((totalSec % 86400) / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n) => String(n).padStart(2, '0');
    if (d > 0) return `${d}일 ${pad(h)}:${pad(m)}:${pad(s)}`;
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  function toDatetimeLocalValue(ms) {
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function defaultManualCompleteValue(entry, bossDef) {
    if (entry.endsAt != null && bossDef.durationMs) {
      const started = entry.endsAt - bossDef.durationMs;
      if (started > 0) return toDatetimeLocalValue(started);
    }
    return toDatetimeLocalValue(Date.now());
  }

  function pianusNpcHint(entry) {
    return entry.tailQuestDone
      ? '다음 주기 수령: 켄타 (꼬리비늘·역습 완료)'
      : '다음 주기 수령: 탐사대장 팽 (꼬리비늘 미완)';
  }

  function sortEntries(list) {
    return list.slice().sort((a, b) => {
      const ma = memberDisplayName(a.memberIdx).localeCompare(memberDisplayName(b.memberIdx), 'ko');
      if (ma !== 0) return ma;
      return a.charName.localeCompare(b.charName, 'ko');
    });
  }

  function startCooldown(bossId, entryId) {
    const def = BOSS_DEFS.find((b) => b.id === bossId);
    const entry = findEntry(bossId, entryId);
    if (!def || !entry || !canEditMember(entry.memberIdx)) return;
    entry.endsAt = Date.now() + def.durationMs;
    entry.pausedRemainingMs = null;
    scheduleSave();
    render();
  }

  function pauseCooldown(bossId, entryId) {
    const entry = findEntry(bossId, entryId);
    if (!entry || !canEditMember(entry.memberIdx)) return;
    if (entry.endsAt == null) return;
    const rem = Math.max(0, entry.endsAt - Date.now());
    entry.pausedRemainingMs = rem;
    entry.endsAt = null;
    scheduleSave();
    render();
  }

  function resumeCooldown(bossId, entryId) {
    const entry = findEntry(bossId, entryId);
    if (!entry || !canEditMember(entry.memberIdx)) return;
    if (entry.pausedRemainingMs == null) return;
    entry.endsAt = Date.now() + entry.pausedRemainingMs;
    entry.pausedRemainingMs = null;
    scheduleSave();
    render();
  }

  function resetCooldown(bossId, entryId) {
    const entry = findEntry(bossId, entryId);
    if (!entry || !canEditMember(entry.memberIdx)) return;
    entry.endsAt = null;
    entry.pausedRemainingMs = null;
    scheduleSave();
    render();
  }

  function deleteEntry(bossId, entryId) {
    const list = entriesForBoss(bossId);
    const entry = findEntry(bossId, entryId);
    if (!entry || !canEditMember(entry.memberIdx)) return;
    const idx = list.findIndex((x) => x.id === entryId);
    if (idx >= 0) list.splice(idx, 1);
    scheduleSave();
    render();
  }

  function addCharacter(bossId) {
    const session = getAuthSession();
    if (!session) return;
    const pick = $(`bossCdAddMember-${bossId}`);
    let memberIdx = Number(session.memberIdx);
    if (session.memberIdx === MASTER_IDX && pick) {
      memberIdx = Math.min(2, Math.max(0, Number(pick.value) || 0));
    }
    const nameInput = $(`bossCdAddName-${bossId}`);
    const charName = nameInput ? String(nameInput.value || '').trim().slice(0, 32) : '';
    if (!charName) {
      if (nameInput) nameInput.focus();
      return;
    }
    const entry = normalizeEntry({ id: genId(), memberIdx, charName }, bossId);
    if (!entry) return;
    entriesForBoss(bossId).push(entry);
    if (nameInput) nameInput.value = '';
    scheduleSave();
    render();
  }

  function setTailQuestDone(bossId, entryId, checked) {
    const entry = findEntry(bossId, entryId);
    if (!entry || !canEditMember(entry.memberIdx)) return;
    entry.tailQuestDone = !!checked;
    scheduleSave();
    render();
  }

  function applyManualCompleteTime(bossId, entryId) {
    const def = BOSS_DEFS.find((b) => b.id === bossId);
    const entry = findEntry(bossId, entryId);
    if (!def || !entry || !canEditMember(entry.memberIdx)) return;
    const input = document.querySelector(
      `input[data-boss-manual-time="${bossId}"][data-entry-id="${entryId}"]`
    );
    if (!input || !input.value) {
      if (input) input.focus();
      return;
    }
    const started = new Date(input.value).getTime();
    if (!Number.isFinite(started)) {
      alert('완료 시각 형식을 확인해 주세요.');
      return;
    }
    entry.endsAt = started + def.durationMs;
    entry.pausedRemainingMs = null;
    scheduleSave();
    render(true);
  }

  function statusMetaForEntry(entry) {
    const phase = timerPhase(entry);
    const rem = remainingMs(entry);
    let statusClass = 'boss-cd-status--idle';
    let statusText = '쿨 없음 · 시작 누르면 돌아가요';
    if (phase === 'running') {
      statusClass = 'boss-cd-status--run';
      statusText = formatDuration(rem);
    } else if (phase === 'paused') {
      statusClass = 'boss-cd-status--pause';
      statusText = `일시정지 ${formatDuration(rem)}`;
    } else if (phase === 'ready') {
      statusClass = 'boss-cd-status--ready';
      statusText = '입장 가능';
    }
    return { phase, statusClass, statusText };
  }

  function isAddFieldFocused() {
    const root = $('bossCooldownApp');
    if (!root) return false;
    const active = document.activeElement;
    if (!active || !root.contains(active)) return false;
    const tag = active.tagName;
    return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
  }

  function updateTimers() {
    const root = $('bossCooldownApp');
    if (!root || !root.querySelector('.boss-cd-tabs')) return;
    BOSS_DEFS.forEach((bossDef) => {
      const badge = root.querySelector(`[data-boss-tab="${bossDef.id}"] .boss-cd-tab-badge`);
      if (badge) badge.textContent = String(entriesForBoss(bossDef.id).length);
      entriesForBoss(bossDef.id).forEach((entry) => {
        const card = root.querySelector(`.boss-cd-card[data-entry-id="${entry.id}"]`);
        if (!card) return;
        const { statusClass, statusText } = statusMetaForEntry(entry);
        const statusEl = card.querySelector('.boss-cd-status');
        if (statusEl) {
          statusEl.textContent = statusText;
          statusEl.className = `boss-cd-status ${statusClass}`;
        }
      });
    });
  }

  function cardHtml(bossDef, entry) {
    const label = `${memberDisplayName(entry.memberIdx)}-${entry.charName}`;
    const { statusClass, statusText } = statusMetaForEntry(entry);

    const editable = canEditMember(entry.memberIdx);

    let pianusBlock = '';
    if (bossDef.pianus) {
      pianusBlock = `
        <label class="boss-cd-flag${editable ? '' : ' boss-cd-flag--readonly'}">
          <input type="checkbox" data-boss-tail="${bossDef.id}" data-entry-id="${escapeHtml(entry.id)}" ${entry.tailQuestDone ? 'checked' : ''} ${editable ? '' : 'disabled'}>
          <span>꼬리비늘 퀘스트 완료 (이후 켄타 루트)</span>
        </label>
        <p class="boss-cd-npc-hint">${escapeHtml(pianusNpcHint(entry))}</p>`;
    }

    const controls = editable
      ? `
      <div class="boss-cd-controls" role="group" aria-label="타이머 조작">
        <button type="button" class="boss-cd-ctl" data-act="play" data-boss="${bossDef.id}" data-id="${escapeHtml(entry.id)}" title="재생 / 재개" aria-label="재생">▶</button>
        <button type="button" class="boss-cd-ctl" data-act="pause" data-boss="${bossDef.id}" data-id="${escapeHtml(entry.id)}" title="일시정지" aria-label="일시정지">⏸</button>
        <button type="button" class="boss-cd-ctl" data-act="reset" data-boss="${bossDef.id}" data-id="${escapeHtml(entry.id)}" title="초기화" aria-label="초기화">↻</button>
      </div>
      <button type="button" class="btn-settle btn-sm boss-cd-start-btn" data-act="start" data-boss="${bossDef.id}" data-id="${escapeHtml(entry.id)}">쿨타임 시작</button>
      <button type="button" class="btn-linkish boss-cd-del" data-act="delete" data-boss="${bossDef.id}" data-id="${escapeHtml(entry.id)}">캐릭 삭제</button>
      <div class="boss-cd-manual-row">
        <label class="boss-cd-manual-label">
          <span class="boss-cd-manual-caption">클리어(완료) 시각</span>
          <input type="datetime-local" class="boss-cd-manual-input" data-boss-manual-time="${bossDef.id}" data-entry-id="${escapeHtml(entry.id)}" value="${escapeHtml(defaultManualCompleteValue(entry, bossDef))}">
        </label>
        <button type="button" class="btn-light btn-sm" data-act="manual-apply" data-boss="${bossDef.id}" data-id="${escapeHtml(entry.id)}">적용</button>
      </div>`
      : `<p class="boss-cd-readonly">다른 공대원 캐릭 · 보기만</p>`;

    return `
      <article class="boss-cd-card" data-entry-id="${escapeHtml(entry.id)}">
        <div class="boss-cd-card-head">
          <img class="boss-cd-card-icon" src="${escapeHtml(assetUrl(bossDef.image))}" alt="" width="44" height="44" decoding="async" draggable="false">
          <div class="boss-cd-card-title">
            <div class="boss-cd-char-label">${escapeHtml(label)}</div>
            <div class="boss-cd-status ${statusClass}">${escapeHtml(statusText)}</div>
          </div>
        </div>
        ${pianusBlock}
        ${controls}
      </article>`;
  }

  function panelHtml(bossDef) {
    const list = sortEntries(entriesForBoss(bossDef.id));
    const session = getAuthSession();
    const isMaster = session && session.memberIdx === MASTER_IDX;
    const cards = list.length
      ? list.map((e) => cardHtml(bossDef, e)).join('')
      : '<p class="boss-cd-empty">캐릭터를 추가하면 여기에 타이머가 생겨요.</p>';

    let memberPick = '';
    if (isMaster) {
      memberPick = `
        <label class="boss-cd-add-field">
          <span class="boss-cd-add-label">공대원</span>
          <select id="bossCdAddMember-${bossDef.id}">
            <option value="0">${escapeHtml(memberDisplayName(0))}</option>
            <option value="1">${escapeHtml(memberDisplayName(1))}</option>
            <option value="2">${escapeHtml(memberDisplayName(2))}</option>
          </select>
        </label>`;
    }

    const addBlock = session
      ? `
      <div class="boss-cd-add">
        ${memberPick}
        <label class="boss-cd-add-field boss-cd-add-field--grow">
          <span class="boss-cd-add-label">캐릭 닉네임</span>
          <input type="text" id="bossCdAddName-${bossDef.id}" placeholder="예: LeoSooN" maxlength="32" autocomplete="off">
        </label>
        <button type="button" class="btn-settle btn-sm" data-boss-add="${bossDef.id}">추가</button>
      </div>`
      : '';

    return `
      <div class="boss-cd-panel" id="bossCdPanel-${bossDef.id}" data-boss-panel="${bossDef.id}" ${bossDef.id === activeBossId ? '' : 'hidden'}>
        <p class="boss-cd-hint">${escapeHtml(bossDef.hint)}</p>
        <div class="boss-cd-list">${cards}</div>
        ${addBlock}
      </div>`;
  }

  function render(force) {
    const root = $('bossCooldownApp');
    if (!root || !mounted) return;
    if (!force && isAddFieldFocused()) {
      updateTimers();
      return;
    }
    const tabs = BOSS_DEFS.map((b) => {
      const count = entriesForBoss(b.id).length;
      const active = b.id === activeBossId ? ' is-active' : '';
      return `<button type="button" class="mypage-tab${active}" data-boss-tab="${b.id}">${escapeHtml(b.label)} <span class="boss-cd-tab-badge">${count}</span></button>`;
    }).join('');
    const panels = BOSS_DEFS.map((b) => panelHtml(b)).join('');
    root.innerHTML = `
      <div class="boss-cd-tabs" role="tablist">${tabs}</div>
      ${panels}`;
  }

  function onRootClick(e) {
    const tab = e.target.closest('[data-boss-tab]');
    if (tab) {
      activeBossId = tab.dataset.bossTab;
      render(true);
      return;
    }
    const addBtn = e.target.closest('[data-boss-add]');
    if (addBtn) {
      addCharacter(addBtn.dataset.bossAdd);
      return;
    }
    const actBtn = e.target.closest('[data-act]');
    if (actBtn) {
      const { act, boss, id } = actBtn.dataset;
      if (act === 'start') startCooldown(boss, id);
      else if (act === 'play') {
        const entry = findEntry(boss, id);
        if (entry && entry.pausedRemainingMs != null) resumeCooldown(boss, id);
        else startCooldown(boss, id);
      } else if (act === 'pause') pauseCooldown(boss, id);
      else if (act === 'reset') resetCooldown(boss, id);
      else if (act === 'manual-apply') applyManualCompleteTime(boss, id);
      else if (act === 'delete') {
        if (confirm('이 캐릭터 타이머를 목록에서 삭제할까요?')) deleteEntry(boss, id);
      }
      return;
    }
    const tail = e.target.closest('input[data-boss-tail]');
    if (tail) {
      setTailQuestDone(tail.dataset.bossTail, tail.dataset.entryId, tail.checked);
    }
  }

  function startTick() {
    stopTick();
    tickId = setInterval(() => {
      if ($('bossCooldownModal') && !$('bossCooldownModal').hidden) updateTimers();
    }, TICK_MS);
  }

  function stopTick() {
    if (tickId) clearInterval(tickId);
    tickId = null;
  }

  function mountShell() {
    const root = $('bossCooldownApp');
    if (!root || mounted) return;
    mounted = true;
    root.addEventListener('click', onRootClick);
  }

  function openModal() {
    const session = getAuthSession();
    if (!session) {
      alert('클라우드 로그인 후 보스 쿨타임을 사용할 수 있어요.');
      return;
    }
    ensureBossCooldownState();
    mountShell();
    render();
    const modal = $('bossCooldownModal');
    if (modal) {
      modal.hidden = false;
      modal.setAttribute('aria-hidden', 'false');
    }
    startTick();
  }

  function closeModal() {
    stopTick();
    const modal = $('bossCooldownModal');
    if (modal) {
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  function renderIfOpen() {
    if ($('bossCooldownModal') && !$('bossCooldownModal').hidden) render(isAddFieldFocused() ? false : true);
  }

  function init(opts) {
    if (opts.$) $ = opts.$;
    if (opts.genId) genId = opts.genId;
    if (opts.getState) getState = opts.getState;
    if (opts.scheduleSave) scheduleSave = opts.scheduleSave;
    if (opts.getAuthSession) getAuthSession = opts.getAuthSession;
    if (opts.catalogAssetUrl) assetUrl = opts.catalogAssetUrl;
  }

  global.BossCooldownApp = {
    init,
    openModal,
    closeModal,
    renderIfOpen,
    normalizeBossCooldown,
    mergeBossCooldown,
    ensureBossCooldownState,
  };
})(typeof window !== 'undefined' ? window : globalThis);
