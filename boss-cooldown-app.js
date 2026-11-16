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
  /** 파풀: NPC 재료 후 대략 입장 시각 추정(기존 데이터 1회 보정용) */
  const PAPULATUS_ENTRY_OFFSET_MS = 3600000;

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
      hint: '① NPC 재료(균열 조각) 수령 시각 24h · ② 맵 입장 시각 24h 별도 · 둘 다 끝나야 다시 들어가기 편해요. (일 2트 00시 초기화는 게임 안내)',
      papulatusDual: true,
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
    if (bossId === 'papulatus') {
      out.entryCompletedAt =
        e.entryCompletedAt != null && Number.isFinite(Number(e.entryCompletedAt))
          ? Number(e.entryCompletedAt)
          : null;
      out.entryEndsAt =
        e.entryEndsAt != null && Number.isFinite(Number(e.entryEndsAt)) ? Number(e.entryEndsAt) : null;
      out.entryPausedRemainingMs =
        e.entryPausedRemainingMs != null && Number.isFinite(Number(e.entryPausedRemainingMs))
          ? Math.max(0, Number(e.entryPausedRemainingMs))
          : null;
      out.entryDualLaneSeeded = !!e.entryDualLaneSeeded;
      if (out.entryEndsAt != null && out.entryPausedRemainingMs != null) out.entryPausedRemainingMs = null;
    }
    if (out.endsAt != null && out.pausedRemainingMs != null) out.pausedRemainingMs = null;
    if (e.revision != null && Number.isFinite(Number(e.revision))) {
      out.revision = Number(e.revision);
    }
    return out;
  }

  function entryRevision(entry) {
    if (!entry || entry.revision == null) return 0;
    const n = Number(entry.revision);
    return Number.isFinite(n) ? n : 0;
  }

  function touchEntryRevision(entry) {
    if (entry) entry.revision = Date.now();
  }

  function tombstoneIdSet(raw, bossId) {
    if (!raw || typeof raw !== 'object') return new Set();
    const t = raw.tombstones && raw.tombstones[bossId];
    if (!Array.isArray(t)) return new Set();
    return new Set(t.map((x) => String(x)).filter(Boolean));
  }

  function mergeTombstoneLists(prev, next) {
    const out = emptyBossEntries();
    BOSS_IDS.forEach((bossId) => {
      const set = new Set([
        ...(prev.tombstones[bossId] || []),
        ...(next.tombstones[bossId] || []),
      ]);
      out[bossId] = [...set];
    });
    return out;
  }

  function addBossEntryTombstone(bossId, entryId) {
    const bc = ensureBossCooldownState();
    if (!bc.tombstones) bc.tombstones = emptyBossEntries();
    const id = String(entryId);
    if (!bc.tombstones[bossId].includes(id)) bc.tombstones[bossId].push(id);
  }

  function normalizeBossCooldown(raw) {
    const base = { entries: emptyBossEntries(), tombstones: emptyBossEntries() };
    if (!raw || typeof raw !== 'object') return base;
    const src = raw.entries && typeof raw.entries === 'object' ? raw.entries : raw;
    BOSS_IDS.forEach((bossId) => {
      const blocked = tombstoneIdSet(raw, bossId);
      base.tombstones[bossId] = [...blocked];
      const list = Array.isArray(src[bossId]) ? src[bossId] : [];
      base.entries[bossId] = list
        .map((row) => normalizeEntry(row, bossId))
        .filter(Boolean)
        .filter((e) => !blocked.has(e.id));
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

  function entryLaneTimerScore(entry) {
    if (!entry) return -1;
    if (entry.entryEndsAt != null && Number.isFinite(Number(entry.entryEndsAt))) return Number(entry.entryEndsAt);
    if (entry.entryPausedRemainingMs != null) return Date.now() + Number(entry.entryPausedRemainingMs);
    return 0;
  }

  function mergePapulatusEntryFields(picked, a, b) {
    const entrySa = entryLaneTimerScore(a);
    const entrySb = entryLaneTimerScore(b);
    const entrySrc = entrySb > entrySa ? b : entrySa > entrySb ? a : picked;
    if (entryLaneTimerScore(entrySrc) > 0) {
      return {
        ...picked,
        entryCompletedAt: entrySrc.entryCompletedAt,
        entryEndsAt: entrySrc.entryEndsAt,
        entryPausedRemainingMs: entrySrc.entryPausedRemainingMs,
        entryDualLaneSeeded: !!(picked.entryDualLaneSeeded || entrySrc.entryDualLaneSeeded),
      };
    }
    if (entrySrc.entryDualLaneSeeded) {
      return { ...picked, entryDualLaneSeeded: true };
    }
    return picked;
  }

  /** Realtime·저장 — revision 최신 우선(적용·↻) · 없으면 endsAt score */
  function pickMergedEntry(a, b) {
    if (!a) return b;
    if (!b) return a;
    const ra = entryRevision(a);
    const rb = entryRevision(b);
    let picked;
    if (ra > 0 || rb > 0) {
      if (ra !== rb) {
        picked = rb > ra ? b : a;
        return mergePapulatusEntryFields(picked, a, b);
      }
    }
    const sa = entryTimerScore(a);
    const sb = entryTimerScore(b);
    picked = sb > sa ? b : sa > sb ? a : b;
    const other = picked === a ? b : a;
    if (
      picked.endsAt != null &&
      picked.completedAt == null &&
      other.completedAt != null
    ) {
      picked = { ...picked, completedAt: other.completedAt };
    }
    return mergePapulatusEntryFields(picked, a, b);
  }

  function timerLaneFields(lane) {
    if (lane === 'map') {
      return {
        completedAt: 'entryCompletedAt',
        endsAt: 'entryEndsAt',
        pausedRemainingMs: 'entryPausedRemainingMs',
      };
    }
    return { completedAt: 'completedAt', endsAt: 'endsAt', pausedRemainingMs: 'pausedRemainingMs' };
  }

  function remainingMsLane(entry, lane) {
    if (!entry) return 0;
    const f = timerLaneFields(lane);
    const paused = entry[f.pausedRemainingMs];
    const endsAt = entry[f.endsAt];
    if (paused != null) return paused;
    if (endsAt != null) return Math.max(0, endsAt - Date.now());
    return 0;
  }

  function timerPhaseLane(entry, lane) {
    const f = timerLaneFields(lane);
    if (entry[f.pausedRemainingMs] != null && entry[f.endsAt] == null) return 'paused';
    if (entry[f.endsAt] != null) {
      if (entry[f.endsAt] - Date.now() > 0) return 'running';
      return 'ready';
    }
    return 'idle';
  }

  function isTimerActiveLane(entry, lane) {
    const f = timerLaneFields(lane);
    return entry[f.endsAt] != null || entry[f.pausedRemainingMs] != null;
  }

  function migratePapulatusDualTimersInPlace() {
    const st = getState();
    if (!st.bossCooldown) return;
    const bc = st.bossCooldown;
    if (!bc.entries || !Array.isArray(bc.entries.papulatus)) return;
    let changed = false;
    bc.entries.papulatus.forEach((entry) => {
      if (entry.entryDualLaneSeeded) return;
      entry.entryDualLaneSeeded = true;
      if (
        entry.entryCompletedAt != null ||
        entry.entryEndsAt != null ||
        entry.entryPausedRemainingMs != null
      ) {
        return;
      }
      if (!isTimerActive(entry)) return;
      const questAt = entry.completedAt;
      if (questAt == null || !Number.isFinite(questAt)) return;
      const entryStart = questAt + PAPULATUS_ENTRY_OFFSET_MS;
      entry.entryCompletedAt = entryStart;
      if (entry.endsAt != null) {
        entry.entryEndsAt = entryStart + MS_DAY;
      } else if (entry.pausedRemainingMs != null) {
        const entryEnd = entryStart + MS_DAY;
        const rem = Math.max(0, entryEnd - Date.now());
        entry.entryPausedRemainingMs = rem > 0 ? rem : null;
      }
      touchEntryRevision(entry);
      changed = true;
    });
    if (changed) scheduleSave();
  }

  /** 구 데이터(revision 0) + 돌아가는 타이머 → merge에서 밀리지 않게 */
  function migrateActiveEntryRevisionsInPlace() {
    const bc = ensureBossCooldownState();
    BOSS_IDS.forEach((bossId) => {
      bc.entries[bossId].forEach((e) => {
        if (entryRevision(e) === 0 && (isTimerActive(e) || isTimerActiveLane(e, 'map'))) {
          touchEntryRevision(e);
        }
      });
    });
    migratePapulatusDualTimersInPlace();
  }

  function mergeBossCooldown(prevRaw, nextRaw) {
    const prev = normalizeBossCooldown(prevRaw);
    const next = normalizeBossCooldown(nextRaw);
    const merged = { entries: emptyBossEntries(), tombstones: mergeTombstoneLists(prev, next) };
    BOSS_IDS.forEach((bossId) => {
      const blocked = new Set(merged.tombstones[bossId] || []);
      const prevById = new Map(prev.entries[bossId].map((e) => [e.id, e]));
      const nextFiltered = next.entries[bossId].filter(
        (e) => !pendingBossEntryDeletes.has(e.id) && !blocked.has(e.id)
      );
      merged.entries[bossId] = nextFiltered.map((e) => pickMergedEntry(prevById.get(e.id), e));
      const mergedIds = new Set(merged.entries[bossId].map((e) => e.id));
      prev.entries[bossId].forEach((e) => {
        if (mergedIds.has(e.id) || blocked.has(e.id) || pendingBossEntryDeletes.has(e.id)) {
          return;
        }
        if (pendingBossEntryAdds.has(e.id) || entryRevision(e) > 0) {
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

  function manualTimeDraftKey(bossId, entryId, lane) {
    const laneSuffix = lane === 'map' ? ':map' : '';
    return `${bossId}:${entryId}${laneSuffix}`;
  }

  function manualInputValue(bossId, entry, lane) {
    const key = manualTimeDraftKey(bossId, entry.id, lane);
    if (Object.prototype.hasOwnProperty.call(manualTimeDrafts, key)) {
      return manualTimeDrafts[key];
    }
    const f = timerLaneFields(lane);
  const at = entry[f.completedAt];
    if (at != null) return toDatetimeLocalValue(at);
    return '';
  }

  function captureManualDraftsFromDom() {
    const root = $('bossCooldownApp');
    if (!root) return;
    root.querySelectorAll('input[data-boss-manual-time]').forEach((inp) => {
      const bossId = inp.dataset.bossManualTime;
      const entryId = inp.dataset.entryId;
      const lane = inp.dataset.timerLane || 'quest';
      if (bossId && entryId) manualTimeDrafts[manualTimeDraftKey(bossId, entryId, lane)] = inp.value;
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

  function startCooldown(bossId, entryId, lane) {
    const def = BOSS_DEFS.find((b) => b.id === bossId);
    const entry = findEntry(bossId, entryId);
    if (!def || !entry || !canEditMember(entry.memberIdx)) return;
    const f = timerLaneFields(lane || 'quest');
    const now = Date.now();
    entry[f.completedAt] = now;
    entry[f.endsAt] = now + def.durationMs;
    entry[f.pausedRemainingMs] = null;
    touchEntryRevision(entry);
    delete manualTimeDrafts[manualTimeDraftKey(bossId, entryId, lane || 'quest')];
    syncLocalSnapshot();
    render(true);
    flushSave();
  }

  function pauseCooldown(bossId, entryId, lane) {
    const entry = findEntry(bossId, entryId);
    if (!entry || !canEditMember(entry.memberIdx)) return;
    const f = timerLaneFields(lane || 'quest');
    if (entry[f.endsAt] == null) return;
    const rem = Math.max(0, entry[f.endsAt] - Date.now());
    entry[f.pausedRemainingMs] = rem;
    entry[f.endsAt] = null;
    touchEntryRevision(entry);
    syncLocalSnapshot();
    scheduleSave();
    render();
  }

  function resumeCooldown(bossId, entryId, lane) {
    const entry = findEntry(bossId, entryId);
    if (!entry || !canEditMember(entry.memberIdx)) return;
    const f = timerLaneFields(lane || 'quest');
    if (entry[f.pausedRemainingMs] == null) return;
    entry[f.endsAt] = Date.now() + entry[f.pausedRemainingMs];
    entry[f.pausedRemainingMs] = null;
    touchEntryRevision(entry);
    syncLocalSnapshot();
    scheduleSave();
    render();
  }

  function resetCooldown(bossId, entryId, lane) {
    const entry = findEntry(bossId, entryId);
    if (!entry || !canEditMember(entry.memberIdx)) return;
    const f = timerLaneFields(lane || 'quest');
    entry[f.endsAt] = null;
    entry[f.completedAt] = null;
    entry[f.pausedRemainingMs] = null;
    touchEntryRevision(entry);
    delete manualTimeDrafts[manualTimeDraftKey(bossId, entryId, lane || 'quest')];
    syncLocalSnapshot();
    render(true);
    flushSave();
  }

  function deleteEntry(bossId, entryId) {
    const list = entriesForBoss(bossId);
    const entry = findEntry(bossId, entryId);
    if (!entry) return;
    if (!canEditMember(entry.memberIdx)) {
      alert('이 캐릭터는 삭제할 권한이 없어요.');
      return;
    }
    addBossEntryTombstone(bossId, entryId);
    pendingBossEntryAdds.delete(entryId);
    pendingBossEntryDeletes.add(entryId);
    const idx = list.findIndex((x) => x.id === entryId);
    if (idx >= 0) list.splice(idx, 1);
    delete manualTimeDrafts[manualTimeDraftKey(bossId, entryId, 'quest')];
    delete manualTimeDrafts[manualTimeDraftKey(bossId, entryId, 'map')];
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
    const entry = normalizeEntry({ id: genId(), memberIdx, charName, revision: Date.now() }, bossId);
    if (!entry) return;
    entriesForBoss(bossId).push(entry);
    pendingBossEntryAdds.add(entry.id);
    if (nameInput) nameInput.value = '';
    syncLocalSnapshot();
    scheduleSave();
    render();
  }

  function setTailQuestDone(bossId, entryId, checked) {
    const entry = findEntry(bossId, entryId);
    if (!entry || !canEditMember(entry.memberIdx)) return;
    entry.tailQuestDone = !!checked;
    touchEntryRevision(entry);
    syncLocalSnapshot();
    scheduleSave();
    render();
  }

  function parseDatetimeLocalMs(value) {
    const s = String(value || '').trim();
    if (!s) return NaN;
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
    if (m) {
      const ms = new Date(
        Number(m[1]),
        Number(m[2]) - 1,
        Number(m[3]),
        Number(m[4]),
        Number(m[5]),
        m[6] != null ? Number(m[6]) : 0,
        0
      ).getTime();
      if (Number.isFinite(ms)) return ms;
    }
    return new Date(s).getTime();
  }

  function applyManualCompleteTime(bossId, entryId, lane) {
    const def = BOSS_DEFS.find((b) => b.id === bossId);
    const entry = findEntry(bossId, entryId);
    if (!entry) return;
    if (!def || !canEditMember(entry.memberIdx)) {
      alert('이 캐릭터는 수정할 권한이 없어요.');
      return;
    }
    const laneKey = lane || 'quest';
    const root = $('bossCooldownApp');
    const input = root
      ? root.querySelector(
          `input[data-boss-manual-time="${bossId}"][data-entry-id="${entryId}"][data-timer-lane="${laneKey}"]`
        )
      : null;
    const timeLabel = laneKey === 'map' ? '입장' : '완료';
    if (!input || !input.value) {
      alert(timeLabel + ' 시각을 입력한 뒤 적용해 주세요.');
      if (input) input.focus();
      return;
    }
    const started = parseDatetimeLocalMs(input.value);
    if (!Number.isFinite(started)) {
      alert('시각 형식을 확인해 주세요.');
      return;
    }
    const f = timerLaneFields(laneKey);
    entry[f.completedAt] = started;
    entry[f.endsAt] = started + def.durationMs;
    entry[f.pausedRemainingMs] = null;
    touchEntryRevision(entry);
    delete manualTimeDrafts[manualTimeDraftKey(bossId, entryId, laneKey)];
    syncLocalSnapshot();
    render(true);
    flushSave();
  }

  function statusMetaForEntry(entry, lane) {
    const phase = lane ? timerPhaseLane(entry, lane) : timerPhase(entry);
    const rem = lane ? remainingMsLane(entry, lane) : remainingMs(entry);
    let phaseClass = 'boss-cd-phase--idle';
    let phaseText = '쿨 없음';
    let timerClass = 'boss-cd-timer--empty';
    let timerText = '';
    let statusPillClass = 'boss-cd-status-pill--idle';
    let statusPillText = '쿨 없음';
    if (phase === 'running') {
      phaseText = '';
      phaseClass = 'boss-cd-phase--empty';
      timerClass = 'boss-cd-timer--run';
      timerText = formatDuration(rem);
      statusPillClass = 'boss-cd-status-pill--run';
      statusPillText = '쿨 중';
    } else if (phase === 'paused') {
      phaseText = '⏸';
      phaseClass = 'boss-cd-phase--pause';
      timerClass = 'boss-cd-timer--pause';
      timerText = formatDuration(rem);
      statusPillClass = 'boss-cd-status-pill--pause';
      statusPillText = '일시정지';
    } else if (phase === 'ready') {
      phaseText = '입장 가능';
      phaseClass = 'boss-cd-phase--ready';
      statusPillClass = 'boss-cd-status-pill--ready';
      statusPillText = '입장 가능';
    }
    return { phase, phaseClass, phaseText, timerClass, timerText, statusPillClass, statusPillText };
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
        const lanes = bossDef.papulatusDual ? ['quest', 'map'] : [null];
        lanes.forEach((lane) => {
          const sel = lane
            ? `.boss-cd-timer-lane[data-timer-lane="${lane}"]`
            : '.boss-cd-timer-lane--single';
          const block = card.querySelector(sel);
          if (!block) return;
          const meta = statusMetaForEntry(entry, lane || undefined);
          const { phaseClass, phaseText, timerClass, timerText, statusPillClass, statusPillText, phase } = meta;
          if (block.classList.contains('boss-cd-lane-card')) {
            block.dataset.phase = phase;
          }
          const pillEl = block.querySelector('.boss-cd-status-pill');
          if (pillEl) {
            pillEl.textContent = statusPillText;
            pillEl.className = `boss-cd-status-pill ${statusPillClass}`;
          }
          const phaseEl = block.querySelector('.boss-cd-phase');
          if (phaseEl) {
            phaseEl.textContent = phaseText;
            phaseEl.className = `boss-cd-phase ${phaseClass}`;
          }
          const timerEl = block.querySelector('.boss-cd-timer');
          if (timerEl) {
            timerEl.textContent = timerText;
            timerEl.className = `boss-cd-timer ${timerClass}`;
          }
        });
      });
    });
  }

  function timerLaneLineHtml(bossDef, entry, lane, laneLabel, opts) {
    const editable = opts.editable;
    const showDelete = !!opts.showDelete;
    const { phaseClass, phaseText, timerClass, timerText } = statusMetaForEntry(entry, lane);
    const laneAttr = lane === 'map' ? 'map' : 'quest';
    const playTitle =
      lane === 'map' ? '지금 맵 입장한 것으로 24h 쿨 시작' : '지금 NPC 재료 수령 기준 쿨 시작';
    const manualAria = lane === 'map' ? '맵 입장 시각' : 'NPC 재료 수령 시각';
    const blockClass = lane ? `boss-cd-timer-lane` : `boss-cd-timer-lane boss-cd-timer-lane--single`;
    const laneData = lane ? ` data-timer-lane="${laneAttr}"` : '';

    let pianusInline = '';
    if (bossDef.pianus && lane !== 'map') {
      pianusInline = `
        <label class="boss-cd-pianus-inline${editable ? '' : ' boss-cd-flag--readonly'}" title="${escapeHtml(pianusNpcHint(entry))}">
          <input type="checkbox" data-boss-tail="${bossDef.id}" data-entry-id="${escapeHtml(entry.id)}" ${entry.tailQuestDone ? 'checked' : ''} ${editable ? '' : 'disabled'}>
          <span>꼬리</span>
        </label>`;
    }

    const nameCell = opts.showName
      ? `<span class="boss-cd-char-name" title="캐릭">${escapeHtml(entry.charName)}</span>`
      : laneLabel
        ? `<span class="boss-cd-lane-label">${escapeHtml(laneLabel)}</span>`
        : '';

    const inner = editable
      ? `
        ${nameCell}
        <div class="boss-cd-controls" role="group" aria-label="${escapeHtml(laneLabel || '타이머')}">
          <button type="button" class="boss-cd-ctl" data-act="play" data-timer-lane="${laneAttr}" data-boss-id="${bossDef.id}" data-entry-id="${escapeHtml(entry.id)}" title="${escapeHtml(playTitle)}" aria-label="${escapeHtml(playTitle)}">▶</button>
          <button type="button" class="boss-cd-ctl" data-act="pause" data-timer-lane="${laneAttr}" data-boss-id="${bossDef.id}" data-entry-id="${escapeHtml(entry.id)}" title="일시정지" aria-label="일시정지">⏸</button>
          <button type="button" class="boss-cd-ctl" data-act="reset" data-timer-lane="${laneAttr}" data-boss-id="${bossDef.id}" data-entry-id="${escapeHtml(entry.id)}" title="초기화" aria-label="초기화">↻</button>
        </div>
        <span class="boss-cd-phase ${phaseClass}">${escapeHtml(phaseText)}</span>
        <input type="datetime-local" class="boss-cd-manual-input" data-boss-manual-time="${bossDef.id}" data-entry-id="${escapeHtml(entry.id)}" data-timer-lane="${laneAttr}" value="${escapeHtml(manualInputValue(bossDef.id, entry, laneAttr))}" aria-label="${escapeHtml(manualAria)}">
        <button type="button" class="btn-light btn-sm boss-cd-apply-btn" data-act="manual-apply" data-timer-lane="${laneAttr}" data-boss-id="${bossDef.id}" data-entry-id="${escapeHtml(entry.id)}" title="입력 시각 + 24h 쿨">적용</button>
        <span class="boss-cd-timer ${timerClass}">${escapeHtml(timerText)}</span>
        ${pianusInline}
        ${showDelete ? `<button type="button" class="btn-linkish boss-cd-del" data-act="delete" data-boss-id="${bossDef.id}" data-entry-id="${escapeHtml(entry.id)}">삭제</button>` : ''}`
      : `
        ${nameCell}
        <span class="boss-cd-phase ${phaseClass}">${escapeHtml(phaseText)}</span>
        <span class="boss-cd-timer ${timerClass}">${escapeHtml(timerText)}</span>`;

    return `<div class="${blockClass} boss-cd-char-line${lane && !opts.showName ? ' boss-cd-char-line--lane' : ''}"${laneData}>${inner}</div>`;
  }

  function papulatusLaneCardHtml(bossDef, entry, lane, laneLabel, editable) {
    const laneAttr = lane === 'map' ? 'map' : 'quest';
    const meta = statusMetaForEntry(entry, lane);
    const playTitle =
      lane === 'map' ? '지금 맵 입장한 것으로 24h 쿨 시작' : '지금 NPC 재료 수령 기준 쿨 시작';
    const manualAria = lane === 'map' ? '맵 입장 시각' : 'NPC 재료 수령 시각';
    const laneMod = lane === 'map' ? 'boss-cd-lane-card--map' : 'boss-cd-lane-card--quest';

    const tools = editable
      ? `
        <div class="boss-cd-lane-tools">
          <div class="boss-cd-controls" role="group" aria-label="${escapeHtml(laneLabel)}">
            <button type="button" class="boss-cd-ctl" data-act="play" data-timer-lane="${laneAttr}" data-boss-id="${bossDef.id}" data-entry-id="${escapeHtml(entry.id)}" title="${escapeHtml(playTitle)}">▶</button>
            <button type="button" class="boss-cd-ctl" data-act="pause" data-timer-lane="${laneAttr}" data-boss-id="${bossDef.id}" data-entry-id="${escapeHtml(entry.id)}" title="일시정지">⏸</button>
            <button type="button" class="boss-cd-ctl" data-act="reset" data-timer-lane="${laneAttr}" data-boss-id="${bossDef.id}" data-entry-id="${escapeHtml(entry.id)}" title="초기화">↻</button>
          </div>
          <input type="datetime-local" class="boss-cd-manual-input boss-cd-manual-input--lane" data-boss-manual-time="${bossDef.id}" data-entry-id="${escapeHtml(entry.id)}" data-timer-lane="${laneAttr}" value="${escapeHtml(manualInputValue(bossDef.id, entry, laneAttr))}" aria-label="${escapeHtml(manualAria)}">
          <button type="button" class="btn-light btn-sm boss-cd-apply-btn" data-act="manual-apply" data-timer-lane="${laneAttr}" data-boss-id="${bossDef.id}" data-entry-id="${escapeHtml(entry.id)}">적용</button>
        </div>`
      : `
        <div class="boss-cd-lane-tools boss-cd-lane-tools--readonly">
          <span class="boss-cd-phase ${meta.phaseClass}">${escapeHtml(meta.phaseText)}</span>
        </div>`;

    return `
      <div class="boss-cd-lane-card boss-cd-timer-lane ${laneMod}" data-timer-lane="${laneAttr}" data-phase="${meta.phase}">
        <div class="boss-cd-lane-top">
          <span class="boss-cd-lane-badge">${escapeHtml(laneLabel)}</span>
          <span class="boss-cd-status-pill ${meta.statusPillClass}">${escapeHtml(meta.statusPillText)}</span>
          <span class="boss-cd-timer boss-cd-timer--lane ${meta.timerClass}">${escapeHtml(meta.timerText)}</span>
        </div>
        ${tools}
      </div>`;
  }

  function charRowHtml(bossDef, entry) {
    const editable = canEditMember(entry.memberIdx);

    if (bossDef.papulatusDual) {
      return `
      <div class="boss-cd-char-row boss-cd-char-row--dual" data-entry-id="${escapeHtml(entry.id)}">
        <div class="boss-cd-char-card">
          <header class="boss-cd-char-head">
            <span class="boss-cd-char-name" title="캐릭">${escapeHtml(entry.charName)}</span>
            ${editable ? `<button type="button" class="btn-linkish boss-cd-del" data-act="delete" data-boss-id="${bossDef.id}" data-entry-id="${escapeHtml(entry.id)}">삭제</button>` : ''}
          </header>
          <div class="boss-cd-dual-lanes">
            ${papulatusLaneCardHtml(bossDef, entry, 'quest', 'NPC 재료', editable)}
            ${papulatusLaneCardHtml(bossDef, entry, 'map', '맵 입장', editable)}
          </div>
        </div>
      </div>`;
    }

    return `
      <div class="boss-cd-char-row" data-entry-id="${escapeHtml(entry.id)}">
        ${timerLaneLineHtml(bossDef, entry, null, null, { editable, showName: true, showDelete: editable })}
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
      const act = actBtn.dataset.act;
      const bossId = actBtn.dataset.bossId;
      const entryId = actBtn.dataset.entryId;
      const lane = actBtn.dataset.timerLane || 'quest';
      if (act === 'play') {
        const entry = findEntry(bossId, entryId);
        const f = timerLaneFields(lane);
        if (entry && entry[f.pausedRemainingMs] != null) resumeCooldown(bossId, entryId, lane);
        else startCooldown(bossId, entryId, lane);
      } else if (act === 'pause') pauseCooldown(bossId, entryId, lane);
      else if (act === 'reset') resetCooldown(bossId, entryId, lane);
      else if (act === 'manual-apply') applyManualCompleteTime(bossId, entryId, lane);
      else if (act === 'delete') {
        e.preventDefault();
        e.stopPropagation();
        if (!bossId || !entryId) return;
        if (confirm('이 캐릭터 타이머를 목록에서 삭제할까요?')) deleteEntry(bossId, entryId);
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
    migrateActiveEntryRevisionsInPlace();
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
    if (opts.flushSave) flushSave = opts.flushSave;
  }

  global.BossCooldownApp = {
    init,
    openModal,
    closeModal,
    renderIfOpen,
    normalizeBossCooldown,
    mergeBossCooldown,
    ensureBossCooldownState,
    clearBossCooldownPendingSync,
    migrateActiveEntryRevisionsInPlace,
  };
})(typeof window !== 'undefined' ? window : globalThis);
