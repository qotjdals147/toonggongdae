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
  /** 로컬 편집 직후 index.html의 bossCooldownRemoteSnapshot 갱신 */
  let syncLocalSnapshot = () => {};
  let flushSave = () => {};
  /** 저장 완료 전 Realtime이 삭제·추가를 되돌리지 않게 */
  const pendingBossEntryDeletes = new Set();
  const pendingBossEntryAdds = new Set();

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
  /** 클리어 시각 입력 중 render로 value가 바뀌지 않게 */
  const manualTimeDrafts = {};

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
      completedAt:
        e.completedAt != null && Number.isFinite(Number(e.completedAt)) ? Number(e.completedAt) : null,
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

  function isTimerActive(entry) {
    return !!entry && (entry.endsAt != null || entry.pausedRemainingMs != null);
  }

  function isTimerFullyCleared(entry) {
    return (
      !!entry &&
      entry.endsAt == null &&
      entry.pausedRemainingMs == null &&
      entry.completedAt == null
    );
  }

  /** Realtime·저장 경합 — active 유지 vs 의도적 ↻(전 필드 null) 동기화 */
  function pickMergedEntry(a, b) {
    if (!a) return b;
    if (!b) return a;
    if (isTimerFullyCleared(b) && isTimerActive(a)) return b;
    if (isTimerFullyCleared(a) && isTimerActive(b)) return a;
    const sa = entryTimerScore(a);
    const sb = entryTimerScore(b);
    let picked = sb > sa ? b : sa > sb ? a : b;
    const other = picked === a ? b : a;
    if (picked.completedAt == null && other.completedAt != null) {
      picked = { ...picked, completedAt: other.completedAt };
    }
    return picked;
  }

  function mergeBossCooldown(prevRaw, nextRaw) {
    const prev = normalizeBossCooldown(prevRaw);
    const next = normalizeBossCooldown(nextRaw);
    const merged = { entries: emptyBossEntries() };
    BOSS_IDS.forEach((bossId) => {
      const prevById = new Map(prev.entries[bossId].map((e) => [e.id, e]));
      const nextFiltered = next.entries[bossId].filter((e) => !pendingBossEntryDeletes.has(e.id));
      merged.entries[bossId] = nextFiltered.map((e) => pickMergedEntry(prevById.get(e.id), e));
      const mergedIds = new Set(merged.entries[bossId].map((e) => e.id));
      prev.entries[bossId].forEach((e) => {
        if (!mergedIds.has(e.id) && pendingBossEntryAdds.has(e.id)) {
          merged.entries[bossId].push(e);
        }
      });
    });
    return merged;
  }

  function clearBossCooldownPendingSync() {
    pendingBossEntryDeletes.clear();
    pendingBossEntryAdds.clear();
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

  function manualTimeDraftKey(bossId, entryId) {
    return `${bossId}:${entryId}`;
  }

  function manualInputValue(bossId, entry) {
    const key = manualTimeDraftKey(bossId, entry.id);
    if (Object.prototype.hasOwnProperty.call(manualTimeDrafts, key)) {
      return manualTimeDrafts[key];
    }
    if (entry.completedAt != null) return toDatetimeLocalValue(entry.completedAt);
    return '';
  }

  function captureManualDraftsFromDom() {
    const root = $('bossCooldownApp');
    if (!root) return;
    root.querySelectorAll('input[data-boss-manual-time]').forEach((inp) => {
      const bossId = inp.dataset.bossManualTime;
      const entryId = inp.dataset.entryId;
      if (bossId && entryId) manualTimeDrafts[manualTimeDraftKey(bossId, entryId)] = inp.value;
    });
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

  function groupEntriesByMember(list) {
    const sorted = sortEntries(list);
    const groups = [];
    sorted.forEach((entry) => {
      const last = groups[groups.length - 1];
      if (!last || last.memberIdx !== entry.memberIdx) {
        groups.push({ memberIdx: entry.memberIdx, entries: [entry] });
      } else {
        last.entries.push(entry);
      }
    });
    return groups;
  }

  function startCooldown(bossId, entryId) {
    const def = BOSS_DEFS.find((b) => b.id === bossId);
    const entry = findEntry(bossId, entryId);
    if (!def || !entry || !canEditMember(entry.memberIdx)) return;
    const now = Date.now();
    entry.completedAt = now;
    entry.endsAt = now + def.durationMs;
    entry.pausedRemainingMs = null;
    delete manualTimeDrafts[manualTimeDraftKey(bossId, entryId)];
    syncLocalSnapshot();
    scheduleSave();
    render(true);
  }

  function pauseCooldown(bossId, entryId) {
    const entry = findEntry(bossId, entryId);
    if (!entry || !canEditMember(entry.memberIdx)) return;
    if (entry.endsAt == null) return;
    const rem = Math.max(0, entry.endsAt - Date.now());
    entry.pausedRemainingMs = rem;
    entry.endsAt = null;
    syncLocalSnapshot();
    scheduleSave();
    render();
  }

  function resumeCooldown(bossId, entryId) {
    const entry = findEntry(bossId, entryId);
    if (!entry || !canEditMember(entry.memberIdx)) return;
    if (entry.pausedRemainingMs == null) return;
    entry.endsAt = Date.now() + entry.pausedRemainingMs;
    entry.pausedRemainingMs = null;
    syncLocalSnapshot();
    scheduleSave();
    render();
  }

  function resetCooldown(bossId, entryId) {
    const entry = findEntry(bossId, entryId);
    if (!entry || !canEditMember(entry.memberIdx)) return;
    entry.endsAt = null;
    entry.completedAt = null;
    entry.pausedRemainingMs = null;
    delete manualTimeDrafts[manualTimeDraftKey(bossId, entryId)];
    syncLocalSnapshot();
    scheduleSave();
    render(true);
  }

  function deleteEntry(bossId, entryId) {
    const list = entriesForBoss(bossId);
    const entry = findEntry(bossId, entryId);
    if (!entry || !canEditMember(entry.memberIdx)) return;
    pendingBossEntryAdds.delete(entryId);
    pendingBossEntryDeletes.add(entryId);
    const idx = list.findIndex((x) => x.id === entryId);
    if (idx >= 0) list.splice(idx, 1);
    delete manualTimeDrafts[manualTimeDraftKey(bossId, entryId)];
    syncLocalSnapshot();
    render(true);
    flushSave();
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
    syncLocalSnapshot();
    scheduleSave();
    render();
  }

  function setTailQuestDone(bossId, entryId, checked) {
    const entry = findEntry(bossId, entryId);
    if (!entry || !canEditMember(entry.memberIdx)) return;
    entry.tailQuestDone = !!checked;
    syncLocalSnapshot();
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
    entry.completedAt = started;
    entry.endsAt = started + def.durationMs;
    entry.pausedRemainingMs = null;
    delete manualTimeDrafts[manualTimeDraftKey(bossId, entryId)];
    syncLocalSnapshot();
    scheduleSave();
    render(true);
  }

  function statusMetaForEntry(entry) {
    const phase = timerPhase(entry);
    const rem = remainingMs(entry);
    let phaseClass = 'boss-cd-phase--idle';
    let phaseText = '쿨 없음';
    let timerClass = 'boss-cd-timer--empty';
    let timerText = '';
    if (phase === 'running') {
      phaseText = '';
      phaseClass = 'boss-cd-phase--empty';
      timerClass = 'boss-cd-timer--run';
      timerText = formatDuration(rem);
    } else if (phase === 'paused') {
      phaseText = '⏸';
      phaseClass = 'boss-cd-phase--pause';
      timerClass = 'boss-cd-timer--pause';
      timerText = formatDuration(rem);
    } else if (phase === 'ready') {
      phaseText = '입장 가능';
      phaseClass = 'boss-cd-phase--ready';
    }
    return { phase, phaseClass, phaseText, timerClass, timerText };
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
        const card = root.querySelector(`.boss-cd-char-row[data-entry-id="${entry.id}"]`);
        if (!card) return;
        const { timerClass, timerText } = statusMetaForEntry(entry);
        const timerEl = card.querySelector('.boss-cd-timer');
        if (timerEl) {
          timerEl.textContent = timerText;
          timerEl.className = `boss-cd-timer ${timerClass}`;
        }
      });
    });
  }

  function charRowHtml(bossDef, entry) {
    const { phaseClass, phaseText, timerClass, timerText } = statusMetaForEntry(entry);
    const editable = canEditMember(entry.memberIdx);

    let pianusInline = '';
    if (bossDef.pianus) {
      pianusInline = `
        <label class="boss-cd-pianus-inline${editable ? '' : ' boss-cd-flag--readonly'}" title="${escapeHtml(pianusNpcHint(entry))}">
          <input type="checkbox" data-boss-tail="${bossDef.id}" data-entry-id="${escapeHtml(entry.id)}" ${entry.tailQuestDone ? 'checked' : ''} ${editable ? '' : 'disabled'}>
          <span>꼬리</span>
        </label>`;
    }

    const line = editable
      ? `
        <span class="boss-cd-char-name" title="캐릭">${escapeHtml(entry.charName)}</span>
        <div class="boss-cd-controls" role="group" aria-label="타이머">
          <button type="button" class="boss-cd-ctl" data-act="play" data-boss="${bossDef.id}" data-id="${escapeHtml(entry.id)}" title="재생" aria-label="재생">▶</button>
          <button type="button" class="boss-cd-ctl" data-act="pause" data-boss="${bossDef.id}" data-id="${escapeHtml(entry.id)}" title="일시정지" aria-label="일시정지">⏸</button>
          <button type="button" class="boss-cd-ctl" data-act="reset" data-boss="${bossDef.id}" data-id="${escapeHtml(entry.id)}" title="초기화" aria-label="초기화">↻</button>
        </div>
        <button type="button" class="btn-settle btn-sm boss-cd-start-btn" data-act="start" data-boss="${bossDef.id}" data-id="${escapeHtml(entry.id)}">시작</button>
        <span class="boss-cd-phase ${phaseClass}">${escapeHtml(phaseText)}</span>
        <input type="datetime-local" class="boss-cd-manual-input" data-boss-manual-time="${bossDef.id}" data-entry-id="${escapeHtml(entry.id)}" value="${escapeHtml(manualInputValue(bossDef.id, entry))}" aria-label="클리어 시각">
        <button type="button" class="btn-light btn-sm boss-cd-apply-btn" data-act="manual-apply" data-boss="${bossDef.id}" data-id="${escapeHtml(entry.id)}">적용</button>
        <span class="boss-cd-timer ${timerClass}">${escapeHtml(timerText)}</span>
        ${pianusInline}
        <button type="button" class="btn-linkish boss-cd-del" data-act="delete" data-boss="${bossDef.id}" data-id="${escapeHtml(entry.id)}">삭제</button>`
      : `
        <span class="boss-cd-char-name">${escapeHtml(entry.charName)}</span>
        <span class="boss-cd-phase ${phaseClass}">${escapeHtml(phaseText)}</span>
        <span class="boss-cd-timer ${timerClass}">${escapeHtml(timerText)}</span>`;

    return `
      <div class="boss-cd-char-row" data-entry-id="${escapeHtml(entry.id)}">
        <div class="boss-cd-char-line">${line}</div>
      </div>`;
  }

  function memberGroupHtml(bossDef, group) {
    const name = memberDisplayName(group.memberIdx);
    const count = group.entries.length;
    const rows = group.entries.map((e) => charRowHtml(bossDef, e)).join('');
    return `
      <section class="boss-cd-member-group" data-member-idx="${group.memberIdx}">
        <header class="boss-cd-member-head">
          <div class="boss-cd-member-title">
            <span class="boss-cd-member-name">${escapeHtml(name)}</span>
            <span class="boss-cd-member-count">캐릭 ${count}</span>
          </div>
        </header>
        <div class="boss-cd-char-rows">${rows}</div>
      </section>`;
  }

  function addFormHtml(bossDef) {
    const session = getAuthSession();
    if (!session) return '';
    const isMaster = session.memberIdx === MASTER_IDX;
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
    return `
      <div class="boss-cd-add" data-boss-add-panel="${bossDef.id}">
        ${memberPick}
        <label class="boss-cd-add-field boss-cd-add-field--grow">
          <span class="boss-cd-add-label">캐릭 닉네임</span>
          <input type="text" id="bossCdAddName-${bossDef.id}" placeholder="예: LeoSooN" maxlength="32" autocomplete="off">
        </label>
        <button type="button" class="btn-settle btn-sm" data-boss-add="${bossDef.id}">추가</button>
      </div>`;
  }

  function panelHtml(bossDef) {
    const list = entriesForBoss(bossDef.id);
    const groups = groupEntriesByMember(list);
    const cards = groups.length
      ? groups.map((g) => memberGroupHtml(bossDef, g)).join('')
      : '<p class="boss-cd-empty">캐릭터를 추가하면 여기에 타이머가 생겨요.</p>';

    return `
      <div class="boss-cd-panel" id="bossCdPanel-${bossDef.id}" data-boss-panel="${bossDef.id}" ${bossDef.id === activeBossId ? '' : 'hidden'}>
        <p class="boss-cd-hint">${escapeHtml(bossDef.hint)}</p>
        <div class="boss-cd-list">${cards}</div>
      </div>`;
  }

  function render(force) {
    const root = $('bossCooldownApp');
    if (!root || !mounted) return;
    if (!force && isAddFieldFocused()) {
      updateTimers();
      return;
    }
    captureManualDraftsFromDom();
    const tabs = BOSS_DEFS.map((b) => {
      const count = entriesForBoss(b.id).length;
      const active = b.id === activeBossId ? ' is-active' : '';
      return `<button type="button" class="mypage-tab${active}" data-boss-tab="${b.id}">${escapeHtml(b.label)} <span class="boss-cd-tab-badge">${count}</span></button>`;
    }).join('');
    const panels = BOSS_DEFS.map((b) => panelHtml(b)).join('');
    const activeDef = BOSS_DEFS.find((b) => b.id === activeBossId) || BOSS_DEFS[0];
    const addDock = addFormHtml(activeDef);
    root.innerHTML = `
      <div class="boss-cd-tabs" role="tablist">${tabs}</div>
      <div class="boss-cd-scroll">${panels}</div>
      <div class="boss-cd-add-dock">${addDock}</div>`;
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
    root.addEventListener(
      'input',
      (e) => {
        const inp = e.target.closest('input[data-boss-manual-time]');
        if (!inp) return;
        manualTimeDrafts[manualTimeDraftKey(inp.dataset.bossManualTime, inp.dataset.entryId)] = inp.value;
      },
      true
    );
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
    if (opts.syncLocalSnapshot) syncLocalSnapshot = opts.syncLocalSnapshot;
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
