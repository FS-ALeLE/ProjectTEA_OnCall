/**
 * school-search.js
 * -----------------------------------------------------------------------
 * "사안 접수" 화면의 [학교명] NEIS 실시간 자동완성 검색.
 *
 *   - 300ms 디바운스 후 NEIS Open API(충남 N10)를 브라우저에서 직접 호출한다.
 *     (인증키: js/neis-config.js, 루트 .env의 VITE_NEIS_API_KEY와 동일)
 *   - 선택 시 { id, name, level, region } 객체를 상태에 보관한다.
 * -----------------------------------------------------------------------
 */
(function () {
  'use strict';

  const DEBOUNCE_MS = 300;

  const REGION_MAP = [
    { code: '01', name: '천안', keywords: ['천안'] },
    { code: '02', name: '공주', keywords: ['공주'] },
    { code: '03', name: '보령', keywords: ['보령'] },
    { code: '04', name: '아산', keywords: ['아산'] },
    { code: '05', name: '서산', keywords: ['서산'] },
    { code: '06', name: '논산계룡', keywords: ['논산', '계룡'] },
    { code: '07', name: '당진', keywords: ['당진'] },
    { code: '08', name: '금산', keywords: ['금산'] },
    { code: '09', name: '부여', keywords: ['부여'] },
    { code: '10', name: '서천', keywords: ['서천'] },
    { code: '11', name: '청양', keywords: ['청양'] },
    { code: '12', name: '홍성', keywords: ['홍성'] },
    { code: '13', name: '예산', keywords: ['예산'] },
    { code: '14', name: '태안', keywords: ['태안'] },
  ];

  const LEVEL_CODE_BY_NAME = {
    유치원: '1',
    초등학교: '2',
    중학교: '3',
    고등학교: '4',
    특수학교: '5',
    각종학교: '6',
  };

  let selectedSchool = null;
  let preferredRegionCode = '';
  let activeIndex = -1;
  let currentResults = [];
  let initialized = false;
  let hasFocus = false;
  let debounceTimer = null;
  let searchToken = 0;

  /**
   * 기본(사안 접수 폼) DOM. 사건 카드 수정 모드에서는 bindTo()로 일시 교체한다.
   */
  const DEFAULT_DOM = {
    searchId: 'field-school-search',
    hiddenId: 'field-school-name',
    dropdownId: 'field-school-dropdown',
    regionSelectId: 'field-region',
    levelSelectId: 'field-school-level',
  };
  let activeDom = DEFAULT_DOM;
  let detailBound = false;

  function getSearchInput() {
    return document.getElementById(activeDom.searchId);
  }
  function getHiddenInput() {
    return document.getElementById(activeDom.hiddenId);
  }
  function getDropdown() {
    return document.getElementById(activeDom.dropdownId);
  }
  function getRegionSelect() {
    return activeDom.regionSelectId ? document.getElementById(activeDom.regionSelectId) : null;
  }
  function getLevelSelect() {
    return activeDom.levelSelectId ? document.getElementById(activeDom.levelSelectId) : null;
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function highlightMatch(name, query) {
    const q = String(query || '').trim();
    if (!q) return escapeHtml(name);
    const idx = name.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return escapeHtml(name);
    const before = escapeHtml(name.slice(0, idx));
    const match = escapeHtml(name.slice(idx, idx + q.length));
    const after = escapeHtml(name.slice(idx + q.length));
    return `${before}<span class="text-indigo-600 font-extrabold">${match}</span>${after}`;
  }

  function detectRegion(address, juOrgName) {
    const text = `${address || ''} ${juOrgName || ''}`;
    const found = REGION_MAP.find((r) => r.keywords.some((kw) => text.includes(kw)));
    return found ? { regionCode: found.code, regionName: found.name } : { regionCode: '', regionName: '' };
  }

  function mapNeisRow(row) {
    const address = row.ORG_RDNMA || '';
    const { regionCode, regionName } = detectRegion(address, row.JU_ORG_NM);
    const levelName = row.SCHUL_KND_SC_NM || '';
    return {
      id: row.SD_SCHUL_CODE || '',
      name: row.SCHUL_NM || '',
      level: levelName,
      levelCode: LEVEL_CODE_BY_NAME[levelName] || '',
      region: regionName,
      regionCode,
      address,
    };
  }

  function renderResultList(results, query) {
    const dropdown = getDropdown();
    if (!dropdown) return;
    currentResults = results;
    activeIndex = -1;

    if (results.length === 0) {
      dropdown.innerHTML =
        '<p class="px-3 py-2.5 text-[12px] text-slate-400">검색된 학교가 없습니다. 정식 학교명으로 다시 검색해 주세요.</p>';
      dropdown.classList.remove('hidden');
      return;
    }

    dropdown.innerHTML = results
      .map((s, idx) => {
        const preferredBadge =
          preferredRegionCode && s.regionCode === preferredRegionCode
            ? '<span class="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-600 shrink-0">소속 지역</span>'
            : '';
        const metaText = [s.region, s.level].filter(Boolean).join(' · ') || 'NEIS';
        return `
          <button type="button" class="school-search-item w-full text-left px-3 py-2 text-[12.5px] hover:bg-indigo-50 flex items-center justify-between gap-2" data-idx="${idx}">
            <span class="min-w-0 truncate flex items-center">${highlightMatch(s.name, query)}${preferredBadge}</span>
            <span class="text-[11px] text-slate-400 shrink-0">${escapeHtml(metaText)}</span>
          </button>`;
      })
      .join('');

    dropdown.classList.remove('hidden');
  }

  function renderLoading() {
    const dropdown = getDropdown();
    if (!dropdown) return;
    currentResults = [];
    activeIndex = -1;
    dropdown.innerHTML =
      '<p class="px-3 py-2.5 text-[12px] text-slate-400 flex items-center gap-1.5">' +
      '<span class="inline-block w-3 h-3 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin"></span>' +
      'NEIS에서 학교 검색 중...</p>';
    dropdown.classList.remove('hidden');
  }

  function renderError(message) {
    const dropdown = getDropdown();
    if (!dropdown) return;
    currentResults = [];
    activeIndex = -1;
    const text = message || '학교 검색 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
    dropdown.innerHTML = `<p class="px-3 py-2.5 text-[12px] text-rose-500">${escapeHtml(text)}</p>`;
    dropdown.classList.remove('hidden');
  }

  function closeDropdown() {
    const dropdown = getDropdown();
    if (dropdown) dropdown.classList.add('hidden');
    activeIndex = -1;
  }

  /** 브라우저에서 NEIS Open API를 직접 호출한다. */
  function fetchNeisDirect(query) {
    const cfg = window.TEA_NEIS_CONFIG || {};
    if (!cfg.apiKey) {
      return Promise.reject(new Error('NEIS_API_KEY_MISSING'));
    }

    const url =
      `${cfg.baseUrl}?KEY=${encodeURIComponent(cfg.apiKey)}` +
      `&Type=json&pIndex=1&pSize=${cfg.pageSize || 30}` +
      `&ATPT_OFCDC_SC_CODE=${encodeURIComponent(cfg.officeCode || 'N10')}` +
      `&SCHUL_NM=${encodeURIComponent(query)}`;

    return fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error('NEIS_HTTP_' + res.status);
        return res.json();
      })
      .then((payload) => {
        const rows = (payload && payload.schoolInfo && payload.schoolInfo[1] && payload.schoolInfo[1].row) || [];
        return rows.map(mapNeisRow).filter((s) => s.id && s.name);
      });
  }

  /** NEIS Open API를 직접 호출한다. (Access-Control-Allow-Origin: * 지원) */
  function fetchSchools(query) {
    return fetchNeisDirect(query);
  }

  function runSearch(rawQuery) {
    const query = String(rawQuery || '').trim();
    if (!query) {
      closeDropdown();
      return;
    }

    const token = ++searchToken;
    renderLoading();

    fetchSchools(query)
      .then((schools) => {
        if (token !== searchToken || !hasFocus) return;
        const sorted = (schools || []).slice().sort((a, b) => {
          const aPreferred = !!preferredRegionCode && a.regionCode === preferredRegionCode;
          const bPreferred = !!preferredRegionCode && b.regionCode === preferredRegionCode;
          if (aPreferred !== bPreferred) return aPreferred ? -1 : 1;
          return 0;
        });
        renderResultList(sorted, query);
      })
      .catch((err) => {
        if (token !== searchToken || !hasFocus) return;
        console.error('[TEA_SCHOOL_SEARCH] NEIS 학교 검색 실패:', err);
        const msg =
          err && err.message === 'NEIS_API_KEY_MISSING'
            ? 'NEIS 인증키가 설정되지 않았습니다.'
            : '학교 검색 중 오류가 발생했습니다. 네트워크 상태를 확인 후 다시 시도해 주세요.';
        renderError(msg);
      });
  }

  function scheduleSearch(query) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => runSearch(query), DEBOUNCE_MS);
  }

  function syncDependentFields(school) {
    const levelSelect = getLevelSelect();
    if (levelSelect && school.levelCode) {
      const hasOption = Array.prototype.some.call(levelSelect.options, (o) => o.value === school.levelCode);
      if (hasOption) levelSelect.value = school.levelCode;
    }

    const regionSelect = getRegionSelect();
    if (regionSelect && !regionSelect.disabled && school.regionCode) {
      const hasOption = Array.prototype.some.call(regionSelect.options, (o) => o.value === school.regionCode);
      if (hasOption) regionSelect.value = school.regionCode;
    }
  }

  function commitSelection(school) {
    if (!school) return;
    selectedSchool = school;
    const searchInput = getSearchInput();
    const hiddenInput = getHiddenInput();
    if (searchInput) {
      searchInput.value = school.name;
      searchInput.classList.remove('field-invalid');
    }
    if (hiddenInput) hiddenInput.value = school.name;
    closeDropdown();
    syncDependentFields(school);
  }

  function handleInput() {
    const searchInput = getSearchInput();
    const hiddenInput = getHiddenInput();
    if (!searchInput) return;

    selectedSchool = null;
    if (hiddenInput) hiddenInput.value = '';

    const query = searchInput.value;
    if (!query.trim()) {
      if (debounceTimer) clearTimeout(debounceTimer);
      searchToken += 1;
      closeDropdown();
      return;
    }
    scheduleSearch(query);
  }

  function handleFocus() {
    hasFocus = true;
    const searchInput = getSearchInput();
    if (!searchInput) return;
    if (isValidSelection()) return;
    const query = searchInput.value;
    if (query.trim()) scheduleSearch(query);
  }

  function moveActiveIndex(delta) {
    const dropdown = getDropdown();
    if (!dropdown || dropdown.classList.contains('hidden') || currentResults.length === 0) return;
    activeIndex = (activeIndex + delta + currentResults.length) % currentResults.length;
    dropdown.querySelectorAll('.school-search-item').forEach((btn, idx) => {
      btn.classList.toggle('bg-indigo-50', idx === activeIndex);
    });
    const activeBtn = dropdown.querySelector(`.school-search-item[data-idx="${activeIndex}"]`);
    if (activeBtn) activeBtn.scrollIntoView({ block: 'nearest' });
  }

  function handleKeydown(e) {
    const dropdown = getDropdown();
    const isOpen = !!dropdown && !dropdown.classList.contains('hidden');

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        const searchInput = getSearchInput();
        const query = searchInput ? searchInput.value : '';
        if (query.trim()) runSearch(query);
      } else {
        moveActiveIndex(1);
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (isOpen) moveActiveIndex(-1);
      return;
    }
    if (e.key === 'Enter') {
      if (isOpen && activeIndex >= 0 && currentResults[activeIndex]) {
        e.preventDefault();
        commitSelection(currentResults[activeIndex]);
      }
      return;
    }
    if (e.key === 'Escape') {
      closeDropdown();
    }
  }

  function applySessionPreference() {
    const session = window.TEA_SESSION ? window.TEA_SESSION.get() : null;
    preferredRegionCode = session && session.role === 'region' ? session.regionCode || '' : '';
  }

  function reset() {
    selectedSchool = null;
    if (debounceTimer) clearTimeout(debounceTimer);
    searchToken += 1;
    const searchInput = getSearchInput();
    const hiddenInput = getHiddenInput();
    if (searchInput) {
      searchInput.value = '';
      searchInput.classList.remove('field-invalid');
    }
    if (hiddenInput) hiddenInput.value = '';
    closeDropdown();
  }

  function isValidSelection() {
    const hiddenInput = getHiddenInput();
    return !!selectedSchool && !!hiddenInput && hiddenInput.value.trim() === selectedSchool.name;
  }

  function getSelectedSchoolInfo() {
    if (!isValidSelection()) return null;
    return {
      id: selectedSchool.id || '',
      name: selectedSchool.name || '',
      level: selectedSchool.level || '',
      region: selectedSchool.region || '',
    };
  }

  function markInvalid() {
    const searchInput = getSearchInput();
    if (searchInput) searchInput.classList.add('field-invalid');
  }

  function attachListeners(searchInput, dropdown) {
    if (!searchInput) return;
    searchInput.addEventListener('input', handleInput);
    searchInput.addEventListener('focus', handleFocus);
    searchInput.addEventListener('keydown', handleKeydown);
    searchInput.addEventListener('blur', () => {
      hasFocus = false;
      setTimeout(closeDropdown, 120);
    });

    if (dropdown) {
      dropdown.addEventListener('mousedown', (e) => {
        const btn = e.target.closest('.school-search-item');
        if (!btn) return;
        e.preventDefault();
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        if (!isNaN(idx) && currentResults[idx]) {
          commitSelection(currentResults[idx]);
        }
      });
    }
  }

  function init() {
    if (initialized) return;
    initialized = true;
    activeDom = DEFAULT_DOM;
    attachListeners(getSearchInput(), getDropdown());
  }

  /**
   * 사건 카드 [접수 내용 수정] 등 다른 화면의 학교 검색 칸에 NEIS 검색을 연결한다.
   * @param {{searchId:string, hiddenId:string, dropdownId:string, regionSelectId?:string, levelSelectId?:string}} domIds
   * @param {{id?:string, name?:string, level?:string, region?:string}|null} initialSchool
   */
  function bindTo(domIds, initialSchool) {
    applySessionPreference();
    activeDom = Object.assign({}, DEFAULT_DOM, domIds || {});
    detailBound = true;

    if (debounceTimer) clearTimeout(debounceTimer);
    searchToken += 1;
    closeDropdown();

    const searchInput = getSearchInput();
    const hiddenInput = getHiddenInput();
    const dropdown = getDropdown();

    if (initialSchool && initialSchool.name && initialSchool.id) {
      selectedSchool = {
        id: initialSchool.id || '',
        name: initialSchool.name,
        level: initialSchool.level || '',
        levelCode: initialSchool.levelCode || '',
        region: initialSchool.region || '',
        regionCode: initialSchool.regionCode || '',
      };
      if (searchInput) {
        searchInput.value = initialSchool.name;
        searchInput.classList.remove('field-invalid');
      }
      if (hiddenInput) hiddenInput.value = initialSchool.name;
    } else if (initialSchool && initialSchool.name) {
      // 이름만 있는 경우(구형 데이터): 표시만 하고, 저장 전에 NEIS에서 다시 선택해야 한다.
      selectedSchool = null;
      if (searchInput) {
        searchInput.value = initialSchool.name;
        searchInput.classList.remove('field-invalid');
      }
      if (hiddenInput) hiddenInput.value = '';
    } else {
      selectedSchool = null;
      if (searchInput) searchInput.value = '';
      if (hiddenInput) hiddenInput.value = '';
    }

    // 수정 모드 바디는 매번 새로 그려지므로 리스너를 다시 붙인다.
    attachListeners(searchInput, dropdown);
  }

  /** bindTo()로 연결했던 상세 수정용 DOM을 해제하고 사안 접수 폼 DOM으로 되돌린다. */
  function unbindDetail() {
    if (!detailBound) return;
    detailBound = false;
    if (debounceTimer) clearTimeout(debounceTimer);
    searchToken += 1;
    closeDropdown();
    selectedSchool = null;
    activeDom = DEFAULT_DOM;
  }

  window.TEA_SCHOOL_SEARCH = {
    init,
    reset,
    isValidSelection,
    getSelectedSchoolInfo,
    markInvalid,
    applySessionPreference,
    bindTo,
    unbindDetail,
  };
})();