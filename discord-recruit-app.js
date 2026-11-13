/**
 * 디스코드 파티 구인글 생성기 — 메랜툴(merantool)과 동일 출력 · 장부 state/Realtime 무관
 */
(function (global) {
  let $ = (id) => document.getElementById(id);
  let root = null;

  /** §HANDOFF 5.4.1 — 디스코드 이모지: `shortcode` + `img`(PNG) 동일 파일명 권장 */
  const DISCORD_RECRUIT_EMOJI_CATALOG = [
    { shortcode: ':star:', img: 'image/discord-emojis/star.png' },
    { shortcode: ':skull:', img: 'image/discord-emojis/skull.png' },
    { shortcode: ':classical_building:', img: 'image/discord-emojis/classical_building.png' },
    { shortcode: ':wing:', img: 'image/discord-emojis/wing.png' },
    { shortcode: ':hatching_chick:', img: 'image/discord-emojis/hatching_chick.png' },
    { shortcode: ':man_climbing:', img: 'image/discord-emojis/man_climbing.png' },
    { shortcode: ':mage:', img: 'image/discord-emojis/mage.png' },
    { shortcode: ':blue_heart:', img: 'image/discord-emojis/blue_heart.png' },
    { shortcode: ':bear:', img: 'image/discord-emojis/bear.png' },
    { shortcode: ':teddy_bear:', img: 'image/discord-emojis/teddy_bear.png' },
    { shortcode: ':fish:', img: 'image/discord-emojis/fish.png' },
    { shortcode: ':oncoming_bus:', img: 'image/discord-emojis/oncoming_bus.png' },
    { shortcode: ':troll:', img: 'image/discord-emojis/troll.png' },
    { shortcode: ':bird:', img: 'image/discord-emojis/bird.png' },
    { shortcode: ':squid:', img: 'image/discord-emojis/squid.png' },
  ];

  const rs = {
    selectedEmoji: '',
    /** 동일 shortcode(`:mage:` 등) 복수일 때 미리보기·선택 구분 */
    selectedDiscordImg: '',
    slots: [],
    slotIdCounter: 0,
    partySize: 0,
    layoutFormat: '',
    spot: '',
    extra: '',
  };

  const POSITION_CUSTOM_VALUE = '직접입력';
  const POSITION_DEFAULT = '설정X';
  /** 예전 로컬 전용 키 — 1회 클라우드로 옮긴 뒤 제거 */
  const PRESET_LEGACY_LOCAL_KEY = 'discord_recruit_presets_v1';
  const PRESET_MAX = 40;

  let presetGetList = null;
  let presetSetList = null;
  let presetFlushSave = null;
  let presetListDirty = false;
  /** bindRecruitUi 안의 renderPresetPickList — 모달 밖에서 호출할 때만 사용 */
  let paintPresetPickList = null;
  const POSITION_GROUPS = [
    { label: '경심', options: ['프리', '힐케어', '경심', '매미심', '비숍', '띱숍', '배달심', '메용20숍'] },
    { label: '좌우자리', options: ['좌', '좌1', '좌2', '좌3', '좌4', '우', '우1', '우2', '우3', '우4'] },
    { label: '층자리', options: ['1층', '2층', '3층', '4층', '5층', '바닥', '중앙', '중옥', '옥상'] },
    { label: '꾼', options: ['버블꾼', '나무꾼', '노팟꾼', '파티꾼'] },
    { label: '띱자리', options: ['띱', '2.5띱', '띱숍'] },
    { label: '깐부', options: ['저깐', '중깐', '고깐'] },
    { label: '기사', options: ['좌기사', '우기사'] },
    { label: '기타', options: ['설정X', POSITION_CUSTOM_VALUE] },
  ];

  function q(id) {
    return root ? root.querySelector('#' + id) : null;
  }
  function qa(sel) {
    return root ? root.querySelectorAll(sel) : [];
  }

  const MOUNT_HTML = `
    <div id="recruit-create">
      <div class="dr-grid">
        <div class="dr-panel">
          <div class="dr-panel-title">구인 정보</div>
          <div class="dr-preset-bar">
            <div class="dr-preset-label">사냥터 프리셋 <span class="dr-hint">(공대 방 클라우드 · 같은 room 링크면 공유)</span></div>
            <div class="dr-preset-row">
              <select id="recruit-preset-pick" class="dr-input dr-preset-pick" aria-label="저장된 프리셋">
                <option value="">— 불러올 프리셋 —</option>
              </select>
              <button type="button" class="btn-light btn-sm" id="recruit-preset-load">불러오기</button>
              <button type="button" class="btn-light btn-sm" id="recruit-preset-delete">삭제</button>
            </div>
            <div class="dr-preset-row">
              <input type="text" id="recruit-preset-name" class="dr-input" placeholder="저장 이름 (예: 블와둥 고정자리)" maxlength="48" autocomplete="off">
              <button type="button" class="btn-settle btn-sm" id="recruit-preset-save">현재 설정 저장</button>
            </div>
            <p class="dr-preset-msg" id="recruit-preset-msg" hidden></p>
          </div>
          <div class="dr-field">
            <label>파티 인원수</label>
            <div class="party-size-selector" id="party-size-selector">
              <button type="button" class="party-size-btn" data-size="3">3인</button>
              <button type="button" class="party-size-btn" data-size="4">4인</button>
              <button type="button" class="party-size-btn" data-size="5">5인</button>
              <button type="button" class="party-size-btn" data-size="6">6인</button>
            </div>
            <div class="layout-selector" id="layout-selector" style="display:none;"></div>
          </div>
          <div class="dr-field recruit-inputs-disabled">
            <label for="recruit-emoji">사냥터 이모티콘</label>
            <p class="dr-emoji-hint">유니코드는 그대로 · 디스코드 이모지는 <strong>:이름:</strong> 형태로 복사됩니다</p>
            <div class="emoji-picker" id="emoji-picker">
              <button type="button" class="emoji-btn emoji-btn-none" data-emoji="" title="없음">✕</button>
              <button type="button" class="emoji-btn" data-emoji="🔥">🔥</button>
              <button type="button" class="emoji-btn" data-emoji="🌿">🌿</button>
              <button type="button" class="emoji-btn" data-emoji="❄️">❄️</button>
              <button type="button" class="emoji-btn" data-emoji="✨">✨</button>
              <button type="button" class="emoji-btn" data-emoji="❤️">❤️</button>
              <button type="button" class="emoji-btn" data-emoji="💀">💀</button>
              <button type="button" class="emoji-btn" data-emoji="🐉">🐉</button>
              <button type="button" class="emoji-btn" data-emoji="🐛">🐛</button>
              <button type="button" class="emoji-btn" data-emoji="🌲">🌲</button>
              <button type="button" class="emoji-btn" data-emoji="🌙">🌙</button>
              <button type="button" class="emoji-btn" data-emoji="⚡">⚡</button>
              <button type="button" class="emoji-btn" data-emoji="🎩">🎩</button>
              <button type="button" class="emoji-btn" data-emoji="🛡️">🛡️</button>
              <button type="button" class="emoji-btn" data-emoji="⚔️">⚔️</button>
              <button type="button" class="emoji-btn" data-emoji="🏹">🏹</button>
              <button type="button" class="emoji-btn" data-emoji="💨">💨</button>
              <button type="button" class="emoji-btn" data-emoji="🐎">🐎</button>
              <button type="button" class="emoji-btn" data-emoji="🧊">🧊</button>
            </div>
            <div class="dr-emoji-label">디스코드 서버 이모지</div>
            <div class="discord-emoji-picker" id="discord-emoji-picker"></div>
            <div id="recruit-emoji-preview" class="recruit-emoji-preview" aria-live="polite"></div>
            <input type="hidden" id="recruit-emoji" value="">
          </div>
          <div class="dr-field recruit-inputs-disabled">
            <label for="recruit-spot">사냥터 이름</label>
            <input type="text" id="recruit-spot" class="dr-input" placeholder="블와둥/블루와이번의둥지">
          </div>
          <div class="dr-field recruit-inputs-disabled">
            <label for="recruit-extra">추가 정보 <span class="dr-hint">(은갈/알목, 레벨 제한 등)</span></label>
            <input type="text" id="recruit-extra" class="dr-input" placeholder="예: 150보마/샾메M/은갈/알목">
          </div>
        </div>
        <div class="dr-panel" id="recruit-right-panel">
          <div class="dr-panel-title">미리보기</div>
          <div class="recruit-preview" id="recruit-preview">
            <div class="recruit-preview-text empty-state" id="recruit-preview-text">왼쪽에서 정보를 입력하면 여기에 미리보기가 표시됩니다</div>
          </div>
          <button type="button" class="btn-settle" id="btn-copy-recruit">📋 복사하기</button>
          <div class="recruit-copy-toast" id="recruit-copy-toast">복사되었습니다!</div>
          <div class="dr-panel-title dr-panel-title--sub">자리 설정</div>
          <div id="recruit-slots-notice" class="recruit-disabled-notice">
            <span class="dr-warn">⚠ 파티 총 인원수를 먼저 선택해주세요</span>
          </div>
          <div id="recruit-slots-wrapper" class="recruit-disabled">
            <div id="recruit-slots"></div>
          </div>
          <button type="button" class="btn-light dr-reset" id="btn-reset-recruit">↺ 초기화</button>
          <div class="recruit-tip-box">
            <div class="recruit-tip-title">자리설정 Tip</div>
            <ol class="recruit-tip-list">
              <li><span class="tip-highlight">상태</span> 🟢 = 구인중, 🔴 = 구인완료. 원을 클릭하면 전환됩니다.</li>
              <li><span class="tip-highlight">비용</span> 50+50, 심50+샾50 등 여러 형태 가능.</li>
              <li><span class="tip-highlight">타입</span> 지참 (숫자), 지원 (숫자지원) 자동 출력.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  `;

  function mountTemplate() {
    const el = $('discordRecruitApp');
    if (!el) return;
    el.innerHTML = MOUNT_HTML;
    root = el;
    bindRecruitUi();
  }

  function bindRecruitUi() {
  paintPresetPickList = null;
  // Layout options per party size
  var layoutOptions = {
    3: [{ key: '2+1', label: '2+1 양식' }],
    4: [{ key: '2+2', label: '2+2 양식' }],
    5: [
      { key: '3+2', label: '3+2 양식' },
      { key: '1+2+2', label: '1+2+2 양식' },
    ],
    6: [
      { key: '3+3', label: '3+3 양식' },
      { key: '1+3+2', label: '1+3+2 양식' },
    ],
  };

  // How slots distribute across lines per layout
  // Each array = [line1_count, line2_count, line3_count]
  // For layouts with slots on header line: first element is header-line slots
  var layoutDistribution = {
    '2+1': [0, 2, 1],
    '2+2': [0, 2, 2],
    '3+2': [0, 3, 2],
    '1+2+2': [1, 2, 2],
    '3+3': [0, 3, 3],
    '1+3+2': [1, 3, 2],
    '2+2+2': [2, 2, 2],
  };

  /* --- DOM refs --- */
  var modeCreatePanel = q('recruit-create');
  var emojiInput = q('recruit-emoji');
  var emojiPreviewEl = q('recruit-emoji-preview');
  var spotInput = q('recruit-spot');
  var extraInput = q('recruit-extra');
  var slotsContainer = q('recruit-slots');
  var previewText = q('recruit-preview-text');
  var copyBtn = q('btn-copy-recruit');
  var copyToast = q('recruit-copy-toast');
  var partySizeSelector = q('party-size-selector');
  var layoutSelector = q('layout-selector');
  var slotsWrapper = q('recruit-slots-wrapper');
  var slotsNotice = q('recruit-slots-notice');

  // Input fields that should be disabled until party size selected
  var recruitInputFields = [
    q('recruit-emoji') ? q('recruit-emoji').closest('.dr-field') : null,
    q('recruit-spot') ? q('recruit-spot').closest('.dr-field') : null,
    q('recruit-extra') ? q('recruit-extra').closest('.dr-field') : null
  ].filter(Boolean);
  var emojiPickerEl = q('emoji-picker');

  if (!modeCreatePanel) return; // guard if tab not present

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function catalogEntryForShortcode(shortcode) {
    for (var ci = 0; ci < DISCORD_RECRUIT_EMOJI_CATALOG.length; ci++) {
      if (DISCORD_RECRUIT_EMOJI_CATALOG[ci].shortcode === shortcode) {
        return DISCORD_RECRUIT_EMOJI_CATALOG[ci];
      }
    }
    return null;
  }

  function discordInlineImgHtml(shortcode, imgPath) {
    var src = imgPath;
    if (!src) {
      var entry = catalogEntryForShortcode(shortcode);
      src = entry ? entry.img : '';
    }
    if (!src) return escapeHtml(shortcode);
    return '<img class="dr-discord-inline-img" src="' + src + '" alt="" width="22" height="22" decoding="async" draggable="false" title="' + escapeHtml(shortcode) + '">';
  }

  function previewHtmlFromPlainText(text) {
    var html = escapeHtml(text);
    var seen = {};
    if (rs.selectedEmoji && rs.selectedDiscordImg && rs.selectedEmoji.indexOf(':') === 0) {
      var selHtml = discordInlineImgHtml(rs.selectedEmoji, rs.selectedDiscordImg);
      html = html.split(rs.selectedEmoji).join(selHtml);
      seen[rs.selectedEmoji] = true;
    }
    DISCORD_RECRUIT_EMOJI_CATALOG.forEach(function(entry) {
      if (seen[entry.shortcode]) return;
      seen[entry.shortcode] = true;
      var img = discordInlineImgHtml(entry.shortcode);
      html = html.split(entry.shortcode).join(img);
    });
    return html.replace(/\n/g, '<br>');
  }

  function clearEmojiButtonSelection() {
    qa('#emoji-picker .emoji-btn').forEach(function(b) { b.classList.remove('selected'); });
    qa('#discord-emoji-picker .discord-emoji-btn').forEach(function(b) { b.classList.remove('selected'); });
    var noneBtn = emojiPickerEl ? emojiPickerEl.querySelector('.emoji-btn-none') : null;
    if (noneBtn) noneBtn.classList.add('selected');
  }

  function updateEmojiPreviewUi() {
    if (!emojiPreviewEl) return;
    if (!rs.selectedEmoji) {
      emojiPreviewEl.innerHTML = '<span class="dr-muted">선택 없음</span>';
      if (emojiInput) emojiInput.value = '';
      rs.selectedDiscordImg = '';
      return;
    }
    if (emojiInput) emojiInput.value = rs.selectedEmoji;
    if (rs.selectedEmoji.charAt(0) === ':' && rs.selectedEmoji.charAt(rs.selectedEmoji.length - 1) === ':') {
      emojiPreviewEl.innerHTML = discordInlineImgHtml(rs.selectedEmoji, rs.selectedDiscordImg) + ' <span class="dr-shortcode">' + escapeHtml(rs.selectedEmoji) + '</span>';
    } else {
      emojiPreviewEl.textContent = rs.selectedEmoji;
    }
  }

  function mountDiscordEmojiPicker() {
    var host = q('discord-emoji-picker');
    if (!host) return;
    host.innerHTML = '';
    DISCORD_RECRUIT_EMOJI_CATALOG.forEach(function(entry) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'discord-emoji-btn emoji-btn';
      btn.setAttribute('data-shortcode', entry.shortcode);
      btn.setAttribute('data-img', entry.img);
      btn.title = entry.shortcode;
      btn.setAttribute('aria-label', entry.shortcode);
      var img = document.createElement('img');
      img.src = entry.img;
      img.alt = '';
      img.width = 32;
      img.height = 32;
      img.decoding = 'async';
      img.draggable = false;
      btn.appendChild(img);
      btn.addEventListener('click', function() {
        qa('#emoji-picker .emoji-btn').forEach(function(b) { b.classList.remove('selected'); });
        if (rs.selectedDiscordImg === entry.img) {
          rs.selectedEmoji = '';
          rs.selectedDiscordImg = '';
          clearEmojiButtonSelection();
        } else {
          rs.selectedEmoji = entry.shortcode || '';
          rs.selectedDiscordImg = entry.img;
          qa('#discord-emoji-picker .discord-emoji-btn').forEach(function(b) { b.classList.remove('selected'); });
          btn.classList.add('selected');
        }
        updateEmojiPreviewUi();
        updatePreview();
      });
      host.appendChild(btn);
    });
  }

  mountDiscordEmojiPicker();
  updateEmojiPreviewUi();

  // Initially disable all input fields
  setInputsDisabled(true);

  function setInputsDisabled(disabled) {
    recruitInputFields.forEach(function(field) {
      if (disabled) {
        field.classList.add('recruit-inputs-disabled');
      } else {
        field.classList.remove('recruit-inputs-disabled');
      }
    });
    if (slotsWrapper) {
      if (disabled) {
        slotsWrapper.classList.add('recruit-disabled');
      } else {
        slotsWrapper.classList.remove('recruit-disabled');
      }
    }
    if (slotsNotice) {
      if (disabled) {
        slotsNotice.classList.remove('hidden');
      } else {
        slotsNotice.classList.add('hidden');
      }
    }
  }

  /* --- Party Size Selection --- */
  if (partySizeSelector) {
    var sizeBtns = partySizeSelector.querySelectorAll('.party-size-btn');
    sizeBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var newSize = parseInt(this.getAttribute('data-size'));

        // If same size clicked again, do nothing
        if (newSize === rs.partySize) return;

        // Size changed → reset everything
        rs.partySize = newSize;

        // Clear all slots and inputs since party size changed
        rs.slots = [];
        rs.slotIdCounter = 0;
        rs.selectedEmoji = '';
        rs.selectedDiscordImg = '';
        rs.spot = '';
        rs.extra = '';
        if (spotInput) spotInput.value = '';
        if (extraInput) extraInput.value = '';
        clearEmojiButtonSelection();
        updateEmojiPreviewUi();
        rs.layoutFormat = '';

        // Update active button
        sizeBtns.forEach(function(b) { b.classList.remove('active'); });
        this.classList.add('active');

        // Show layout options
        updateLayoutButtons();

        // Enable inputs
        setInputsDisabled(false);

        updatePreview();
      });
    });
  }

  function mountLayoutButtonHandlers() {
    if (!layoutSelector) return;
    layoutSelector.querySelectorAll('.layout-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var newLayout = this.getAttribute('data-layout');
        layoutSelector.querySelectorAll('.layout-btn').forEach(function(b) {
          b.classList.remove('active');
        });
        this.classList.add('active');
        var oldLayout = rs.layoutFormat;
        rs.layoutFormat = newLayout;
        if (!oldLayout) {
          autoCreateSlots();
        } else {
          updateExtraFieldVisibility();
          renderSlots();
          updatePreview();
        }
      });
    });
  }

  function paintLayoutButtons() {
    if (!layoutSelector) return;
    var options = layoutOptions[rs.partySize] || [];
    if (options.length <= 1) {
      layoutSelector.style.display = 'none';
      layoutSelector.innerHTML = '';
      return;
    }
    layoutSelector.style.display = 'flex';
    layoutSelector.innerHTML = '';
    options.forEach(function(opt) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'layout-btn';
      btn.setAttribute('data-layout', opt.key);
      btn.textContent = opt.label;
      if (rs.layoutFormat === opt.key) btn.classList.add('active');
      layoutSelector.appendChild(btn);
    });
    mountLayoutButtonHandlers();
  }

  function updateLayoutButtons() {
    if (!layoutSelector) return;
    var options = layoutOptions[rs.partySize] || [];

    if (options.length <= 1) {
      layoutSelector.style.display = 'none';
      layoutSelector.innerHTML = '';
      if (options.length === 1) {
        if (!rs.layoutFormat) rs.layoutFormat = options[0].key;
        if (rs.slots.length === 0) autoCreateSlots();
      }
      return;
    }

    if (!rs.layoutFormat) {
      rs.layoutFormat = options[0].key;
    }
    paintLayoutButtons();
    if (rs.slots.length === 0) {
      autoCreateSlots();
    } else {
      updateExtraFieldVisibility();
      renderSlots();
      updatePreview();
    }
  }

  function updateExtraFieldVisibility() {
    // Hide extra info for layouts with slots on header line (1+2+2, 1+3+2, 2+2+2)
    var extraField = extraInput ? extraInput.closest('.dr-field') : null;
    if (!extraField) return;
    var dist = layoutDistribution[rs.layoutFormat];
    if (dist && dist[0] > 0) {
      extraField.style.display = 'none';
      if (extraInput) extraInput.value = '';
    } else {
      extraField.style.display = '';
    }
  }

  function autoCreateSlots() {
    if (!rs.partySize || !rs.layoutFormat) return;

    updateExtraFieldVisibility();

    // Only create if no slots exist (preserve on layout switch within same size)
    if (rs.slots.length === 0) {
      var dist = layoutDistribution[rs.layoutFormat];
      if (!dist) return;
      var total = dist.reduce(function(a, b) { return a + b; }, 0);
      for (var i = 0; i < total; i++) {
        var id = createSlotId();
        rs.slots.push({
          id: id,
          position: POSITION_DEFAULT,
          positionCustom: '',
          name: '',
          condition: '',
          feeType: 'bring',
          status: 'open'
        });
      }
    }
    renderSlots();
    updatePreview();
  }

  /* --- Emoji Picker --- */
  var emojiBtns = qa('#emoji-picker .emoji-btn');
  emojiBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var emoji = this.getAttribute('data-emoji') || '';
      qa('#discord-emoji-picker .discord-emoji-btn').forEach(function(b) { b.classList.remove('selected'); });
      if (emoji === '' || rs.selectedEmoji === emoji) {
        rs.selectedEmoji = '';
        rs.selectedDiscordImg = '';
        clearEmojiButtonSelection();
      } else {
        rs.selectedEmoji = emoji;
        rs.selectedDiscordImg = '';
        emojiBtns.forEach(function(b) { b.classList.remove('selected'); });
        this.classList.add('selected');
      }
      updateEmojiPreviewUi();
      updatePreview();
    });
  });

  /* --- Input change listeners for real-time preview --- */
  if (spotInput) {
    spotInput.addEventListener('input', function() {
      rs.spot = spotInput.value;
      updatePreview();
    });
  }
  if (extraInput) {
    extraInput.addEventListener('input', function() {
      rs.extra = extraInput.value;
      updatePreview();
    });
  }

  /* --- Slot Management --- */
  function createSlotId() {
    rs.slotIdCounter++;
    return 'slot-' + rs.slotIdCounter;
  }

  function resolvePositionOutput(slot) {
    if (slot.position === POSITION_CUSTOM_VALUE) {
      return (slot.positionCustom || '').trim();
    }
    return slot.position || '';
  }

  function buildPositionSelect(slot) {
    var selectedVal = slot.position || POSITION_DEFAULT;
    var html = '';
    POSITION_GROUPS.forEach(function(group) {
      html += '<optgroup label="' + escapeHtml(group.label) + '">';
      group.options.forEach(function(opt) {
        html += '<option value="' + escapeHtml(opt) + '"' + (selectedVal === opt ? ' selected' : '') + '>' + escapeHtml(opt) + '</option>';
      });
      html += '</optgroup>';
    });
    return html;
  }

  function renderSlots() {
    if (!slotsContainer) return;
    slotsContainer.innerHTML = '';

    if (rs.slots.length === 0) {
      
      return;
    }

    // Compact table layout
    var table = document.createElement('div');
    table.className = 'slot-table';

    // Header row
    table.innerHTML =
      '<div class="slot-table-header">' +
        '<span class="st-col st-col-num">#</span>' +
        '<span class="st-col st-col-status">\uc0c1\ud0dc</span>' +
        '<span class="st-col st-col-pos">\uc704\uce58</span>' +
        '<span class="st-col st-col-name">\ub808\ubca8/\uc9c1\uc5c5 <small style="color:var(--color-text-muted);font-weight:normal;">\uba58\ud2b8\ub3c4 \ucd94\uac00 \uac00\ub2a5</small></span>' +
        '<span class="st-col st-col-fee">\ube44\uc6a9</span>' +
        '<span class="st-col st-col-type">\ud0c0\uc785</span>' +
      '</div>';

    slotsContainer.appendChild(table);

    rs.slots.forEach(function(slot, idx) {
      var row = document.createElement('div');
      row.className = 'slot-table-row';
      row.setAttribute('data-slot-id', slot.id);

      var ft = slot.feeType || 'bring';
      var isOpen = slot.status === 'open';
      var statusEmoji = isOpen ? '\uD83D\uDFE2' : '\uD83D\uDD34';
      var nameDisabledClass = isOpen ? ' slot-name-disabled' : '';

      row.innerHTML =
        '<span class="st-col st-col-num">' + (idx + 1) + '</span>' +
        '<span class="st-col st-col-status">' +
          '<button type="button" class="slot-status-toggle" data-status="' + slot.status + '" title="\ud074\ub9ad\ud558\uba74 \uad6c\uc778\uc911/\uad6c\uc778\uc644 \uc804\ud658">' + statusEmoji + '</button>' +
        '</span>' +
        '<span class="st-col st-col-pos st-col-pos-wrap">' +
          '<select class="slot-position" tabindex="' + (10 + idx * 4) + '">' + buildPositionSelect(slot) + '</select>' +
          '<input type="text" class="slot-position-custom" placeholder="자리 이름" value="' + escapeHtml(slot.positionCustom || '') + '" tabindex="' + (10 + idx * 4 + 1) + '"' +
            (slot.position === POSITION_CUSTOM_VALUE ? '' : ' hidden') + '>' +
        '</span>' +
        '<span class="st-col st-col-name' + nameDisabledClass + '">' +
          '<input type="text" class="slot-name" placeholder="\uad6c\uc778\uc911" value="' + escapeHtml(slot.name || '') + '" tabindex="' + (11 + idx * 4) + '">' +
        '</span>' +
        '<span class="st-col st-col-fee">' +
          '<input type="text" class="slot-condition" placeholder="0" value="' + escapeHtml(slot.condition || '') + '" tabindex="' + (12 + idx * 4) + '">' +
        '</span>' +
        '<span class="st-col st-col-type">' +
          '<select class="slot-fee-type">' +
            '<option value="bring"' + (ft === 'bring' ? ' selected' : '') + '>\uc9c0\ucc38</option>' +
            '<option value="support"' + (ft === 'support' ? ' selected' : '') + '>\uc9c0\uc6d0</option>' +
            '<option value="free"' + (ft === 'free' ? ' selected' : '') + '>\ubb34\ub8cc</option>' +
            '<option value="none"' + (ft === 'none' ? ' selected' : '') + '>\uc5c6\uc74c</option>' +
          '</select>' +
        '</span>';

      table.appendChild(row);

      // Bind events
      var posSelect = row.querySelector('.slot-position');
      var posCustom = row.querySelector('.slot-position-custom');
      posSelect.addEventListener('change', function() {
        slot.position = this.value;
        if (posCustom) {
          if (slot.position === POSITION_CUSTOM_VALUE) {
            posCustom.hidden = false;
          } else {
            posCustom.hidden = true;
            slot.positionCustom = '';
          }
        }
        updatePreview();
      });
      if (posCustom) {
        posCustom.addEventListener('input', function() {
          slot.positionCustom = this.value;
          updatePreview();
        });
      }
      row.querySelector('.slot-name').addEventListener('input', function() {
        slot.name = this.value;
        updatePreview();
      });
      row.querySelector('.slot-condition').addEventListener('input', function() {
        slot.condition = this.value;
        updatePreview();
      });
      row.querySelector('.slot-fee-type').addEventListener('change', function() {
        slot.feeType = this.value;
        updatePreview();
      });
      row.querySelector('.slot-status-toggle').addEventListener('click', function() {
        var current = this.getAttribute('data-status');
        var next = current === 'open' ? 'filled' : 'open';
        this.setAttribute('data-status', next);
        slot.status = next;
        this.textContent = next === 'open' ? '\uD83D\uDFE2' : '\uD83D\uDD34';

        // If switching to open (구인중), clear name
        if (next === 'open') {
          slot.name = '';
        }
        // Re-render to update disabled state
        renderSlots();
        updatePreview();
      });
    });

    // 슬롯 렌더링 완료 후 오른쪽 패널 위치 재계산
    setTimeout(function() {
      
    }, 0);
  }

  /* --- Reset Button --- */
  var resetRecruitBtn = q('btn-reset-recruit');
  if (resetRecruitBtn) {
    resetRecruitBtn.addEventListener('click', function() {
      rs.slots = [];
      rs.slotIdCounter = 0;
      rs.selectedEmoji = '';
      rs.selectedDiscordImg = '';
      rs.partySize = 0;
      rs.layoutFormat = '';
      rs.spot = '';
      rs.extra = '';
      if (spotInput) spotInput.value = '';
      if (extraInput) extraInput.value = '';
      clearEmojiButtonSelection();
      updateEmojiPreviewUi();

      // Reset party size buttons
      if (partySizeSelector) {
        partySizeSelector.querySelectorAll('.party-size-btn').forEach(function(b) {
          b.classList.remove('active');
        });
      }
      if (layoutSelector) {
        layoutSelector.style.display = 'none';
        layoutSelector.innerHTML = '';
      }

      // Disable inputs again
      setInputsDisabled(true);

      renderSlots();
      updatePreview();
    });
  }

  /* --- Build slot text with fee type logic --- */
  function buildSlotText(s) {
    var statusEmoji = s.status === 'open' ? '\uD83D\uDFE2' : '\uD83D\uDD34';
    var ft = s.feeType || 'bring';
    var condStr = '';
    if (ft === 'free') {
      condStr = '(\ubb34\ub8cc)';
    } else if (s.condition) {
      if (ft === 'bring') {
        condStr = '(' + s.condition + ')';
      } else if (ft === 'support') {
        condStr = '(' + s.condition + '\uc9c0\uc6d0)';
      }
    }

    var posLabel = resolvePositionOutput(s);
    var posPrefix = (!posLabel || posLabel === '\uc124\uc815X') ? '' : posLabel + ':';

    if (s.status === 'open') {
      return statusEmoji + posPrefix + '\uad6c\uc778\uc911' + condStr;
    } else {
      var nameOrDefault = s.name ? s.name : '\uad6c\uc778\uc644';
      return statusEmoji + posPrefix + nameOrDefault + condStr;
    }
  }

  /* --- Generate Preview Text based on layout --- */
  function generatePreviewText() {
    var spot = (spotInput ? spotInput.value.trim() : '');
    var extra = (extraInput ? extraInput.value.trim() : '');
    var emoji = rs.selectedEmoji;

    if (!spot && rs.slots.length === 0) {
      return '';
    }

    var dist = layoutDistribution[rs.layoutFormat];
    if (!dist) {
      // Fallback to old behavior if no layout selected
      var lines = [];
      var header = '';
      if (emoji) {
        header += emoji + spot + emoji;
      } else {
        header += spot;
      }
      if (extra) header += ' ' + extra;
      if (header) lines.push(header);

      var slotTexts = rs.slots.map(buildSlotText);
      if (slotTexts.length > 0) lines.push(slotTexts.slice(0, 3).join(' '));
      if (slotTexts.length > 3) lines.push(slotTexts.slice(3, 6).join(' '));
      return lines.join('\n');
    }

    var lines = [];
    var slotTexts = rs.slots.map(buildSlotText);
    var slotIdx = 0;

    // Line 1: Header + possibly some slots (1+2+2, 1+3+2, 2+2+2 …)
    var headerSlotsCount = dist[0]; // slots on header line
    var header = '';
    if (emoji) {
      header += emoji + spot + emoji;
    } else {
      header += spot;
    }
    if (extra) header += ' ' + extra;

    if (headerSlotsCount > 0) {
      var headerSlots = slotTexts.slice(slotIdx, slotIdx + headerSlotsCount);
      slotIdx += headerSlotsCount;
      if (header) {
        header += ' ' + headerSlots.join(' ');
      } else {
        header = headerSlots.join(' ');
      }
    }
    if (header) lines.push(header);

    // Line 2
    var line2Count = dist[1];
    if (line2Count > 0 && slotIdx < slotTexts.length) {
      var line2Slots = slotTexts.slice(slotIdx, slotIdx + line2Count);
      slotIdx += line2Count;
      lines.push(line2Slots.join(' '));
    }

    // Line 3
    var line3Count = dist[2];
    if (line3Count > 0 && slotIdx < slotTexts.length) {
      var line3Slots = slotTexts.slice(slotIdx, slotIdx + line3Count);
      slotIdx += line3Count;
      lines.push(line3Slots.join(' '));
    }

    return lines.join('\n');
  }

  function updatePreview() {
    if (!previewText) return;
    var text = generatePreviewText();
    if (text) {
      previewText.innerHTML = previewHtmlFromPlainText(text);
      previewText.classList.remove('empty-state');
    } else {
      previewText.textContent = '\uc67c\ucabd\uc5d0\uc11c \uc815\ubcf4\ub97c \uc785\ub825\ud558\uba74 \uc5ec\uae30\uc5d0 \ubbf8\ubcf4\uae30\uac00 \ud45c\uc2dc\ub529\ub2c8\ub2e4';
      previewText.classList.add('empty-state');
    }
  }

  /* --- Copy to Clipboard --- */
  function copyToClipboard(text, toastEl) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(function() {
      showToast(toastEl);
    }).catch(function() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast(toastEl);
    });
  }

  function showToast(toastEl) {
    if (!toastEl) return;
    toastEl.classList.remove('show');
    void toastEl.offsetWidth;
    toastEl.classList.add('show');
    setTimeout(function() {
      toastEl.classList.remove('show');
    }, 1600);
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', function() {
      var text = generatePreviewText();
      copyToClipboard(text, copyToast);
    });
  }

  var presetPick = q('recruit-preset-pick');
  var presetNameInput = q('recruit-preset-name');
  var presetMsg = q('recruit-preset-msg');

  function normalizePresetList(list) {
    if (!Array.isArray(list)) return [];
    var out = [];
    for (var i = 0; i < list.length && out.length < PRESET_MAX; i++) {
      var item = list[i];
      if (!item || typeof item !== 'object') continue;
      var name = String(item.name || '').trim();
      if (!name) continue;
      var data = item.data;
      if (!data || typeof data !== 'object') continue;
      out.push({
        id: String(item.id || ('pr_' + Date.now() + '_' + i)),
        name: name,
        savedAt: typeof item.savedAt === 'number' ? item.savedAt : Date.now(),
        data: data,
      });
    }
    return out;
  }

  function readPresetList() {
    if (presetGetList) {
      return normalizePresetList(presetGetList());
    }
    return [];
  }

  function writePresetList(list) {
    var normalized = normalizePresetList(list);
    if (presetSetList) presetSetList(normalized);
    if (presetFlushSave) presetFlushSave();
  }

  function tryMigrateLegacyLocalPresets() {
    if (!presetGetList || !presetSetList) return;
    if (readPresetList().length > 0) return;
    try {
      var raw = localStorage.getItem(PRESET_LEGACY_LOCAL_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || !parsed.length) return;
      presetSetList(normalizePresetList(parsed));
      localStorage.removeItem(PRESET_LEGACY_LOCAL_KEY);
      if (presetFlushSave) presetFlushSave();
    } catch (e) { /* ignore */ }
  }

  function showPresetMsg(text, isError) {
    if (!presetMsg) return;
    if (!text) {
      presetMsg.hidden = true;
      presetMsg.textContent = '';
      presetMsg.classList.remove('dr-preset-msg--err');
      return;
    }
    presetMsg.hidden = false;
    presetMsg.textContent = text;
    presetMsg.classList.toggle('dr-preset-msg--err', !!isError);
  }

  function renderPresetPickList() {
    presetListDirty = false;
    if (!presetPick) return;
    var list = readPresetList();
    list.sort(function(a, b) {
      return (b.savedAt || 0) - (a.savedAt || 0);
    });
    var selected = presetPick.value;
    presetPick.innerHTML = '<option value="">— 불러올 프리셋 —</option>';
    list.forEach(function(item) {
      var opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = item.name;
      presetPick.appendChild(opt);
    });
    if (selected && list.some(function(p) { return p.id === selected; })) {
      presetPick.value = selected;
    }
  }

  function snapshotRecruitState() {
    return {
      partySize: rs.partySize,
      layoutFormat: rs.layoutFormat,
      selectedEmoji: rs.selectedEmoji,
      selectedDiscordImg: rs.selectedDiscordImg,
      spot: rs.spot,
      extra: rs.extra,
      slots: rs.slots.map(function(s) {
        return {
          position: s.position,
          positionCustom: s.positionCustom,
          name: s.name,
          condition: s.condition,
          feeType: s.feeType,
          status: s.status,
        };
      }),
    };
  }

  function applyRecruitSnapshot(data) {
    if (!data) return false;
    rs.partySize = parseInt(data.partySize, 10) || 0;
    rs.layoutFormat = data.layoutFormat || '';
    rs.selectedEmoji = data.selectedEmoji || '';
    rs.selectedDiscordImg = data.selectedDiscordImg || '';
    rs.spot = data.spot || '';
    rs.extra = data.extra || '';
    rs.slots = [];
    rs.slotIdCounter = 0;
    (data.slots || []).forEach(function(s) {
      rs.slots.push({
        id: createSlotId(),
        position: s.position || POSITION_DEFAULT,
        positionCustom: s.positionCustom || '',
        name: s.name || '',
        condition: s.condition || '',
        feeType: s.feeType || 'bring',
        status: s.status || 'open',
      });
    });
    syncFormFromState();
    return true;
  }

  function saveCurrentPreset() {
    var name = (presetNameInput && presetNameInput.value || '').trim();
    if (!name) {
      showPresetMsg('저장할 이름을 입력해 주세요.', true);
      return;
    }
    if (!rs.partySize || !rs.layoutFormat) {
      showPresetMsg('파티 인원·양식을 선택한 뒤 저장할 수 있어요.', true);
      return;
    }
    var list = readPresetList();
    var data = snapshotRecruitState();
    var existing = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].name === name) {
        existing = i;
        break;
      }
    }
    var entry = {
      id: existing >= 0 ? list[existing].id : ('pr_' + Date.now()),
      name: name,
      savedAt: Date.now(),
      data: data,
    };
    if (existing >= 0) {
      list[existing] = entry;
    } else {
      if (list.length >= PRESET_MAX) {
        list.sort(function(a, b) { return (a.savedAt || 0) - (b.savedAt || 0); });
        list.shift();
      }
      list.push(entry);
    }
    writePresetList(list);
    renderPresetPickList();
    if (presetPick) presetPick.value = entry.id;
    showPresetMsg('「' + name + '」 저장됨');
    setTimeout(function() { showPresetMsg(''); }, 2200);
  }

  var presetSaveBtn = q('recruit-preset-save');
  var presetLoadBtn = q('recruit-preset-load');
  var presetDeleteBtn = q('recruit-preset-delete');
  if (presetSaveBtn) presetSaveBtn.addEventListener('click', saveCurrentPreset);
  if (presetLoadBtn) {
    presetLoadBtn.addEventListener('click', function() {
      var id = presetPick ? presetPick.value : '';
      if (!id) {
        showPresetMsg('불러올 프리셋을 선택해 주세요.', true);
        return;
      }
      var list = readPresetList();
      var found = null;
      for (var j = 0; j < list.length; j++) {
        if (list[j].id === id) {
          found = list[j];
          break;
        }
      }
      if (!found) {
        showPresetMsg('프리셋을 찾지 못했어요. 목록을 새로고침합니다.', true);
        renderPresetPickList();
        return;
      }
      applyRecruitSnapshot(found.data);
      if (presetNameInput) presetNameInput.value = found.name;
      showPresetMsg('「' + found.name + '」 불러옴');
      setTimeout(function() { showPresetMsg(''); }, 2200);
    });
  }
  if (presetDeleteBtn) {
    presetDeleteBtn.addEventListener('click', function() {
      var id = presetPick ? presetPick.value : '';
      if (!id) {
        showPresetMsg('삭제할 프리셋을 선택해 주세요.', true);
        return;
      }
      var list = readPresetList();
      var target = null;
      for (var k = 0; k < list.length; k++) {
        if (list[k].id === id) {
          target = list[k];
          break;
        }
      }
      if (!target) {
        renderPresetPickList();
        return;
      }
      if (!window.confirm('「' + target.name + '」 프리셋을 삭제할까요?')) return;
      list = list.filter(function(p) { return p.id !== id; });
      writePresetList(list);
      renderPresetPickList();
      showPresetMsg('삭제됨');
      setTimeout(function() { showPresetMsg(''); }, 1600);
    });
  }

  function syncFormFromState() {
    if (spotInput) spotInput.value = rs.spot;
    if (extraInput) extraInput.value = rs.extra;
    if (partySizeSelector) {
      partySizeSelector.querySelectorAll('.party-size-btn').forEach(function(b) {
        b.classList.toggle('active', parseInt(b.getAttribute('data-size'), 10) === rs.partySize);
      });
    }
    if (rs.partySize > 0) {
      setInputsDisabled(false);
      if (rs.layoutFormat) {
        paintLayoutButtons();
        updateExtraFieldVisibility();
        renderSlots();
      } else {
        updateLayoutButtons();
      }
    } else {
      setInputsDisabled(true);
    }
    if (rs.selectedEmoji) {
      var isDiscord = rs.selectedEmoji.charAt(0) === ':' && rs.selectedEmoji.charAt(rs.selectedEmoji.length - 1) === ':';
      if (isDiscord) {
        qa('#discord-emoji-picker .discord-emoji-btn').forEach(function(b) {
          b.classList.toggle('selected', rs.selectedDiscordImg
            ? b.getAttribute('data-img') === rs.selectedDiscordImg
            : b.getAttribute('data-shortcode') === rs.selectedEmoji);
        });
      } else {
        qa('#emoji-picker .emoji-btn').forEach(function(b) {
          b.classList.toggle('selected', b.getAttribute('data-emoji') === rs.selectedEmoji);
        });
      }
    } else {
      clearEmojiButtonSelection();
    }
    updateEmojiPreviewUi();
    updatePreview();
  }

  syncFormFromState();
  renderPresetPickList();
  paintPresetPickList = renderPresetPickList;

  }

  function init(opts) {
    if (opts && opts.$) $ = opts.$;
    if (opts && opts.getPresets) presetGetList = opts.getPresets;
    if (opts && opts.setPresets) presetSetList = opts.setPresets;
    if (opts && opts.flushSave) presetFlushSave = opts.flushSave;
    tryMigrateLegacyLocalPresets();
  }

  function refreshPresetList() {
    presetListDirty = true;
    if (root && paintPresetPickList) {
      paintPresetPickList();
      presetListDirty = false;
    }
  }

  function openModal() {
    const modal = $('discordRecruitModal');
    if (modal) {
      modal.hidden = false;
      modal.removeAttribute('hidden');
    }
    try {
      mountTemplate();
      if (presetListDirty && paintPresetPickList) {
        paintPresetPickList();
        presetListDirty = false;
      }
    } catch (err) {
      console.error('[DiscordRecruitApp] mount failed', err);
      const el = $('discordRecruitApp');
      if (el) {
        el.innerHTML = '<p class="dr-warn">구인글 화면을 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.</p>';
      }
    }
  }

  function closeModal() {
    const modal = $('discordRecruitModal');
    if (modal) modal.hidden = true;
  }

  global.DiscordRecruitApp = {
    init,
    openModal,
    closeModal,
    refreshPresetList,
    normalizePresetList,
  };
})(typeof window !== 'undefined' ? window : globalThis);
