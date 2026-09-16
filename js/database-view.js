/**
 * database-view.js
 * -----------------------------------------------------------------------
 * [종합 데이터베이스] 화면 - 카드형 게시판 리스트.
 *
 * 엑셀형 격자 표 대신, 사안 1건을 하나의 "요약 카드 행(Row Card)"으로
 * 세로로 나열합니다. 상단 필터바(지역별 / 학교급별 / 진행상태별 / 침해유형별)와
 * 검색창을 선택/입력하는 즉시(별도 검색 버튼 없이) 목록이 실시간으로
 * 필터링·검색·정렬됩니다.
 *
 * 사안이 많아질 경우를 대비해 하단에 페이지네이션과 "페이지당 표시 건수"
 * 조절 기능을 함께 제공합니다.
 *
 * 각 카드를 클릭하면 사건 상세 정보 포트폴리오 모달(case-modal.js)이 열립니다.
 * -----------------------------------------------------------------------
 */
(function () {
  'use strict';

  const DEFAULT_PAGE_SIZE = 10;
  const PAGINATION_MAX_BUTTONS = 7;

  let currentPage = 1;

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** 신규 접수 폼(분류번호 체계)과 구형 더미 데이터 모두를 지원하기 위한 안전한 접근자 */
  function getCaseRegionCode(c) {
    return (c.classification && c.classification.regionCode) || c.regionCode || '';
  }
  function getCaseLevelCode(c) {
    return (c.classification && c.classification.levelCode) || c.levelCode || '';
  }
  function getCaseViolationTypes(c) {
    if (c.violationTypes && c.violationTypes.length > 0) return c.violationTypes;
    return c.caseType ? [c.caseType] : [];
  }

  // ---------------------------------------------------------------------
  // 필터 셀렉트박스 옵션 채우기
  // ---------------------------------------------------------------------
  function populateFilterSelects() {
    const { REGIONS, SCHOOL_LEVELS, VIOLATION_TYPES } = window.TEA_FORM_OPTIONS;
    const { STATUS_META } = window.TEA_DATA;

    const regionSel = document.getElementById('db-filter-region');
    if (regionSel) {
      REGIONS.forEach((r) => {
        const opt = document.createElement('option');
        opt.value = r.code;
        opt.textContent = `${r.code} - ${r.name}`;
        regionSel.appendChild(opt);
      });
    }

    const levelSel = document.getElementById('db-filter-level');
    if (levelSel) {
      SCHOOL_LEVELS.forEach((l) => {
        const opt = document.createElement('option');
        opt.value = l.code;
        opt.textContent = `${l.code} - ${l.name}`;
        levelSel.appendChild(opt);
      });
    }

    const violationSel = document.getElementById('db-filter-violation');
    if (violationSel) {
      VIOLATION_TYPES.forEach((t) => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        violationSel.appendChild(opt);
      });
    }

    const statusSel = document.getElementById('db-filter-status');
    if (statusSel) {
      Object.keys(STATUS_META).forEach((key) => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = STATUS_META[key].label;
        statusSel.appendChild(opt);
      });
    }
  }

  // ---------------------------------------------------------------------
  // 필터링 / 검색 / 정렬
  // ---------------------------------------------------------------------
  function readCurrentFilters() {
    const get = (id) => {
      const el = document.getElementById(id);
      return el ? el.value : '';
    };
    return {
      region: get('db-filter-region'),
      level: get('db-filter-level'),
      violation: get('db-filter-violation'),
      status: get('db-filter-status'),
    };
  }

  function matchesFilters(c, filters) {
    if (filters.region && getCaseRegionCode(c) !== filters.region) return false;
    if (filters.level && getCaseLevelCode(c) !== filters.level) return false;
    if (filters.violation && !getCaseViolationTypes(c).includes(filters.violation)) return false;
    if (filters.status && c.status !== filters.status) return false;
    return true;
  }

  function readSearchQuery() {
    const el = document.getElementById('db-search-input');
    return el ? el.value.trim().toLowerCase() : '';
  }

  /** 분류번호·학교명·피해교원명·사안 제목/내용·담당자명을 대상으로 부분 일치 검색 */
  function matchesSearch(c, query) {
    if (!query) return true;
    const haystack = [c.id, c.school, c.teacherName, c.title, c.description, c.manager, getReporterDisplay(c)]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  }

  function getReporterDisplay(c) {
    return c.reporterName || c.reporter || '';
  }

  /** 신고일자 + 신고시각을 기준으로 최신 순(내림차순) 정렬 */
  function compareCasesDesc(a, b) {
    const aKey = `${a.receivedDate || ''} ${a.reportTime || '00:00'}`;
    const bKey = `${b.receivedDate || ''} ${b.reportTime || '00:00'}`;
    return bKey.localeCompare(aKey);
  }

  // ---------------------------------------------------------------------
  // 요약 카드 행(Row Card) 생성
  // ---------------------------------------------------------------------
  function createRowCard(c) {
    const { STATUS_META, PRIORITY_META } = window.TEA_DATA;
    const statusMeta = STATUS_META[c.status];
    const priorityMeta = PRIORITY_META[c.priority] || PRIORITY_META.medium;
    const types = getCaseViolationTypes(c);
    const visibleTags = types.slice(0, 2);
    const remaining = types.length - visibleTags.length;

    const card = document.createElement('div');
    card.className = 'db-row-grid db-row-card' + (c.isDraft ? ' db-row-card-draft' : '');
    card.setAttribute('data-case-id', c.id);
    card.title = '클릭하여 사건 상세 정보 보기';

    card.innerHTML = `
      <div class="min-w-0">
        <p class="text-[12.5px] font-bold text-slate-700 leading-snug break-all">${escapeHtml(c.id)}</p>
        ${c.isDraft ? '<span class="draft-badge mt-1 inline-block">임시저장</span>' : ''}
      </div>
      <div class="min-w-0">
        <p class="text-[12.5px] font-semibold text-slate-700 truncate">${escapeHtml(c.school || '-')}</p>
        <p class="text-[11px] text-slate-400 truncate">${escapeHtml(c.title || '')}</p>
      </div>
      <div class="min-w-0">
        <p class="text-[12.5px] font-semibold text-slate-700 truncate">${escapeHtml(c.teacherName || '-')} 교사</p>
      </div>
      <div class="min-w-0">
        <p class="text-[12.5px] font-semibold text-slate-700">${escapeHtml(c.receivedDate || '-')}</p>
        <p class="text-[11px] text-slate-400">${escapeHtml(c.reportTime || '')}</p>
      </div>
      <div><span class="px-2 py-0.5 rounded-full text-[11px] font-bold ${statusMeta.badgeClass}">${statusMeta.label}</span></div>
      <div class="flex flex-col items-start gap-1.5">
        <span class="priority-badge px-2 py-0.5 rounded-full text-[11px] font-bold ${priorityMeta.badgeClass}" data-tooltip="${escapeHtml(priorityMeta.tooltip || '')}">${priorityMeta.label}</span>
        ${
          c.isDraft
            ? `<button type="button" class="draft-delete-btn inline-flex items-center gap-1 text-[11px] font-bold text-rose-500 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-2 py-0.5 rounded-md transition-colors" data-draft-delete="${escapeHtml(c.id)}" title="임시저장 사안 삭제">
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3m5 0H4" /></svg>
                삭제
              </button>`
            : ''
        }
      </div>
      <div class="flex flex-wrap gap-1 min-w-0 items-center">
        ${visibleTags.map((t) => `<span class="mini-tag">${escapeHtml(t)}</span>`).join('')}
        ${remaining > 0 ? `<span class="mini-tag mini-tag-more">+${remaining}</span>` : ''}
        ${types.length === 0 ? '<span class="text-[11px] text-slate-400">미분류</span>' : ''}
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-draft-delete]')) return;
      if (window.TEA_MODAL) window.TEA_MODAL.openCaseModal(c.id);
    });

    if (c.isDraft) {
      const deleteBtn = card.querySelector('[data-draft-delete]');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (window.TEA_DRAFT) window.TEA_DRAFT.deleteDraft(c.id);
        });
      }
    }

    return card;
  }

  // ---------------------------------------------------------------------
  // 페이지네이션
  // ---------------------------------------------------------------------
  function readPageSize() {
    const el = document.getElementById('db-page-size');
    const val = el ? parseInt(el.value, 10) : DEFAULT_PAGE_SIZE;
    return val > 0 ? val : DEFAULT_PAGE_SIZE;
  }

  function renderPaginationBar(totalCount, totalPages) {
    const controls = document.getElementById('db-pagination-controls');
    const info = document.getElementById('db-pagination-info');
    if (info) {
      info.textContent = totalCount === 0 ? '' : `${currentPage} / ${totalPages} 페이지`;
    }
    if (!controls) return;

    if (totalCount === 0) {
      controls.innerHTML = '';
      return;
    }

    const pageBtn = (label, page, opts) => {
      opts = opts || {};
      const disabled = opts.disabled ? 'disabled' : '';
      const activeClass = opts.active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 hover:bg-slate-100 border-slate-200';
      return `<button type="button" ${disabled} data-db-page="${page}" class="db-page-btn min-w-[2rem] h-8 px-2 rounded-lg text-[12px] font-bold border ${activeClass} disabled:opacity-40 disabled:cursor-not-allowed transition-colors">${escapeHtml(label)}</button>`;
    };

    const buttons = [];
    buttons.push(pageBtn('이전', currentPage - 1, { disabled: currentPage <= 1 }));

    let startPage = Math.max(1, currentPage - Math.floor(PAGINATION_MAX_BUTTONS / 2));
    let endPage = Math.min(totalPages, startPage + PAGINATION_MAX_BUTTONS - 1);
    startPage = Math.max(1, endPage - PAGINATION_MAX_BUTTONS + 1);

    for (let p = startPage; p <= endPage; p += 1) {
      buttons.push(pageBtn(String(p), p, { active: p === currentPage }));
    }

    buttons.push(pageBtn('다음', currentPage + 1, { disabled: currentPage >= totalPages }));

    controls.innerHTML = buttons.join('');
  }

  // ---------------------------------------------------------------------
  // 렌더링
  // ---------------------------------------------------------------------
  function renderDatabaseList() {
    const listEl = document.getElementById('database-list');
    const emptyEl = document.getElementById('database-empty');
    const countEl = document.getElementById('database-result-count');
    const paginationBar = document.getElementById('database-pagination-bar');
    if (!listEl) return;

    const filters = readCurrentFilters();
    const query = readSearchQuery();
    const filtered = window.TEA_DATA.cases.filter((c) => matchesFilters(c, filters) && matchesSearch(c, query)).sort(compareCasesDesc);

    const totalCount = filtered.length;
    const pageSize = readPageSize();
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIdx = (currentPage - 1) * pageSize;
    const pageItems = filtered.slice(startIdx, startIdx + pageSize);

    listEl.innerHTML = '';
    pageItems.forEach((c) => listEl.appendChild(createRowCard(c)));

    if (countEl) countEl.textContent = `총 ${totalCount}건`;
    listEl.classList.toggle('hidden', totalCount === 0);
    if (emptyEl) emptyEl.classList.toggle('hidden', totalCount > 0);
    if (paginationBar) {
      paginationBar.classList.toggle('hidden', totalCount === 0);
      paginationBar.classList.toggle('flex', totalCount > 0);
    }

    renderPaginationBar(totalCount, totalPages);
  }

  function resetPageAndRender() {
    currentPage = 1;
    renderDatabaseList();
  }

  function initDatabaseView() {
    populateFilterSelects();

    ['db-filter-region', 'db-filter-level', 'db-filter-violation', 'db-filter-status'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', resetPageAndRender);
    });

    const searchInput = document.getElementById('db-search-input');
    if (searchInput) searchInput.addEventListener('input', resetPageAndRender);

    const pageSizeSel = document.getElementById('db-page-size');
    if (pageSizeSel) pageSizeSel.addEventListener('change', resetPageAndRender);

    const controls = document.getElementById('db-pagination-controls');
    if (controls) {
      controls.addEventListener('click', (e) => {
        const btn = e.target.closest('.db-page-btn');
        if (!btn || btn.disabled) return;
        const page = parseInt(btn.getAttribute('data-db-page'), 10);
        if (!isNaN(page)) {
          currentPage = page;
          renderDatabaseList();
        }
      });
    }

    renderDatabaseList();
  }

  window.TEA_DATABASE = { init: initDatabaseView, render: renderDatabaseList };
})();
