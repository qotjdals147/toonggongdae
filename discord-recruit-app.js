/**
 * 디스코드 파티 구인글 생성기 — 메랜툴(merantool)과 동일 출력 · 장부 state/Realtime 무관
 */
(function (global) {
  let $ = (id) => document.getElementById(id);
  let root = null;
  let mounted = false;
  let logicBound = false;

  function q(id) {
    return root ? root.querySelector('#' + id) : null;
  }
  function qa(sel) {
    return root ? root.querySelectorAll(sel) : [];
  }

  const MOUNT_HTML = `
    <div class="dr-mode-toggle">
      <button type="button" class="dr-mode-btn active" data-rmode="create">새로 만들기</button>
      <button type="button" class="dr-mode-btn" data-rmode="edit">붙여넣어 수정</button>
    </div>
    <div id="recruit-create" class="dr-mode-panel active">
      <div class="dr-grid">
        <div class="dr-panel">
          <div class="dr-panel-title">구인 정보</div>
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
            <input type="text" id="recruit-emoji" class="dr-input dr-emoji-show" placeholder="선택된 이모티콘" readonly>
          </div>
          <div class="dr-field recruit-inputs-disabled">
            <label for="recruit-spot">사냥터 이름</label>
            <input type="text" id="recruit-spot" class="dr-input" placeholder="블와둥/블루와이번의둥지">
          </div>
          <div class="dr-field recruit-inputs-disabled">
            <label for="recruit-extra">추가 정보 <span class="dr-hint">(은갈/알목, 레벨 제한 등)</span></label>
            <input type="text" id="recruit-extra" class="dr-input" placeholder="예: 150보마/샾메M/은갈/알목">
          </div>
          <div class="dr-panel-title dr-panel-title--sub">자리 설정</div>
          <div id="recruit-slots-notice" class="recruit-disabled-notice">
            <span class="dr-warn">⚠ 파티 총 인원수를 먼저 선택해주세요</span>
          </div>
          <div id="recruit-slots-wrapper" class="recruit-disabled">
            <div id="recruit-slots"></div>
          </div>
          <button type="button" class="btn-light dr-reset" id="btn-reset-recruit">↺ 초기화</button>
        </div>
        <div class="dr-panel" id="recruit-right-panel">
          <div class="dr-panel-title">미리보기</div>
          <div class="recruit-preview" id="recruit-preview">
            <div class="recruit-preview-text empty-state" id="recruit-preview-text">위에서 정보를 입력하면 여기에 미리보기가 표시됩니다</div>
          </div>
          <button type="button" class="btn-settle" id="btn-copy-recruit">📋 복사하기</button>
          <div class="recruit-copy-toast" id="recruit-copy-toast">복사되었습니다!</div>
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
    <div id="recruit-edit" class="dr-mode-panel">
      <p class="dr-edit-desc">기존 디스코드 구인글을 붙여넣으면 편집 화면으로 가져옵니다.</p>
      <textarea id="recruit-paste" class="dr-textarea" rows="10" placeholder="구인글 전체 붙여넣기"></textarea>
      <button type="button" class="btn-settle" id="btn-parse-recruit">가져오기</button>
    </div>
  `;

  function mountTemplate() {
    const el = $('discordRecruitApp');
    if (!el || mounted) return;
    mounted = true;
    el.innerHTML = MOUNT_HTML;
    root = el;
    if (!logicBound) {
      bindRecruitUi();
      logicBound = true;
    }
  }

  function bindRecruitUi() {
  /* --- State --- */
  var currentMode = 'create';
  var selectedEmoji = '';
  var slots = []; // { position, name, condition, feeType, status: 'open'|'filled' }
  var slotIdCounter = 0;
  var partySize = 0; // 0 = not selected, 3~6
  var layoutFormat = ''; // e.g. '3+3', '2+2+2', '3+2', '1+2+2', '2+1', '2+2'

  // Layout options per party size
  var layoutOptions = {
    3: [{ key: '2+1', label: '2+1 양식' }],
    4: [{ key: '2+2', label: '2+2 양식' }],
    5: [{ key: '3+2', label: '3+2 양식' }, { key: '1+2+2', label: '1+2+2 양식' }],
    6: [{ key: '3+3', label: '3+3 양식' }, { key: '2+2+2', label: '2+2+2 양식' }]
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
    '2+2+2': [2, 2, 2]
  };

  /* --- DOM refs --- */
  var modeBtns = qa('.dr-mode-btn');
  var modeCreatePanel = q('recruit-create');
  var modeEditPanel = q('recruit-edit');
  var emojiInput = q('recruit-emoji');
  var spotInput = q('recruit-spot');
  var extraInput = q('recruit-extra');
  var slotsContainer = q('recruit-slots');
  var previewText = q('recruit-preview-text');
  var copyBtn = q('btn-copy-recruit');
  var copyToast = q('recruit-copy-toast');
  var pasteArea = q('recruit-paste');
  var parseBtn = q('btn-parse-recruit');
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

  /* --- Mode Toggle --- */
  modeBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var mode = this.getAttribute('data-rmode');
      currentMode = mode;
      modeBtns.forEach(function(b) { b.classList.remove('active'); });
      this.classList.add('active');
      if (mode === 'create') {
        modeCreatePanel.classList.add('active');
        if (modeEditPanel) modeEditPanel.classList.remove('active');
      } else {
        modeCreatePanel.classList.remove('active');
        if (modeEditPanel) modeEditPanel.classList.add('active');
      }
    });
  });

  /* --- Party Size Selection --- */
  if (partySizeSelector) {
    var sizeBtns = partySizeSelector.querySelectorAll('.party-size-btn');
    sizeBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var newSize = parseInt(this.getAttribute('data-size'));

        // If same size clicked again, do nothing
        if (newSize === partySize) return;

        // Size changed → reset everything
        var oldSize = partySize;
        partySize = newSize;

        // Clear all slots and inputs since party size changed
        slots = [];
        slotIdCounter = 0;
        selectedEmoji = '';
        if (emojiInput) emojiInput.value = '';
        if (spotInput) spotInput.value = '';
        if (extraInput) extraInput.value = '';
        var allEmojiBtns = qa('#emoji-picker .emoji-btn');
        allEmojiBtns.forEach(function(b) { b.classList.remove('selected'); });
        layoutFormat = '';

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

  function updateLayoutButtons() {
    if (!layoutSelector) return;
    var options = layoutOptions[partySize] || [];

    if (options.length <= 1) {
      // Auto-select the only option (3인, 4인)
      layoutSelector.style.display = 'none';
      layoutSelector.innerHTML = '';
      if (options.length === 1) {
        layoutFormat = options[0].key;
        autoCreateSlots();
      }
    } else {
      // Show layout buttons (5인, 6인)
      layoutSelector.style.display = 'flex';
      layoutSelector.innerHTML = '';
      options.forEach(function(opt) {
        var btn = document.createElement('button');
        btn.className = 'layout-btn';
        btn.setAttribute('data-layout', opt.key);
        btn.textContent = opt.label;
        btn.addEventListener('click', function() {
          var newLayout = this.getAttribute('data-layout');

          // Remove active from all layout btns
          layoutSelector.querySelectorAll('.layout-btn').forEach(function(b) {
            b.classList.remove('active');
          });
          this.classList.add('active');

          // If switching between layouts within same party size, preserve data
          var oldLayout = layoutFormat;
          layoutFormat = newLayout;

          if (!oldLayout) {
            // First time selecting layout - create slots
            autoCreateSlots();
          } else {
            updateExtraFieldVisibility();
          }
          // If switching layouts within same size, just re-render (data preserved)
          renderSlots();
          updatePreview();
        });
        layoutSelector.appendChild(btn);
      });

      // Auto-select first layout
      var firstBtn = layoutSelector.querySelector('.layout-btn');
      if (firstBtn) {
        firstBtn.classList.add('active');
        layoutFormat = options[0].key;
        autoCreateSlots();
      }
    }
  }

  function updateExtraFieldVisibility() {
    // Hide extra info for layouts with slots on header line (1+2+2, 2+2+2)
    var extraField = extraInput ? extraInput.closest('.dr-field') : null;
    if (!extraField) return;
    var dist = layoutDistribution[layoutFormat];
    if (dist && dist[0] > 0) {
      extraField.style.display = 'none';
      if (extraInput) extraInput.value = '';
    } else {
      extraField.style.display = '';
    }
  }

  function autoCreateSlots() {
    if (!partySize || !layoutFormat) return;

    updateExtraFieldVisibility();

    // Only create if no slots exist (preserve on layout switch within same size)
    if (slots.length === 0) {
      var dist = layoutDistribution[layoutFormat];
      if (!dist) return;
      var total = dist.reduce(function(a, b) { return a + b; }, 0);
      for (var i = 0; i < total; i++) {
        var id = createSlotId();
        slots.push({
          id: id,
          position: '\uc88c',
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
      emojiBtns.forEach(function(b) { b.classList.remove('selected'); });
      if (emoji === '' || selectedEmoji === emoji) {
        selectedEmoji = '';
        var noneBtn = q('#emoji-picker .emoji-btn-none');
        if (noneBtn) noneBtn.classList.add('selected');
      } else {
        selectedEmoji = emoji;
        this.classList.add('selected');
      }
      if (emojiInput) emojiInput.value = selectedEmoji || '';
      updatePreview();
    });
  });

  /* --- Input change listeners for real-time preview --- */
  if (spotInput) spotInput.addEventListener('input', updatePreview);
  if (extraInput) extraInput.addEventListener('input', updatePreview);

  /* --- Slot Management --- */
  function createSlotId() {
    slotIdCounter++;
    return 'slot-' + slotIdCounter;
  }

  // Position options for slot dropdown
  var positionOptions = [
    '\ud504\ub9ac','\ud790\ucf00\uc5b4','\uacbd\uc2ec','\ub85c\uc5b4',
    '\uc88c','\uc88c1','\uc88c2','\uc88c3',
    '\uc6b0','\uc6b01','\uc6b02','\uc6b03',
    '1\ucE35','2\ucE35','3\ucE35','4\ucE35','5\ucE35',
    '\ubc84\ube14\uafbc','\ub098\ubb34\uafbc','\ub178\ud31f\uafbc','\ud30c\ud2f0\uafbc',
    '\uc625\uc0c1','\ub771','2.5\ub771','\ub771\uc20d',
    '\ubc14\ub2e5','\uc911\uc559','\uc911\uc625',
    '\uc800\uae50','\uc911\uae50','\uace0\uae50',
    '\uc88c\uae30\uc0ac','\uc6b0\uae30\uc0ac',
    '\uc124\uc815X'
  ];

  function buildPositionSelect(selectedVal) {
    var html = '';
    positionOptions.forEach(function(opt) {
      html += '<option value="' + opt + '"' + (selectedVal === opt ? ' selected' : '') + '>' + opt + '</option>';
    });
    return html;
  }

  function renderSlots() {
    if (!slotsContainer) return;
    slotsContainer.innerHTML = '';

    if (slots.length === 0) {
      
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

    slots.forEach(function(slot, idx) {
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
        '<span class="st-col st-col-pos">' +
          '<select class="slot-position" tabindex="' + (10 + idx * 4) + '">' + buildPositionSelect(slot.position) + '</select>' +
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
      row.querySelector('.slot-position').addEventListener('change', function() {
        slot.position = this.value;
        updatePreview();
      });
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
      slots = [];
      slotIdCounter = 0;
      selectedEmoji = '';
      partySize = 0;
      layoutFormat = '';
      if (emojiInput) emojiInput.value = '';
      if (spotInput) spotInput.value = '';
      if (extraInput) extraInput.value = '';
      emojiBtns.forEach(function(b) { b.classList.remove('selected'); });

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

    var posPrefix = (s.position === '\uc124\uc815X') ? '' : s.position + ':';

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
    var emoji = selectedEmoji;

    if (!spot && slots.length === 0) {
      return '';
    }

    var dist = layoutDistribution[layoutFormat];
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

      var slotTexts = slots.map(buildSlotText);
      if (slotTexts.length > 0) lines.push(slotTexts.slice(0, 3).join(' '));
      if (slotTexts.length > 3) lines.push(slotTexts.slice(3, 6).join(' '));
      return lines.join('\n');
    }

    var lines = [];
    var slotTexts = slots.map(buildSlotText);
    var slotIdx = 0;

    // Line 1: Header + possibly some slots (for 2+2+2 and 1+2+2)
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
      previewText.textContent = text;
      previewText.classList.remove('empty-state');
    } else {
      previewText.textContent = '\uc704\uc5d0\uc11c \uc815\ubcf4\ub97c \uc785\ub825\ud558\uba74 \uc5ec\uae30\uc5d0 \ubbf8\ub9ac\ubcf4\uae30\uac00 \ud45c\uc2dc\ub429\ub2c8\ub2e4';
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

  /* ============================
     EDIT MODE: Paste → Parse → Inject into Create Mode
     ============================ */
  if (parseBtn) {
    parseBtn.addEventListener('click', function() {
      var raw = pasteArea ? pasteArea.value.trim() : '';
      if (!raw) return;
      parseAndInject(raw);
    });
  }

  function parseAndInject(raw) {
    var lines = raw.split('\n').map(function(l) { return l.trim(); }).filter(function(l) { return l; });
    if (lines.length === 0) return;

    var parsedSlots = [];
    var headerLine = '';
    var RED = '\uD83D\uDD34';
    var GREEN = '\uD83D\uDFE2';
    var emojiSplitRe = /(\uD83D\uDD34|\uD83D\uDFE2)/;
    var emojiTestRe = /\uD83D\uDD34|\uD83D\uDFE2/;

    var slotLineStart = -1;
    for (var li = 0; li < lines.length; li++) {
      if (emojiTestRe.test(lines[li])) {
        slotLineStart = li;
        break;
      }
    }

    if (slotLineStart === -1) {
      headerLine = lines[0];
      for (var j = 1; j < lines.length; j++) {
        var patPlain = /([\uAC00-\uD7AF\u3131-\u3163\u3165-\u318E0-9a-zA-Z][\uAC00-\uD7AF\u3131-\u3163\u3165-\u318E0-9a-zA-Z\s]*?)\s*[(\uff08]([^)\uff09]+?)[)\uff09]/g;
        var mp;
        while ((mp = patPlain.exec(lines[j])) !== null) {
          var pName = mp[1].trim();
          parsedSlots.push({
            position: '\ud504\ub9ac',
            name: pName === '\uad6c\uc778\uc911' ? '' : pName,
            condition: mp[2].trim(),
            status: (pName === '\uad6c\uc778\uc911' || !pName) ? 'open' : 'filled'
          });
        }
      }
    } else {
      if (slotLineStart > 0) {
        headerLine = lines.slice(0, slotLineStart).join(' ');
      }

      // Count slots per line to detect layout
      var slotsPerLine = [];

      for (var i = slotLineStart; i < lines.length; i++) {
        var line = lines[i];
        var segments = line.split(emojiSplitRe);
        var lineSlotCount = 0;

        var ci = 0;
        while (ci < segments.length) {
          var seg = segments[ci];

          if (seg === RED || seg === GREEN) {
            var statusVal = seg === GREEN ? 'filled' : 'open';
            var content = (ci + 1 < segments.length) ? segments[ci + 1].trim() : '';
            ci += 2;
            if (!content) continue;

            lineSlotCount++;

            var posMatch = content.match(/^([\uAC00-\uD7AF\u3131-\u3163\u3165-\u318E0-9]+)\s*[:\uff1a]\s*(.*)$/);
            var position = '\ud504\ub9ac';
            var rest = content;
            if (posMatch) {
              position = posMatch[1];
              rest = posMatch[2] || '';
            }

            var ncMatch = rest.match(/^(.+?)\s*[(\uff08]([^)\uff09]*)[)\uff09]\s*$/);
            var slotName = '';
            var slotCond = '';
            if (ncMatch) {
              slotName = ncMatch[1].trim();
              slotCond = ncMatch[2].trim();
            } else {
              slotName = rest.trim();
            }

            if (slotName === '\uad6c\uc778\uc911') {
              slotName = '';
              statusVal = 'open';
            }

            parsedSlots.push({
              position: position,
              name: slotName,
              condition: slotCond,
              status: statusVal
            });
          } else {
            ci++;
          }
        }
        slotsPerLine.push(lineSlotCount);
      }

      // Try to detect if header line had slots mixed in
      if (slotLineStart === 0 && headerLine === '') {
        // First line contains both header text and slots
        // Extract non-slot text as header
        var firstLine = lines[0];
        var firstSlotPos = firstLine.search(emojiTestRe);
        if (firstSlotPos > 0) {
          headerLine = firstLine.substring(0, firstSlotPos).trim();
        }
      }
    }

    if (parsedSlots.length === 0) return;

    // Post-process: detect fee type
    parsedSlots.forEach(function(s) {
      if (s.condition && s.condition.indexOf('\uc9c0\uc6d0') !== -1) {
        s.feeType = 'support';
        s.condition = s.condition.replace('\uc9c0\uc6d0', '');
      } else {
        s.feeType = 'bring';
      }
    });

    // --- Parse header to extract emoji, spot name, extra info ---
    if (headerLine) {
      var emojiMatch = headerLine.match(/^([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]+)/u);
      var detectedEmoji = '';
      var remainder = headerLine;
      if (emojiMatch) {
        detectedEmoji = emojiMatch[1];
        remainder = headerLine.replace(new RegExp('^' + escapeRegex(detectedEmoji) + '\\s*'), '');
        remainder = remainder.replace(new RegExp('\\s*' + escapeRegex(detectedEmoji) + '$'), '');
      }

      var parts = remainder.split(/\s+/);
      var spotName = parts[0] || '';
      var extraInfo = parts.slice(1).join(' ');

      if (detectedEmoji) {
        selectedEmoji = detectedEmoji;
        if (emojiInput) emojiInput.value = detectedEmoji;
        emojiBtns.forEach(function(b) {
          b.classList.toggle('selected', b.getAttribute('data-emoji') === detectedEmoji);
        });
      }
      if (spotInput) spotInput.value = spotName;
      if (extraInput) extraInput.value = extraInfo;
    }

    // --- Auto-detect party size and layout from parsed slots ---
    var totalSlots = parsedSlots.length;
    if (totalSlots >= 3 && totalSlots <= 6) {
      partySize = totalSlots;

      // Select party size button
      if (partySizeSelector) {
        partySizeSelector.querySelectorAll('.party-size-btn').forEach(function(b) {
          b.classList.toggle('active', parseInt(b.getAttribute('data-size')) === partySize);
        });
      }

      // Set default layout
      var opts = layoutOptions[partySize] || [];
      layoutFormat = opts.length > 0 ? opts[0].key : '';
      updateLayoutButtons();
      setInputsDisabled(false);
    }

    // --- Clear existing slots and inject parsed ones ---
    slots = [];
    slotIdCounter = 0;
    parsedSlots.forEach(function(ps) {
      var id = createSlotId();
      ps.id = id;
      if (!ps.feeType) ps.feeType = 'bring';
      slots.push(ps);
    });

    renderSlots();

    // --- Switch to create mode ---
    currentMode = 'create';
    modeBtns.forEach(function(b) {
      b.classList.toggle('active', b.getAttribute('data-rmode') === 'create');
    });
    modeCreatePanel.classList.add('active');
    if (modeEditPanel) modeEditPanel.classList.remove('active');

    updatePreview();
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /* --- Utility --- */
  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  }

  function init(opts) {
    if (opts && opts.$) $ = opts.$;
  }

  function openModal() {
    if (mounted && !q('recruit-spot')) {
      mounted = false;
      logicBound = false;
      const el = $('discordRecruitApp');
      if (el) el.innerHTML = '';
      root = null;
    }
    mountTemplate();
    root = $('discordRecruitApp');
    const modal = $('discordRecruitModal');
    if (modal) modal.hidden = false;
  }

  function closeModal() {
    const modal = $('discordRecruitModal');
    if (modal) modal.hidden = true;
  }

  global.DiscordRecruitApp = { init, openModal, closeModal };
})(typeof window !== 'undefined' ? window : globalThis);
