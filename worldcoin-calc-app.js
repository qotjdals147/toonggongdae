/**
 * 월드코인 계산기 — 퉁공대 모달 (로직·설정은 브라우저 localStorage, 장부 state 무관)
 */
(function (global) {
  let $ = (id) => document.getElementById(id);

  const DEFAULTS = {
    points: [
      { size: 5000, cost: 700, meso: 1230000 },
      { size: 10000, cost: 1600, meso: 2400000 },
      { size: 30000, cost: 4200, meso: 7000000 },
    ],
    coins: [
      { size: 400, cost: 3000 },
      { size: 800, cost: 6000 },
      { size: 1600, cost: 12000 },
      { size: 3600, cost: 27000 },
      { size: 6400, cost: 48000 },
      { size: 13200, cost: 99000 },
      { size: 26000, cost: 195000 },
      { size: 66000, cost: 495000 },
    ],
  };

  const STORAGE_KEY = 'maple_worldcoin_calc_settings_v3';
  const DP_SAFE_LIMIT = 8000000;

  let settings = loadSettings();
  let lastCashResult = null;
  let lastMesoResult = null;
  let mounted = false;

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(DEFAULTS);
      const parsed = JSON.parse(raw);
      if (!parsed.points || !parsed.coins) return structuredClone(DEFAULTS);
      parsed.points.forEach((p) => {
        if (typeof p.meso !== 'number') p.meso = 0;
      });
      return parsed;
    } catch (e) {
      return structuredClone(DEFAULTS);
    }
  }

  function saveToStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  function fmt(n) {
    return Math.round(n).toLocaleString('ko-KR');
  }

  function parseNum(str) {
    return Number(String(str || '').replace(/,/g, '')) || 0;
  }

  function solveMinCostDirect(target, valid, sizeKey, costKey) {
    const N = Math.ceil(target);
    const dp = new Float64Array(N + 1).fill(Infinity);
    const choice = new Int32Array(N + 1).fill(-1);
    dp[0] = 0;
    for (let i = 1; i <= N; i++) {
      for (let j = 0; j < valid.length; j++) {
        const p = valid[j];
        const prev = Math.max(0, i - p[sizeKey]);
        const c = p[costKey] + dp[prev];
        if (c < dp[i]) {
          dp[i] = c;
          choice[i] = j;
        }
      }
    }
    const counts = new Array(valid.length).fill(0);
    let i = N;
    let guard = 0;
    while (i > 0 && guard < 2000000) {
      const j = choice[i];
      if (j === -1) break;
      counts[j]++;
      i = Math.max(0, i - valid[j][sizeKey]);
      guard++;
    }
    const combo = valid
      .map((p, idx) => ({ ...p, count: counts[idx] }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b[sizeKey] - a[sizeKey]);
    const totalSize = combo.reduce((s, x) => s + x[sizeKey] * x.count, 0);
    return { totalCost: dp[N], totalSize, combo };
  }

  function solveMinCost(target, packages, sizeKey, costKey) {
    sizeKey = sizeKey || 'size';
    costKey = costKey || 'cost';
    const valid = packages.filter((p) => p[sizeKey] > 0 && p[costKey] >= 0);
    if (target <= 0 || valid.length === 0) return { totalCost: 0, totalSize: 0, combo: [] };
    if (target <= DP_SAFE_LIMIT) return solveMinCostDirect(target, valid, sizeKey, costKey);

    const maxSize = Math.max(...valid.map((p) => p[sizeKey]));
    let best = valid[0];
    for (const p of valid) {
      if (p[costKey] / p[sizeKey] < best[costKey] / best[sizeKey]) best = p;
    }
    const safeWindow = Math.min(Math.max(maxSize, 50000), DP_SAFE_LIMIT);
    const k = Math.floor((target - safeWindow) / best[sizeKey]);
    const remainder = target - k * best[sizeKey];
    const sub = solveMinCostDirect(remainder, valid, sizeKey, costKey);
    const combo = sub.combo.map((x) => ({ ...x }));
    const existing = combo.find((x) => x[sizeKey] === best[sizeKey]);
    if (existing) existing.count += k;
    else if (k > 0) combo.push({ ...best, count: k });
    return {
      totalCost: sub.totalCost + k * best[costKey],
      totalSize: sub.totalSize + k * best[sizeKey],
      combo: combo.filter((x) => x.count > 0).sort((a, b) => b[sizeKey] - a[sizeKey]),
    };
  }

  function solveMinCountDirect(target, valid, sizeKey, costKey) {
    const N = Math.ceil(target);
    const dpCount = new Float64Array(N + 1).fill(Infinity);
    const dpCost = new Float64Array(N + 1).fill(Infinity);
    const choice = new Int32Array(N + 1).fill(-1);
    dpCount[0] = 0;
    dpCost[0] = 0;
    for (let i = 1; i <= N; i++) {
      for (let j = 0; j < valid.length; j++) {
        const p = valid[j];
        const prev = Math.max(0, i - p[sizeKey]);
        const cnt = dpCount[prev] + 1;
        const cost = dpCost[prev] + p[costKey];
        if (cnt < dpCount[i] || (cnt === dpCount[i] && cost < dpCost[i])) {
          dpCount[i] = cnt;
          dpCost[i] = cost;
          choice[i] = j;
        }
      }
    }
    const counts = new Array(valid.length).fill(0);
    let i = N;
    let guard = 0;
    while (i > 0 && guard < 2000000) {
      const j = choice[i];
      if (j === -1) break;
      counts[j]++;
      i = Math.max(0, i - valid[j][sizeKey]);
      guard++;
    }
    const combo = valid
      .map((p, idx) => ({ ...p, count: counts[idx] }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b[sizeKey] - a[sizeKey]);
    const totalSize = combo.reduce((s, x) => s + x[sizeKey] * x.count, 0);
    return { totalCost: dpCost[N], totalSize, combo };
  }

  function solveMinCount(target, packages, sizeKey, costKey) {
    sizeKey = sizeKey || 'size';
    costKey = costKey || 'cost';
    const valid = packages.filter((p) => p[sizeKey] > 0 && p[costKey] >= 0);
    if (target <= 0 || valid.length === 0) return { totalCost: 0, totalSize: 0, combo: [] };
    if (target <= DP_SAFE_LIMIT) return solveMinCountDirect(target, valid, sizeKey, costKey);

    const maxSize = Math.max(...valid.map((p) => p[sizeKey]));
    const biggest = valid.reduce((a, b) => (b[sizeKey] > a[sizeKey] ? b : a));
    const safeWindow = Math.min(Math.max(maxSize, 50000), DP_SAFE_LIMIT);
    const k = Math.floor((target - safeWindow) / biggest[sizeKey]);
    const remainder = target - k * biggest[sizeKey];
    const sub = solveMinCountDirect(remainder, valid, sizeKey, costKey);
    const combo = sub.combo.map((x) => ({ ...x }));
    const existing = combo.find((x) => x[sizeKey] === biggest[sizeKey]);
    if (existing) existing.count += k;
    else if (k > 0) combo.push({ ...biggest, count: k });
    return {
      totalCost: sub.totalCost + k * biggest[costKey],
      totalSize: sub.totalSize + k * biggest[sizeKey],
      combo: combo.filter((x) => x.count > 0).sort((a, b) => b[sizeKey] - a[sizeKey]),
    };
  }

  function purchaseCount(combo) {
    return combo.reduce((s, x) => s + x.count, 0);
  }

  function attachCommaFormatting(input) {
    if (!input || input.dataset.wcoinComma) return;
    input.dataset.wcoinComma = '1';
    input.addEventListener('input', () => {
      const raw = input.value.replace(/[^\d]/g, '');
      input.value = raw === '' ? '' : Number(raw).toLocaleString('ko-KR');
    });
  }

  function checkLimit(target, max) {
    if (target > max) {
      alert(`한 번에 계산 가능한 최대 값은 ${fmt(max)}이에요.`);
      return false;
    }
    return true;
  }

  async function copyText(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    const original = btn.textContent;
    btn.textContent = '복사됨 ✓';
    setTimeout(() => {
      btn.textContent = original;
    }, 1200);
  }

  function mountTemplate() {
    const root = $('worldcoinCalcApp');
    if (!root || mounted) return;
    mounted = true;
    root.innerHTML = `
      <div class="wcoin-tabs" role="tablist">
        <button type="button" class="mypage-tab is-active" data-wcoin-tab="cash">캐시템 구매</button>
        <button type="button" class="mypage-tab" data-wcoin-tab="meso">메포 판매</button>
      </div>
      <div class="wcoin-panel is-active" id="wcoinTabCash" data-wcoin-panel="cash">
        <div class="wcoin-card">
          <label class="wcoin-label" for="wcoinCashInput">지출 캐시 (캐시템 가격 합계)</label>
          <div class="wcoin-input-row">
            <input type="text" id="wcoinCashInput" placeholder="예: 23,000" inputmode="numeric" autocomplete="off">
            <button type="button" class="btn-settle btn-sm" id="wcoinCalcCashBtn">확인</button>
          </div>
        </div>
        <div id="wcoinCashResultArea" class="wcoin-result-hidden">
          <div class="wcoin-card">
            <div class="wcoin-flow-step">
              <div class="wcoin-flow-label">지출 캐시</div>
              <div class="wcoin-flow-value" id="wcoinCCash">-</div>
            </div>
            <div class="wcoin-flow-step">
              <div class="wcoin-flow-label">메이플포인트 구매 <span id="wcoinC1Over"></span></div>
              <div class="wcoin-flow-value" id="wcoinC1Bought">-</div>
              <div class="wcoin-chip-row" id="wcoinC1Chips"></div>
            </div>
            <div class="wcoin-flow-step">
              <div class="wcoin-flow-label">월드코인 구매 <span id="wcoinC2Over"></span></div>
              <div class="wcoin-flow-value" id="wcoinC2Bought">-</div>
              <div class="wcoin-chip-row" id="wcoinC2Chips"></div>
            </div>
            <div class="wcoin-final-box">
              <div class="wcoin-final-label">최종 결제 금액</div>
              <div class="wcoin-final-amount" id="wcoinCashFinalWon">-</div>
              <button type="button" class="btn-linkish" id="wcoinCopyCashBtn">결과 복사</button>
            </div>
            <div class="wcoin-alt-toggle">
              <button type="button" class="btn-linkish" id="wcoinAltToggleCash">🛒 결제 횟수 줄인 방법 보기</button>
            </div>
            <div class="wcoin-alt-box wcoin-result-hidden" id="wcoinAltBoxCash"></div>
          </div>
        </div>
      </div>
      <div class="wcoin-panel" id="wcoinTabMeso" data-wcoin-panel="meso" hidden>
        <div class="wcoin-card">
          <div class="wcoin-label-row">
            <span class="wcoin-label">현재 메소 시세</span>
            <button type="button" class="btn-linkish" id="wcoinGotoSettingsBtn">수정하기 ⚙</button>
          </div>
          <div class="wcoin-price-mini" id="wcoinMesoPriceMini"></div>
          <div class="wcoin-ratio-line" id="wcoinRatioLine"></div>
          <hr class="wcoin-sep">
          <label class="wcoin-label" for="wcoinMesoInput">벌고 싶은 메소</label>
          <div class="wcoin-input-row">
            <input type="text" id="wcoinMesoInput" placeholder="예: 50,000,000" inputmode="numeric" autocomplete="off">
            <button type="button" class="btn-settle btn-sm" id="wcoinCalcMesoBtn">확인</button>
          </div>
        </div>
        <div id="wcoinMesoResultArea" class="wcoin-result-hidden">
          <div class="wcoin-card">
            <div class="wcoin-flow-step">
              <div class="wcoin-flow-label">목표 메소</div>
              <div class="wcoin-flow-value" id="wcoinMMeso">-</div>
            </div>
            <div class="wcoin-flow-step">
              <div class="wcoin-flow-label">판매용 메포 구매 <span id="wcoinM1Over"></span></div>
              <div class="wcoin-flow-value" id="wcoinM1Bought">-</div>
              <div class="wcoin-chip-row" id="wcoinM1Chips"></div>
            </div>
            <div class="wcoin-flow-step">
              <div class="wcoin-flow-label">월드코인 구매 <span id="wcoinM2Over"></span></div>
              <div class="wcoin-flow-value" id="wcoinM2Bought">-</div>
              <div class="wcoin-chip-row" id="wcoinM2Chips"></div>
            </div>
            <div class="wcoin-final-box">
              <div class="wcoin-final-label">필요 결제 금액</div>
              <div class="wcoin-final-amount" id="wcoinMesoFinalWon">-</div>
              <div class="wcoin-final-sub" id="wcoinMesoEfficiency"></div>
              <button type="button" class="btn-linkish" id="wcoinCopyMesoBtn">결과 복사</button>
            </div>
            <div class="wcoin-alt-toggle">
              <button type="button" class="btn-linkish" id="wcoinAltToggleMeso">🛒 결제 횟수 줄인 방법 보기</button>
            </div>
            <div class="wcoin-alt-box wcoin-result-hidden" id="wcoinAltBoxMeso"></div>
          </div>
        </div>
      </div>
      <details class="wcoin-settings" id="wcoinSettingsPanel">
        <summary>⚙ 패키지 값 수정</summary>
        <div class="wcoin-settings-body">
          <div class="wcoin-settings-col">
            <h4>메이플포인트 · 월드코인 · 메소시세</h4>
            <div id="wcoinPointRows"></div>
            <button type="button" class="btn-linkish" id="wcoinAddPointRow">+ 항목 추가</button>
          </div>
          <div class="wcoin-settings-col">
            <h4>월드코인 · 원화</h4>
            <div id="wcoinCoinRows"></div>
            <button type="button" class="btn-linkish" id="wcoinAddCoinRow">+ 항목 추가</button>
          </div>
          <div class="wcoin-settings-actions">
            <button type="button" class="btn-settle btn-sm" id="wcoinSaveSettingsBtn">저장</button>
            <button type="button" class="btn-linkish" id="wcoinResetSettingsBtn">기본값으로 초기화</button>
          </div>
          <p class="wcoin-hint">수정 내용은 이 브라우저에만 저장돼요. 공대 장부(Supabase)와는 별개예요.</p>
        </div>
      </details>`;
    wireUi();
  }

  function setActiveTab(tab) {
    document.querySelectorAll('[data-wcoin-tab]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.wcoinTab === tab);
    });
    document.querySelectorAll('[data-wcoin-panel]').forEach((panel) => {
      const on = panel.dataset.wcoinPanel === tab;
      panel.hidden = !on;
      panel.classList.toggle('is-active', on);
    });
  }

  function runCashCalculation() {
    const cashInput = $('wcoinCashInput');
    const target = parseNum(cashInput.value);
    if (!target || target <= 0) {
      cashInput.focus();
      return;
    }
    if (!checkLimit(target, 50000000)) return;

    $('wcoinAltBoxCash').classList.add('wcoin-result-hidden');
    $('wcoinAltToggleCash').textContent = '🛒 결제 횟수 줄인 방법 보기';

    const step1 = solveMinCost(target, settings.points, 'size', 'cost');
    const step2 = solveMinCost(step1.totalCost, settings.coins, 'size', 'cost');

    $('wcoinCashResultArea').classList.remove('wcoin-result-hidden');
    $('wcoinCCash').textContent = `${fmt(target)} 캐시`;

    $('wcoinC1Bought').textContent = `${fmt(step1.totalSize)} 메포`;
    const over1 = step1.totalSize - target;
    $('wcoinC1Over').textContent = over1 > 0 ? `(+${fmt(over1)} 여유)` : '';
    $('wcoinC1Chips').innerHTML = step1.combo
      .map((x) => `<span class="wcoin-chip">${fmt(x.size)}메포 × ${x.count}</span>`)
      .join('');

    $('wcoinC2Bought').textContent = `${fmt(step2.totalSize)} 월드코인`;
    const over2 = step2.totalSize - step1.totalCost;
    $('wcoinC2Over').textContent = over2 > 0 ? `(+${fmt(over2)} 여유)` : '';
    $('wcoinC2Chips').innerHTML = step2.combo
      .map((x) => `<span class="wcoin-chip">${fmt(x.size)}개 × ${x.count}</span>`)
      .join('');

    $('wcoinCashFinalWon').textContent = `${fmt(step2.totalCost)}원`;
    lastCashResult = { target, step1, step2 };
  }

  function buildCashSummaryText() {
    if (!lastCashResult) return '';
    const { target, step1, step2 } = lastCashResult;
    return [
      `[캐시템 구매] 목표 캐시 ${fmt(target)}`,
      `- 메이플포인트: ${step1.combo.map((x) => `${fmt(x.size)}메포×${x.count}`).join(' + ')} = ${fmt(step1.totalSize)}메포`,
      `- 필요 월드코인: ${fmt(step1.totalCost)}`,
      `- 월드코인 구매: ${step2.combo.map((x) => `${fmt(x.size)}개×${x.count}`).join(' + ')} = ${fmt(step2.totalSize)}개`,
      `- 최종 결제 금액: ${fmt(step2.totalCost)}원`,
    ].join('\n');
  }

  function renderAltCash() {
    const alt1 = solveMinCount(lastCashResult.target, settings.points, 'size', 'cost');
    const alt2 = solveMinCount(alt1.totalCost, settings.coins, 'size', 'cost');
    const altPurchases = purchaseCount(alt1.combo) + purchaseCount(alt2.combo);
    const optPurchases = purchaseCount(lastCashResult.step1.combo) + purchaseCount(lastCashResult.step2.combo);
    const diff = alt2.totalCost - lastCashResult.step2.totalCost;
    $('wcoinAltBoxCash').innerHTML = `
      <div class="wcoin-alt-title">최저가 조합은 결제 <strong>${optPurchases}회</strong> · 아래는 결제 <strong>${altPurchases}회</strong>로 줄인 방법이에요</div>
      <div class="wcoin-chip-row">${alt1.combo.map((x) => `<span class="wcoin-chip">${fmt(x.size)}메포 × ${x.count}</span>`).join('')}</div>
      <div class="wcoin-chip-row">${alt2.combo.map((x) => `<span class="wcoin-chip">${fmt(x.size)}개 × ${x.count}</span>`).join('')}</div>
      <div class="wcoin-alt-amount">${fmt(alt2.totalCost)}원</div>
      <div class="wcoin-alt-diff">${diff > 0 ? `최저가보다 +${fmt(diff)}원` : '최저가와 동일'}</div>`;
  }

  function renderMesoPriceMini() {
    const wrap = $('wcoinMesoPriceMini');
    if (!wrap) return;
    const palette = ['#4f9d5e', '#c99a2e', '#b1452e', '#5c7fae', '#7a5cae'];
    wrap.innerHTML = settings.points
      .map(
        (p, idx) => `
      <div class="wcoin-price-cell">
        <div class="wcoin-pt-label" style="background:${palette[idx % palette.length]}">${fmt(p.size)}메포</div>
        <div class="wcoin-meso-value">${p.meso ? `${fmt(p.meso)} 메소` : '<span class="wcoin-dim">미입력</span>'}</div>
      </div>`
      )
      .join('');
  }

  function renderRatioLine() {
    const el = $('wcoinRatioLine');
    if (!el) return;
    const rows = settings.points
      .filter((p) => p.size > 0 && p.cost > 0 && p.meso > 0)
      .map((p) => ({ size: p.size, ratio: p.meso / p.cost }))
      .sort((a, b) => b.ratio - a.ratio);
    if (rows.length === 0) {
      el.textContent = '메소 시세를 입력하면 패키지별 효율(월드코인당 메소)을 비교해줘요.';
      return;
    }
    el.innerHTML = `월코당 메소 · ${rows.map((r) => `${fmt(r.size)}메포 <strong>${fmt(r.ratio)}</strong>`).join(' · ')}`;
  }

  function runMesoCalculation() {
    const mesoInput = $('wcoinMesoInput');
    const target = parseNum(mesoInput.value);
    if (!target || target <= 0) {
      mesoInput.focus();
      return;
    }
    if (!checkLimit(target, 5000000000)) return;

    const hasPrice = settings.points.some((p) => p.meso > 0 && p.size > 0);
    if (!hasPrice) {
      alert('먼저 "⚙ 패키지 값 수정"에서 메소 시세를 입력해주세요.');
      $('wcoinSettingsPanel').open = true;
      return;
    }

    $('wcoinAltBoxMeso').classList.add('wcoin-result-hidden');
    $('wcoinAltToggleMeso').textContent = '🛒 결제 횟수 줄인 방법 보기';

    const step1 = solveMinCost(target, settings.points, 'meso', 'cost');
    const step2 = solveMinCost(step1.totalCost, settings.coins, 'size', 'cost');

    $('wcoinMesoResultArea').classList.remove('wcoin-result-hidden');
    $('wcoinMMeso').textContent = `${fmt(target)} 메소`;

    $('wcoinM1Bought').textContent = `${fmt(step1.totalSize)} 메소`;
    const over1 = step1.totalSize - target;
    $('wcoinM1Over').textContent = over1 > 0 ? `(+${fmt(over1)} 여유)` : '';
    $('wcoinM1Chips').innerHTML = step1.combo
      .map((x) => `<span class="wcoin-chip">${fmt(x.size)}메포 × ${x.count}</span>`)
      .join('');

    $('wcoinM2Bought').textContent = `${fmt(step2.totalSize)} 월드코인`;
    const over2 = step2.totalSize - step1.totalCost;
    $('wcoinM2Over').textContent = over2 > 0 ? `(+${fmt(over2)} 여유)` : '';
    $('wcoinM2Chips').innerHTML = step2.combo
      .map((x) => `<span class="wcoin-chip">${fmt(x.size)}개 × ${x.count}</span>`)
      .join('');

    $('wcoinMesoFinalWon').textContent = `${fmt(step2.totalCost)}원`;
    const per1M = step1.totalSize > 0 ? (step2.totalCost / step1.totalSize) * 1000000 : 0;
    $('wcoinMesoEfficiency').textContent = `메소 100만당 약 ${fmt(per1M)}원`;
    lastMesoResult = { target, step1, step2, per1M };
  }

  function buildMesoSummaryText() {
    if (!lastMesoResult) return '';
    const { target, step1, step2, per1M } = lastMesoResult;
    return [
      `[메포 판매] 목표 메소 ${fmt(target)}`,
      `- 판매용 메포: ${step1.combo.map((x) => `${fmt(x.size)}메포×${x.count}`).join(' + ')} = 메소 ${fmt(step1.totalSize)}`,
      `- 필요 월드코인: ${fmt(step1.totalCost)}`,
      `- 월드코인 구매: ${step2.combo.map((x) => `${fmt(x.size)}개×${x.count}`).join(' + ')} = ${fmt(step2.totalSize)}개`,
      `- 필요 결제 금액: ${fmt(step2.totalCost)}원 (메소 100만당 약 ${fmt(per1M)}원)`,
    ].join('\n');
  }

  function renderAltMeso() {
    const alt1 = solveMinCount(lastMesoResult.target, settings.points, 'meso', 'cost');
    const alt2 = solveMinCount(alt1.totalCost, settings.coins, 'size', 'cost');
    const altPurchases = purchaseCount(alt1.combo) + purchaseCount(alt2.combo);
    const optPurchases = purchaseCount(lastMesoResult.step1.combo) + purchaseCount(lastMesoResult.step2.combo);
    const diff = alt2.totalCost - lastMesoResult.step2.totalCost;
    $('wcoinAltBoxMeso').innerHTML = `
      <div class="wcoin-alt-title">최저가 조합은 결제 <strong>${optPurchases}회</strong> · 아래는 결제 <strong>${altPurchases}회</strong>로 줄인 방법이에요</div>
      <div class="wcoin-chip-row">${alt1.combo.map((x) => `<span class="wcoin-chip">${fmt(x.size)}메포 × ${x.count}</span>`).join('')}</div>
      <div class="wcoin-chip-row">${alt2.combo.map((x) => `<span class="wcoin-chip">${fmt(x.size)}개 × ${x.count}</span>`).join('')}</div>
      <div class="wcoin-alt-amount">${fmt(alt2.totalCost)}원</div>
      <div class="wcoin-alt-diff">${diff > 0 ? `최저가보다 +${fmt(diff)}원` : '최저가와 동일'}</div>`;
  }

  function renderSettings() {
    $('wcoinPointRows').innerHTML = settings.points
      .map(
        (p, idx) => `
    <div class="wcoin-row-edit" data-type="points" data-idx="${idx}">
      <input type="text" inputmode="numeric" autocomplete="off" class="size" value="${fmt(p.size)}"> <span>메포 /</span>
      <input type="text" inputmode="numeric" autocomplete="off" class="cost" value="${fmt(p.cost)}"> <span>월코 /</span>
      <input type="text" inputmode="numeric" autocomplete="off" class="meso" value="${p.meso ? fmt(p.meso) : ''}"> <span>메소</span>
      <button type="button" class="wcoin-rm remove-row" aria-label="삭제">✕</button>
    </div>`
      )
      .join('');
    $('wcoinCoinRows').innerHTML = settings.coins
      .map(
        (c, idx) => `
    <div class="wcoin-row-edit" data-type="coins" data-idx="${idx}">
      <input type="text" inputmode="numeric" autocomplete="off" class="size" value="${fmt(c.size)}"> <span>개 =</span>
      <input type="text" inputmode="numeric" autocomplete="off" class="cost" value="${fmt(c.cost)}"> <span>원</span>
      <button type="button" class="wcoin-rm remove-row" aria-label="삭제">✕</button>
    </div>`
      )
      .join('');
    document.querySelectorAll('#worldcoinCalcApp .wcoin-row-edit input').forEach(attachCommaFormatting);
    document.querySelectorAll('#worldcoinCalcApp .remove-row').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const row = e.target.closest('.wcoin-row-edit');
        settings[row.dataset.type].splice(Number(row.dataset.idx), 1);
        renderSettings();
        renderMesoPriceMini();
        renderRatioLine();
      });
    });
  }

  function readSettingsFromDOM() {
    const points = [];
    document.querySelectorAll('#worldcoinCalcApp .wcoin-row-edit[data-type="points"]').forEach((row) => {
      const size = parseNum(row.querySelector('.size').value);
      const cost = parseNum(row.querySelector('.cost').value);
      const meso = parseNum(row.querySelector('.meso').value);
      if (size > 0) points.push({ size, cost, meso });
    });
    settings.points = points;
    const coins = [];
    document.querySelectorAll('#worldcoinCalcApp .wcoin-row-edit[data-type="coins"]').forEach((row) => {
      const size = parseNum(row.querySelector('.size').value);
      const cost = parseNum(row.querySelector('.cost').value);
      if (size > 0) coins.push({ size, cost });
    });
    settings.coins = coins;
  }

  function wireUi() {
    document.querySelectorAll('[data-wcoin-tab]').forEach((btn) => {
      btn.addEventListener('click', () => setActiveTab(btn.dataset.wcoinTab));
    });

    $('wcoinCalcCashBtn').addEventListener('click', runCashCalculation);
    $('wcoinCashInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') runCashCalculation();
    });
    $('wcoinCopyCashBtn').addEventListener('click', (e) => copyText(buildCashSummaryText(), e.target));
    $('wcoinAltToggleCash').addEventListener('click', () => {
      if (!lastCashResult) return;
      const box = $('wcoinAltBoxCash');
      const btn = $('wcoinAltToggleCash');
      if (box.classList.contains('wcoin-result-hidden')) {
        renderAltCash();
        box.classList.remove('wcoin-result-hidden');
        btn.textContent = '간편 구매 방법 숨기기';
      } else {
        box.classList.add('wcoin-result-hidden');
        btn.textContent = '🛒 결제 횟수 줄인 방법 보기';
      }
    });

    $('wcoinGotoSettingsBtn').addEventListener('click', () => {
      const panel = $('wcoinSettingsPanel');
      panel.open = true;
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    $('wcoinCalcMesoBtn').addEventListener('click', runMesoCalculation);
    $('wcoinMesoInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') runMesoCalculation();
    });
    $('wcoinCopyMesoBtn').addEventListener('click', (e) => copyText(buildMesoSummaryText(), e.target));
    $('wcoinAltToggleMeso').addEventListener('click', () => {
      if (!lastMesoResult) return;
      const box = $('wcoinAltBoxMeso');
      const btn = $('wcoinAltToggleMeso');
      if (box.classList.contains('wcoin-result-hidden')) {
        renderAltMeso();
        box.classList.remove('wcoin-result-hidden');
        btn.textContent = '간편 구매 방법 숨기기';
      } else {
        box.classList.add('wcoin-result-hidden');
        btn.textContent = '🛒 결제 횟수 줄인 방법 보기';
      }
    });

    $('wcoinAddPointRow').addEventListener('click', () => {
      readSettingsFromDOM();
      settings.points.push({ size: 0, cost: 0, meso: 0 });
      renderSettings();
    });
    $('wcoinAddCoinRow').addEventListener('click', () => {
      readSettingsFromDOM();
      settings.coins.push({ size: 0, cost: 0 });
      renderSettings();
    });
    $('wcoinSaveSettingsBtn').addEventListener('click', () => {
      readSettingsFromDOM();
      saveToStorage();
      renderSettings();
      renderMesoPriceMini();
      renderRatioLine();
      const btn = $('wcoinSaveSettingsBtn');
      const original = btn.textContent;
      btn.textContent = '저장됨 ✓';
      setTimeout(() => {
        btn.textContent = original;
      }, 1200);
    });
    $('wcoinResetSettingsBtn').addEventListener('click', () => {
      if (!confirm('설정을 기본값으로 되돌릴까요? 저장된 수정 내용이 사라져요.')) return;
      settings = structuredClone(DEFAULTS);
      localStorage.removeItem(STORAGE_KEY);
      renderSettings();
      renderMesoPriceMini();
      renderRatioLine();
    });

    attachCommaFormatting($('wcoinCashInput'));
    attachCommaFormatting($('wcoinMesoInput'));
    renderSettings();
    renderMesoPriceMini();
    renderRatioLine();
  }

  function init(opts) {
    if (opts && opts.$) $ = opts.$;
    mountTemplate();
  }

  function openModal() {
    mountTemplate();
    settings = loadSettings();
    renderSettings();
    renderMesoPriceMini();
    renderRatioLine();
    const modal = $('worldcoinCalcModal');
    if (modal) modal.hidden = false;
  }

  function closeModal() {
    const modal = $('worldcoinCalcModal');
    if (modal) modal.hidden = true;
  }

  global.WorldcoinCalcApp = { init, openModal, closeModal };
})(typeof window !== 'undefined' ? window : globalThis);
