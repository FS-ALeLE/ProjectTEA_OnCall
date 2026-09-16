/**
 * case-modal.js
 * -----------------------------------------------------------------------
 * "사건 상세 정보 포트폴리오" 모달.
 *
 * 종합 데이터베이스의 요약 카드나 홈 대시보드의 칸반 카드를 클릭하면
 * 열리는 상세 조회 화면으로, 경찰 조서·행정 서류철처럼 사안의 모든 항목을
 * 읽기 전용 문서 형태로 정렬해 보여줍니다.
 *
 * [수정] 버튼을 누르면 "1. 접수 기본 정보" 부터 "8. 첨부파일" 까지 전체
 * 항목이 "사안 접수" 폼과 동일한 입력 UI로 전환되어, 한 번에 모든 내용을
 * 고쳐 쓸 수 있습니다. [저장]을 누르면 사건 객체와 localStorage에 반영되고,
 * [취소]를 누르면 변경 없이 읽기 전용 화면으로 돌아갑니다.
 *
 * 아래 3가지 섹션은 "1~8 전체 수정" 모드와 무관하게 항상 즉시 상호작용이
 * 가능한 "정밀 서식"으로 별도 관리됩니다. 하단 [처리상황 저장]으로
 * 조치 경과 · 위원회 심의 · 법률 조치 내용을 한 번에 저장합니다.
 *   9)  조치 경과 ("사안 접수" 폼의 조치 경과 위젯과 동일하게 연동됨)
 *   10) 교권보호위원회 결정 사항 (결정일자, 가해학생/가해보호자 처분, 피해교원 지원)
 *   11) 법률 조치 사항 (조치일자, 조치유형 다중선택, 진행 상황)
 *
 * 제목 우측의 [메모] 버튼을 누르면 별도의 작은 팝업이 열려, 형식에 구애받지
 * 않는 비공식 메모를 자유롭게 남기고 확인할 수 있습니다.
 *
 * 저장된 기록은 Firestore(js/firebase-cases.js)에 사건 문서 단위로 즉시
 * 반영되어, 다른 담당자의 화면에도 실시간으로 동기화됩니다.
 * -----------------------------------------------------------------------
 */
(function () {
  'use strict';

  const LEGAL_ACTION_TYPES = ['행정심판', '행정소송', '고소 및 고발'];

  let currentCaseId = null;
  let detailEditMode = false;
  /** "1~8 전체 수정" 모드에서 사용 중인 첨부파일 관리자 인스턴스 (렌더링될 때마다 재생성) */
  let activeAttachmentManager = null;

  function findCaseById(caseId) {
    return window.TEA_DATA.cases.find((c) => c.id === caseId);
  }

  function getCurrentCase() {
    return currentCaseId ? findCaseById(currentCaseId) : null;
  }

  /** 사용자가 입력한 자유 텍스트를 안전하게 표시하기 위한 최소한의 HTML 이스케이프 */
  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** 값이 비어있으면 '—' 표시, 있으면 이스케이프하여 표시하는 읽기 전용 필드 블록 */
  function readonlyField(label, value, extraClass) {
    const display = value === null || value === undefined || value === '' ? '—' : escapeHtml(value);
    return `
      <div class="${extraClass || ''}">
        <p class="text-[10.5px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">${escapeHtml(label)}</p>
        <p class="text-[13px] font-semibold text-slate-800 leading-snug break-words">${display}</p>
      </div>
    `;
  }

  function getReporterName(caseItem) {
    return caseItem.reporterName || caseItem.reporter || '';
  }

  function getReporterRelation(caseItem) {
    return caseItem.reporterRelation || '';
  }

  function buildRegionLevelSchoolDisplay(caseItem) {
    const { REGIONS, SCHOOL_LEVELS } = window.TEA_FORM_OPTIONS;
    const regionCode = (caseItem.classification && caseItem.classification.regionCode) || caseItem.regionCode || '';
    const levelCode = (caseItem.classification && caseItem.classification.levelCode) || caseItem.levelCode || '';
    const region = REGIONS.find((r) => r.code === regionCode);
    const level = SCHOOL_LEVELS.find((l) => l.code === levelCode);
    const regionLabel = region ? `${region.code} · ${region.name}` : '—';
    const levelLabel = level ? `${level.code} · ${level.name}` : '—';
    return { regionLabel, levelLabel };
  }

  // ---------------------------------------------------------------------
  // 헤더 (분류번호, 상태/우선순위 배지, 제목)
  // ---------------------------------------------------------------------
  function buildHeaderHtml(caseItem) {
    const { STATUS_META, PRIORITY_META } = window.TEA_DATA;
    const statusMeta = STATUS_META[caseItem.status];
    const priorityMeta = PRIORITY_META[caseItem.priority] || PRIORITY_META.medium;
    const titleText = caseItem.title || '';

    return `
      <div class="flex items-center gap-2 mb-1.5 flex-wrap">
        <span class="text-[11.5px] font-semibold text-slate-400 break-all">${escapeHtml(caseItem.id)}</span>
        <span class="px-2.5 py-1 rounded-full text-[11px] font-bold ${statusMeta.badgeClass}">${statusMeta.label}</span>
        <span class="priority-badge px-2.5 py-1 rounded-full text-[11px] font-bold ${priorityMeta.badgeClass}" data-tooltip="${escapeHtml(priorityMeta.tooltip || '')}">${priorityMeta.label}</span>
        ${caseItem.isDraft ? '<span class="draft-badge">임시저장 · 추가 작성 필요</span>' : ''}
      </div>
      <div data-case-title-view class="flex items-start gap-2">
        <h2 class="text-[16px] font-extrabold text-slate-900 leading-snug break-words min-w-0 flex-1" data-case-title-text>${escapeHtml(titleText)}</h2>
        <button type="button" data-case-title-edit class="shrink-0 inline-flex items-center gap-1 mt-0.5 text-[11.5px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition-colors" title="제목 수정">
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          제목 수정
        </button>
      </div>
      <div data-case-title-edit-form class="hidden space-y-2">
        <input type="text" data-case-title-input class="form-input text-[15px] font-bold" value="${escapeHtml(titleText)}" maxlength="80" placeholder="사안 제목을 입력해 주세요" />
        <div class="flex items-center gap-2">
          <button type="button" data-case-title-save class="px-3 py-1.5 rounded-lg text-[11.5px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors">저장</button>
          <button type="button" data-case-title-cancel class="px-3 py-1.5 rounded-lg text-[11.5px] font-bold text-slate-500 bg-white border border-slate-200 hover:bg-slate-100 transition-colors">취소</button>
        </div>
      </div>
    `;
  }

  function setTitleEditMode(editing) {
    const headerEl = document.getElementById('case-modal-header');
    if (!headerEl) return;
    const view = headerEl.querySelector('[data-case-title-view]');
    const form = headerEl.querySelector('[data-case-title-edit-form]');
    if (!view || !form) return;
    view.classList.toggle('hidden', editing);
    form.classList.toggle('hidden', !editing);
    if (editing) {
      const input = form.querySelector('[data-case-title-input]');
      if (input) {
        input.focus();
        input.select();
      }
    }
  }

  function handleSaveCaseTitle() {
    const caseItem = getCurrentCase();
    if (!caseItem) return;

    const headerEl = document.getElementById('case-modal-header');
    const input = headerEl && headerEl.querySelector('[data-case-title-input]');
    if (!input) return;

    const newTitle = input.value.trim();
    if (!newTitle) {
      window.TEA_TOAST.show('제목을 입력해 주세요.', 'error');
      input.focus();
      return;
    }
    if (newTitle === (caseItem.title || '')) {
      setTitleEditMode(false);
      return;
    }

    const saveBtn = headerEl.querySelector('[data-case-title-save]');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = '저장 중...';
    }

    window.TEA_FIRESTORE.updateCase(caseItem.id, { title: newTitle })
      .then(() => {
        caseItem.title = newTitle;
        headerEl.innerHTML = buildHeaderHtml(caseItem);
        window.TEA_KANBAN.renderKanbanBoard();
        if (window.TEA_DATABASE) window.TEA_DATABASE.render();
        window.TEA_TOAST.show('제목이 수정되었습니다.', 'success');
      })
      .catch((err) => {
        console.error('[TEA_MODAL] 제목 수정 실패:', err);
        window.TEA_TOAST.show('제목 저장 중 오류가 발생했습니다.', 'error');
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = '저장';
        }
      });
  }

  function bindHeaderDelegation(headerEl) {
    if (!headerEl || headerEl.dataset.titleBound === '1') return;
    headerEl.dataset.titleBound = '1';

    headerEl.addEventListener('click', (e) => {
      if (e.target.closest('[data-case-title-edit]')) {
        setTitleEditMode(true);
        return;
      }
      if (e.target.closest('[data-case-title-cancel]')) {
        const caseItem = getCurrentCase();
        if (caseItem) headerEl.innerHTML = buildHeaderHtml(caseItem);
        return;
      }
      if (e.target.closest('[data-case-title-save]')) {
        handleSaveCaseTitle();
      }
    });

    headerEl.addEventListener('keydown', (e) => {
      if (!e.target.closest('[data-case-title-input]')) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSaveCaseTitle();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        const caseItem = getCurrentCase();
        if (caseItem) headerEl.innerHTML = buildHeaderHtml(caseItem);
      }
    });
  }

  /** 1~8번 전체 수정 모드 상단/하단에 표시되는 안내 배너 + 저장/취소 버튼.
   *  임시저장 사안을 수정 중인 경우, 저장 시 정식 채번·등록으로 전환됨을 안내한다. */
  function buildEditModeBannerHtml(isDraft) {
    const message = isDraft
      ? '임시저장된 사안입니다. 1.접수 기본 정보 ~ 8.처리 진행 이력을 확인 후 저장하면 정식 분류번호로 채번되어 등록됩니다.'
      : '사안 정보를 수정하는 중입니다. 1.접수 기본 정보 ~ 8.처리 진행 이력을 확인 후 저장해 주세요.';
    const saveLabel = isDraft ? '정식 등록' : '저장';
    return `
      <div class="edit-mode-banner">
        <div class="flex items-center gap-2 min-w-0">
          <svg class="w-4 h-4 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          <p class="text-[12px] font-bold text-amber-700 leading-snug">${escapeHtml(message)}</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button type="button" data-detail-edit-cancel class="px-3 py-1.5 rounded-lg text-[11.5px] font-bold text-slate-500 bg-white border border-slate-200 hover:bg-slate-100 transition-colors">취소</button>
          <button type="button" data-detail-edit-save class="px-3 py-1.5 rounded-lg text-[11.5px] font-bold text-white bg-amber-500 hover:bg-amber-600 transition-colors">${escapeHtml(saveLabel)}</button>
        </div>
      </div>
    `;
  }

  // ---------------------------------------------------------------------
  // 섹션 1: 접수 기본 정보
  // ---------------------------------------------------------------------
  function buildRegionSelectOptions(selectedCode) {
    const { REGIONS } = window.TEA_FORM_OPTIONS;
    return (
      '<option value="">지역 선택</option>' +
      REGIONS.map((r) => `<option value="${r.code}" ${r.code === selectedCode ? 'selected' : ''}>${r.code} - ${r.name}</option>`).join('')
    );
  }

  function buildLevelSelectOptions(selectedCode) {
    const { SCHOOL_LEVELS } = window.TEA_FORM_OPTIONS;
    return (
      '<option value="">학교급 선택</option>' +
      SCHOOL_LEVELS.map((l) => `<option value="${l.code}" ${l.code === selectedCode ? 'selected' : ''}>${l.code} - ${l.name}</option>`).join('')
    );
  }

  function buildReporterRelationSelectOptions(selected) {
    const { REPORTER_RELATIONS } = window.TEA_FORM_OPTIONS;
    return (
      '<option value="">관계 선택</option>' +
      REPORTER_RELATIONS.map((r) => `<option value="${r}" ${r === selected ? 'selected' : ''}>${r}</option>`).join('')
    );
  }

  function buildBasicInfoSectionHtml(caseItem, editMode) {
    const regionCode = (caseItem.classification && caseItem.classification.regionCode) || caseItem.regionCode || '';
    const levelCode = (caseItem.classification && caseItem.classification.levelCode) || caseItem.levelCode || '';

    const headerHtml = `
      <div class="flex items-center justify-between mb-2.5">
        <h3 class="form-section-title"><span class="form-section-num">1</span>접수 기본 정보 ${editMode ? '<span class="text-[11px] font-medium text-amber-600 ml-1">(수정 중)</span>' : ''}</h3>
        ${
          editMode
            ? ''
            : `<button type="button" data-detail-edit-toggle class="inline-flex items-center gap-1 text-[11.5px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition-colors">
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                접수 내용 수정
              </button>`
        }
      </div>
    `;

    if (editMode) {
      return `
        <div class="form-section-card form-section-card-editing">
          ${headerHtml}
          <div class="grid grid-cols-4 gap-3">
            <div>
              <label class="form-label">신고일자</label>
              <input type="date" class="form-input" data-detail-field="receivedDate" value="${escapeHtml(caseItem.receivedDate || '')}" />
            </div>
            <div>
              <label class="form-label">신고시각</label>
              <input type="time" class="form-input" data-detail-field="reportTime" value="${escapeHtml(caseItem.reportTime || '')}" />
            </div>
            <div>
              <label class="form-label">지역코드</label>
              <select id="detail-field-region" class="form-select" data-detail-field="regionCode">${buildRegionSelectOptions(regionCode)}</select>
            </div>
            <div>
              <label class="form-label">학교급코드</label>
              <select id="detail-field-level" class="form-select" data-detail-field="levelCode">${buildLevelSelectOptions(levelCode)}</select>
            </div>
          </div>
          <div class="grid grid-cols-4 gap-3 mt-3">
            <div class="relative">
              <label class="form-label">학교명</label>
              <input
                type="text"
                id="detail-school-search"
                class="form-input"
                placeholder="NEIS 정식 학교명을 검색하세요"
                autocomplete="off"
                spellcheck="false"
                value="${escapeHtml(caseItem.school || '')}"
              />
              <input type="hidden" id="detail-school-name" data-detail-field="school" value="${escapeHtml(caseItem.school || '')}" />
              <div id="detail-school-dropdown" class="hidden absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto"></div>
            </div>
            <div>
              <label class="form-label">신고인</label>
              <input type="text" class="form-input" data-detail-field="reporterName" value="${escapeHtml(getReporterName(caseItem))}" />
            </div>
            <div>
              <label class="form-label">신고인과의 관계</label>
              <select class="form-select" data-detail-field="reporterRelation">${buildReporterRelationSelectOptions(getReporterRelation(caseItem))}</select>
            </div>
            <div>
              <label class="form-label">담당 장학사</label>
              <input type="text" class="form-input" data-detail-field="manager" value="${escapeHtml(caseItem.manager || '')}" />
            </div>
          </div>
        </div>
      `;
    }

    const { regionLabel, levelLabel } = buildRegionLevelSchoolDisplay(caseItem);
    const reportDateTime = `${caseItem.receivedDate || '—'}${caseItem.reportTime ? '  ' + caseItem.reportTime : ''}`;

    return `
      <div class="form-section-card">
        ${headerHtml}
        <div class="grid grid-cols-4 gap-3">
          ${readonlyField('신고일시', reportDateTime)}
          ${readonlyField('지역코드', regionLabel)}
          ${readonlyField('학교급코드', levelLabel)}
          ${readonlyField('학교명', caseItem.school)}
        </div>
        <div class="grid grid-cols-3 gap-3 mt-3">
          ${readonlyField('신고인', getReporterName(caseItem))}
          ${readonlyField('신고인과의 관계', getReporterRelation(caseItem))}
          ${readonlyField('담당 장학사', caseItem.manager)}
        </div>
      </div>
    `;
  }

  // ---------------------------------------------------------------------
  // 섹션 2: 피해 교원 정보
  // ---------------------------------------------------------------------
  function buildYnToggleHtml(groupName, value) {
    const active = value === 'Y' ? 'Y' : 'N';
    return `
      <div class="yn-toggle" data-yn-group="${groupName}" data-value="${active}">
        <button type="button" class="yn-option ${active === 'N' ? 'yn-option-active' : ''}" data-yn-value="N">N</button>
        <button type="button" class="yn-option ${active === 'Y' ? 'yn-option-active' : ''}" data-yn-value="Y">Y</button>
      </div>
    `;
  }

  function buildVictimSectionHtml(caseItem, editMode) {
    const v = caseItem.victim || {};

    if (editMode) {
      return `
        <div class="form-section-card form-section-card-editing">
          <h3 class="form-section-title mb-2.5"><span class="form-section-num">2</span>피해 교원 정보 <span class="text-[11px] font-medium text-amber-600 ml-1">(수정 중)</span></h3>
          <div class="grid grid-cols-3 gap-3">
            <div>
              <label class="form-label">이름</label>
              <input type="text" class="form-input" data-detail-field="victimName" value="${escapeHtml(v.name || caseItem.teacherName || '')}" />
            </div>
            <div>
              <label class="form-label">성별</label>
              <div class="flex items-center gap-3 h-[34px]">
                <label class="radio-inline"><input type="radio" name="detail-victim-gender" value="남" ${v.gender !== '여' ? 'checked' : ''} /> 남</label>
                <label class="radio-inline"><input type="radio" name="detail-victim-gender" value="여" ${v.gender === '여' ? 'checked' : ''} /> 여</label>
              </div>
            </div>
            <div>
              <label class="form-label">연락처</label>
              <input type="text" class="form-input phone-input" data-detail-field="victimPhone" value="${escapeHtml(v.phone || '')}" inputmode="numeric" />
            </div>
          </div>
          <div class="grid grid-cols-3 gap-3 mt-3">
            <div>
              <label class="form-label">교원구분</label>
              <div class="flex items-center gap-3 h-[34px]">
                <label class="radio-inline"><input type="radio" name="detail-victim-employment" value="정규교원" ${v.employment !== '기간제교원' ? 'checked' : ''} /> 정규교원</label>
                <label class="radio-inline"><input type="radio" name="detail-victim-employment" value="기간제교원" ${v.employment === '기간제교원' ? 'checked' : ''} /> 기간제교원</label>
              </div>
            </div>
            <div>
              <label class="form-label">담임여부</label>
              ${buildYnToggleHtml('detail-victim-homeroom', v.homeroomYn)}
            </div>
            <div>
              <label class="form-label">특수교사 여부</label>
              ${buildYnToggleHtml('detail-victim-special-teacher', v.specialTeacherYn)}
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="form-section-card">
        <h3 class="form-section-title mb-2.5"><span class="form-section-num">2</span>피해 교원 정보</h3>
        <div class="grid grid-cols-3 gap-3">
          ${readonlyField('이름', v.name || caseItem.teacherName)}
          ${readonlyField('성별', v.gender)}
          ${readonlyField('연락처', v.phone)}
        </div>
        <div class="grid grid-cols-3 gap-3 mt-3">
          ${readonlyField('교원구분', v.employment)}
          ${readonlyField('담임여부', v.homeroomYn)}
          ${readonlyField('특수교사여부', v.specialTeacherYn)}
        </div>
      </div>
    `;
  }

  // ---------------------------------------------------------------------
  // 섹션 3: 침해 관련자
  // ---------------------------------------------------------------------
  function buildRelatedPersonsSectionHtml(caseItem, editMode) {
    if (editMode) {
      return `
        <div class="form-section-card form-section-card-editing">
          <div class="flex items-center justify-between mb-2.5">
            <h3 class="form-section-title"><span class="form-section-num">3</span>침해 관련자 <span class="text-[11px] font-medium text-amber-600 ml-1">(수정 중)</span></h3>
            <button type="button" id="detail-add-related-person-btn" class="inline-flex items-center gap-1 text-[11.5px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition-colors">+ 관련자 추가</button>
          </div>
          <div id="detail-related-persons-list" class="space-y-2.5"></div>
        </div>
      `;
    }

    const persons = caseItem.relatedPersons || [];
    const body =
      persons.length === 0
        ? '<p class="text-[12.5px] text-slate-400 py-1">등록된 관련자 정보가 없습니다.</p>'
        : persons
            .map((p) => {
              const studentExtra =
                p.type === '학생'
                  ? `<span class="text-slate-400">특수교육대상자: <b class="text-slate-600">${escapeHtml(p.specialEdYn || 'N')}</b></span>
                     <span class="text-slate-400">보호자: <b class="text-slate-600">${escapeHtml(p.guardianName || '-')}</b> (${escapeHtml(p.guardianPhone || '-')})</span>`
                  : '';
              return `
              <div class="flex items-center gap-2.5 flex-wrap text-[12.5px] bg-white border border-slate-200 rounded-lg px-3 py-2">
                <span class="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-bold text-[11px] shrink-0">${escapeHtml(p.type || '기타')}</span>
                <span class="font-semibold text-slate-700">${escapeHtml(p.name || '이름 미입력')}</span>
                <span class="text-slate-400">${escapeHtml(p.gender || '')}</span>
                ${studentExtra}
              </div>`;
            })
            .join('');

    return `
      <div class="form-section-card">
        <h3 class="form-section-title mb-2.5"><span class="form-section-num">3</span>침해 관련자</h3>
        <div class="space-y-2">${body}</div>
      </div>
    `;
  }

  // ---------------------------------------------------------------------
  // 섹션 4: 교육활동 침해 유형
  // ---------------------------------------------------------------------
  function buildViolationTypesSectionHtml(caseItem, editMode) {
    if (editMode) {
      const { VIOLATION_TYPES } = window.TEA_FORM_OPTIONS;
      const selected = caseItem.violationTypes || [];
      return `
        <div class="form-section-card form-section-card-editing">
          <h3 class="form-section-title mb-2.5"><span class="form-section-num">4</span>교육활동 침해 유형 <span class="text-[11px] font-medium text-amber-600 ml-1">(수정 중)</span></h3>
          <div class="grid grid-cols-2 gap-2">
            ${VIOLATION_TYPES.map(
              (type) => `
              <label class="checkbox-inline">
                <input type="checkbox" class="detail-violation-type-checkbox" value="${escapeHtml(type)}" ${selected.includes(type) ? 'checked' : ''} />
                <span>${escapeHtml(type)}</span>
              </label>`
            ).join('')}
          </div>
        </div>
      `;
    }

    const types = caseItem.violationTypes && caseItem.violationTypes.length > 0 ? caseItem.violationTypes : caseItem.caseType ? [caseItem.caseType] : [];
    const body =
      types.length === 0
        ? '<p class="text-[12.5px] text-slate-400 py-1">등록된 침해 유형이 없습니다.</p>'
        : `<div class="flex flex-wrap gap-1.5">${types.map((t) => `<span class="mini-tag">${escapeHtml(t)}</span>`).join('')}</div>`;

    return `
      <div class="form-section-card">
        <h3 class="form-section-title mb-2.5"><span class="form-section-num">4</span>교육활동 침해 유형</h3>
        ${body}
      </div>
    `;
  }

  // ---------------------------------------------------------------------
  // 섹션 5: 사안 내용
  // ---------------------------------------------------------------------
  function buildDescriptionSectionHtml(caseItem, editMode) {
    if (editMode) {
      return `
        <div class="form-section-card form-section-card-editing">
          <h3 class="form-section-title mb-2.5"><span class="form-section-num">5</span>사안 내용 <span class="text-[11px] font-medium text-amber-600 ml-1">(수정 중)</span></h3>
          <textarea class="form-textarea" rows="4" data-detail-field="description" placeholder="사안 내용을 입력하세요">${escapeHtml(caseItem.description || '')}</textarea>
        </div>
      `;
    }

    const text = caseItem.description ? escapeHtml(caseItem.description).replace(/\n/g, '<br />') : '등록된 사안 내용이 없습니다.';
    return `
      <div class="form-section-card">
        <h3 class="form-section-title mb-2.5"><span class="form-section-num">5</span>사안 내용</h3>
        <div class="bg-white border border-slate-200 rounded-lg p-3 text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap">${text}</div>
      </div>
    `;
  }

  // ---------------------------------------------------------------------
  // 섹션 6: 피해교원 요청 사항
  // ---------------------------------------------------------------------
  function buildVictimRequestSectionHtml(caseItem, editMode) {
    const req = caseItem.victimRequest || {};

    if (editMode) {
      return `
        <div class="form-section-card form-section-card-editing">
          <h3 class="form-section-title mb-2.5"><span class="form-section-num">6</span>피해교원 요청 사항 <span class="text-[11px] font-medium text-amber-600 ml-1">(수정 중)</span></h3>
          <div class="grid grid-cols-4 gap-3 items-start">
            <div>
              <label class="form-label">즉시 분리 희망</label>
              <div class="yn-toggle" data-yn-group="detail-immediate-separation" data-value="${req.immediateSeparationYn === '유' ? '유' : '무'}">
                <button type="button" class="yn-option ${req.immediateSeparationYn !== '유' ? 'yn-option-active' : ''}" data-yn-value="무">무</button>
                <button type="button" class="yn-option ${req.immediateSeparationYn === '유' ? 'yn-option-active' : ''}" data-yn-value="유">유</button>
              </div>
            </div>
            <div class="col-span-3">
              <label class="form-label">기타 의견</label>
              <textarea class="form-textarea" rows="1" data-detail-field="otherOpinion" placeholder="피해교원의 기타 요청/의견을 입력하세요">${escapeHtml(req.otherOpinion || '')}</textarea>
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="form-section-card">
        <h3 class="form-section-title mb-2.5"><span class="form-section-num">6</span>피해교원 요청 사항</h3>
        <div class="grid grid-cols-4 gap-3">
          ${readonlyField('즉시 분리 희망', req.immediateSeparationYn)}
          ${readonlyField('기타 의견', req.otherOpinion, 'col-span-3')}
        </div>
      </div>
    `;
  }

  // ---------------------------------------------------------------------
  // 섹션 7: 참고인 여부
  // ---------------------------------------------------------------------
  function buildWitnessSectionHtml(caseItem, editMode) {
    const witness = caseItem.witnessInfo || {};

    if (editMode) {
      const witnessPresence = caseItem.witnessPresence === '유' ? '유' : '무';
      return `
        <div class="form-section-card form-section-card-editing">
          <h3 class="form-section-title mb-2.5"><span class="form-section-num">7</span>참고인 여부 <span class="text-[11px] font-medium text-amber-600 ml-1">(수정 중)</span></h3>
          <div class="yn-toggle" data-yn-group="detail-witness-presence" data-value="${witnessPresence}">
            <button type="button" class="yn-option ${witnessPresence === '유' ? 'yn-option-active' : ''}" data-yn-value="유">유</button>
            <button type="button" class="yn-option ${witnessPresence !== '유' ? 'yn-option-active' : ''}" data-yn-value="무">무</button>
          </div>
          <div class="slide-panel ${witnessPresence === '유' ? '' : 'hidden'} mt-3 grid grid-cols-2 gap-3" data-detail-witness-panel>
            <div>
              <label class="form-label">참고인 이름</label>
              <input type="text" class="form-input" data-detail-field="witnessName" value="${escapeHtml(witness.name || '')}" />
            </div>
            <div>
              <label class="form-label">참고인 연락처</label>
              <input type="text" class="form-input phone-input" data-detail-field="witnessPhone" value="${escapeHtml(witness.phone || '')}" inputmode="numeric" />
            </div>
            <div class="col-span-2">
              <label class="form-label">참고인 관계</label>
              <input type="text" class="form-input" data-detail-field="witnessRelation" value="${escapeHtml(witness.relation || '')}" />
            </div>
          </div>
        </div>
      `;
    }

    const witnessBlock =
      caseItem.witnessPresence === '유' && caseItem.witnessInfo
        ? `
        <div class="grid grid-cols-3 gap-3 mt-3">
          ${readonlyField('참고인 이름', witness.name)}
          ${readonlyField('참고인 연락처', witness.phone)}
          ${readonlyField('참고인 관계', witness.relation)}
        </div>`
        : `<p class="text-[12.5px] text-slate-400 mt-1">등록된 참고인이 없습니다.</p>`;

    return `
      <div class="form-section-card">
        <h3 class="form-section-title mb-2.5"><span class="form-section-num">7</span>참고인 여부</h3>
        ${witnessBlock}
      </div>
    `;
  }

  // ---------------------------------------------------------------------
  // 섹션 8: 첨부파일
  // ---------------------------------------------------------------------
  function buildAttachmentsSectionHtml(caseItem, editMode) {
    if (editMode) {
      const files = caseItem.attachments || [];
      return `
        <div class="form-section-card form-section-card-editing">
          <div class="flex items-center justify-between mb-2.5">
            <h3 class="form-section-title"><span class="form-section-num">8</span>첨부파일 <span class="text-[11px] font-medium text-amber-600 ml-1">(수정 중)</span></h3>
            <span id="detail-attachment-count" class="text-[11px] font-semibold text-slate-400">${files.length}개 파일</span>
          </div>
          <div id="detail-attachment-dropzone" class="dropzone flex flex-col items-center justify-center text-center py-5 px-4">
            <svg class="w-7 h-7 text-indigo-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M12 12v9m0-9l3 3m-3-3l-3 3" /></svg>
            <p class="text-[12.5px] font-bold text-slate-600">파일을 끌어다 놓거나 클릭하여 첨부하세요</p>
            <p class="text-[11px] text-slate-400 mt-0.5">지원 형식: 사진(JPG·PNG·GIF), HWP, PDF</p>
            <input type="file" id="detail-attachment-input" class="hidden" multiple accept=".jpg,.jpeg,.png,.gif,.hwp,.hwpx,.pdf" />
          </div>
          <div id="detail-attachment-list" class="mt-3 space-y-1.5"></div>
        </div>
      `;
    }

    const files = caseItem.attachments || [];
    const body =
      files.length === 0
        ? '<p class="text-[12.5px] text-slate-400 py-1">첨부된 파일이 없습니다.</p>'
        : files
            .map(
              (f) => `
          <div class="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
            ${window.TEA_ATTACHMENTS.getFileIconSvg(f.name)}
            <span class="text-[12.5px] font-medium text-slate-700 truncate">${escapeHtml(f.name)}</span>
            <span class="text-[11px] text-slate-400 shrink-0 ml-auto">${window.TEA_ATTACHMENTS.formatFileSize(f.size || 0)}</span>
            ${
              f.url
                ? `<a href="${escapeHtml(f.url)}" target="_blank" rel="noopener" download="${escapeHtml(f.name)}" class="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-md transition-colors" title="다운로드">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" /></svg>
                    다운로드
                  </a>`
                : ''
            }
          </div>`
            )
            .join('');

    return `
      <div class="form-section-card">
        <h3 class="form-section-title mb-2.5"><span class="form-section-num">8</span>첨부파일 <span class="text-[11px] font-medium text-slate-400 ml-1">(${files.length}개)</span></h3>
        <div class="space-y-1.5">${body}</div>
      </div>
    `;
  }

  // ---------------------------------------------------------------------
  // 섹션 9: 조치 경과 ("사안 접수" 폼의 조치 경과 위젯과 동일하게 연동)
  //   - "1~8 전체 수정" 모드와 무관하게 항상 상호작용 가능
  //   - 저장은 하단 [처리상황 저장] 버튼에서 결정사항·법률조치와 함께 처리
  // ---------------------------------------------------------------------
  /** progressSteps가 없는 구형 사건(더미 데이터)의 경우, 기존 timeline의
   *  첫 번째(접수) 기록만 "접수" 단계로 이관한다. (조사·심의 등 다른 단계
   *  내용은 접수 칸에 섞이지 않도록 한다.) */
  function deriveInitialProgressSteps(caseItem) {
    if (caseItem.progressSteps && caseItem.progressSteps.length > 0) return caseItem.progressSteps;

    const { TIMELINE_STEPS } = window.TEA_FORM_OPTIONS;
    const firstEntry = (caseItem.timeline || [])[0] || null;

    return TIMELINE_STEPS.map((step, idx) => {
      if (idx === 0 && firstEntry) {
        return {
          key: step.key,
          label: step.label,
          active: true,
          date: firstEntry.date || caseItem.receivedDate || '',
          note: firstEntry.note || '',
          extra: {},
        };
      }
      return { key: step.key, label: step.label, active: false, date: '', note: '', extra: {} };
    });
  }

  function buildProgressTimelineSectionHtml() {
    return `
      <div class="form-section-card">
        <h3 class="form-section-title mb-0.5"><span class="form-section-num">9</span>조치 경과</h3>
        <p class="text-[11px] text-slate-400 mb-3 ml-[1.6rem]">사안이 진행되는 동안 원하는 단계를 클릭하여 체크·기록할 수 있습니다.</p>
        <div id="detail-progress-timeline"></div>
      </div>
    `;
  }

  // ---------------------------------------------------------------------
  // 섹션 10: 교권보호위원회 결정 사항 (편집 가능한 정밀 서식)
  // ---------------------------------------------------------------------
  function buildCommitteeDecisionSectionHtml(caseItem) {
    const cd = caseItem.committeeDecision || {};
    return `
      <div class="form-section-card form-section-card-committee">
        <div class="flex items-center justify-between mb-2.5">
          <h3 class="form-section-title"><span class="form-section-num">10</span>교권보호위원회 결정 사항</h3>
          <span data-decision-saved-at class="text-[11px] font-semibold text-emerald-600 hidden"></span>
        </div>
        <div class="grid grid-cols-4 gap-3">
          <div>
            <label class="form-label">심의(결정) 일자</label>
            <input type="date" class="form-input" data-decision-field="committeeDate" value="${escapeHtml(cd.date || '')}" />
          </div>
        </div>
        <div class="grid grid-cols-3 gap-3 mt-3">
          <div>
            <label class="form-label">가해학생 처분 조치</label>
            <textarea class="form-textarea" rows="3" data-decision-field="childMeasure" placeholder="예: 서면사과, 특별교육 5시간 등">${escapeHtml(cd.childMeasure || '')}</textarea>
          </div>
          <div>
            <label class="form-label">가해보호자 처분 조치</label>
            <textarea class="form-textarea" rows="3" data-decision-field="guardianMeasure" placeholder="예: 서면 안내, 특별교육 이수 권고 등">${escapeHtml(cd.guardianMeasure || '')}</textarea>
          </div>
          <div>
            <label class="form-label">피해교원 지원 내용</label>
            <textarea class="form-textarea" rows="3" data-decision-field="teacherSupport" placeholder="예: 특별휴가, 심리상담 연계, 법률지원 등">${escapeHtml(cd.teacherSupport || '')}</textarea>
          </div>
        </div>
      </div>
    `;
  }

  // ---------------------------------------------------------------------
  // 섹션 11: 법률 조치 사항 (편집 가능한 정밀 서식)
  // ---------------------------------------------------------------------
  function buildLegalActionSectionHtml(caseItem) {
    const la = caseItem.legalAction || {};
    const selectedTypes = la.types || [];
    return `
      <div class="form-section-card form-section-card-legal">
        <h3 class="form-section-title mb-2.5"><span class="form-section-num">11</span>법률 조치 사항</h3>
        <div class="grid grid-cols-4 gap-3">
          <div>
            <label class="form-label">조치 일자</label>
            <input type="date" class="form-input" data-decision-field="legalDate" value="${escapeHtml(la.date || '')}" />
          </div>
          <div class="col-span-3">
            <label class="form-label">조치 유형 (중복 선택 가능)</label>
            <div class="flex items-center gap-4 h-[34px]">
              ${LEGAL_ACTION_TYPES.map(
                (type) => `
                <label class="checkbox-inline">
                  <input type="checkbox" data-legal-type-checkbox value="${escapeHtml(type)}" ${selectedTypes.includes(type) ? 'checked' : ''} />
                  <span>${escapeHtml(type)}</span>
                </label>`
              ).join('')}
            </div>
          </div>
        </div>
        <div class="mt-3">
          <label class="form-label">진행 상황</label>
          <textarea class="form-textarea" rows="2" data-decision-field="legalProgress" placeholder="예: 관할 경찰서 고발장 제출 완료, 수사 진행 중 등">${escapeHtml(la.progress || '')}</textarea>
        </div>
      </div>
    `;
  }

  // ---------------------------------------------------------------------
  // 전체 조립 + 열기 / 닫기
  // ---------------------------------------------------------------------
  function buildBodyHtml(caseItem) {
    const editMode = detailEditMode;
    return [
      editMode ? buildEditModeBannerHtml(caseItem.isDraft) : '',
      buildBasicInfoSectionHtml(caseItem, editMode),
      buildVictimSectionHtml(caseItem, editMode),
      buildRelatedPersonsSectionHtml(caseItem, editMode),
      buildViolationTypesSectionHtml(caseItem, editMode),
      buildDescriptionSectionHtml(caseItem, editMode),
      buildVictimRequestSectionHtml(caseItem, editMode),
      buildWitnessSectionHtml(caseItem, editMode),
      buildAttachmentsSectionHtml(caseItem, editMode),
      editMode ? buildEditModeBannerHtml(caseItem.isDraft) : '',
      buildProgressTimelineSectionHtml(),
      buildCommitteeDecisionSectionHtml(caseItem),
      buildLegalActionSectionHtml(caseItem),
    ].join('');
  }

  /** 수정 모드로 새로 그려진 바디에 동적 목록(관련자/첨부파일/학교검색)을 채워 넣음 */
  function setupEditModeContent(caseItem, bodyEl) {
    const relatedContainer = bodyEl.querySelector('#detail-related-persons-list');
    if (relatedContainer) {
      const persons = caseItem.relatedPersons && caseItem.relatedPersons.length > 0 ? caseItem.relatedPersons : [{}];
      persons.forEach((p) => window.TEA_RELATED_PERSONS.addRelatedPersonEntry(relatedContainer, p));
    }

    activeAttachmentManager = window.TEA_ATTACHMENTS.createAttachmentManager({
      dropzoneId: 'detail-attachment-dropzone',
      fileInputId: 'detail-attachment-input',
      listId: 'detail-attachment-list',
      countId: 'detail-attachment-count',
      initialFiles: caseItem.attachments || [],
    });

    if (window.TEA_SCHOOL_SEARCH) {
      const initialSchool =
        caseItem.schoolInfo && caseItem.schoolInfo.id
          ? Object.assign({}, caseItem.schoolInfo)
          : caseItem.school
            ? { name: caseItem.school }
            : null;
      window.TEA_SCHOOL_SEARCH.bindTo(
        {
          searchId: 'detail-school-search',
          hiddenId: 'detail-school-name',
          dropdownId: 'detail-school-dropdown',
          regionSelectId: 'detail-field-region',
          levelSelectId: 'detail-field-level',
        },
        initialSchool
      );
    }
  }

  /** "조치 경과" 위젯은 전체 수정 모드와 무관하게 항상 상호작용 가능해야 하므로, 매 렌더링마다 채워 넣음 */
  function setupProgressTimelineWidget(caseItem, bodyEl) {
    const container = bodyEl.querySelector('#detail-progress-timeline');
    if (!container) return;
    window.TEA_TIMELINE.renderTimeline(container, deriveInitialProgressSteps(caseItem));
  }

  /** 모달 바디를 다시 그리되, 스크롤 위치는 최대한 보존 */
  function renderBody(caseItem, preserveScroll) {
    const bodyEl = document.getElementById('case-modal-body');
    if (!bodyEl) return;

    const scrollTop = preserveScroll ? bodyEl.scrollTop : 0;
    activeAttachmentManager = null;
    bodyEl.innerHTML = buildBodyHtml(caseItem);
    bodyEl.scrollTop = scrollTop;

    if (detailEditMode) setupEditModeContent(caseItem, bodyEl);
    setupProgressTimelineWidget(caseItem, bodyEl);

    updateFooterForCase(caseItem);
  }

  /**
   * 하단 액션 바 문구/상태를 사안 종류에 맞게 갱신한다.
   * - 임시저장: 최하단 주 버튼이 [사안 등록]
   * - 정식 사안: [처리상황 저장] (조치 경과 · 위원회 결정 · 법률 조치 일괄 저장)
   */
  function updateFooterForCase(caseItem) {
    const saveBtn = document.getElementById('case-decision-save-btn');
    const hintEl = document.getElementById('case-modal-footer-hint');
    const draftDeleteBtn = document.getElementById('case-draft-delete-btn');
    const isDraft = !!(caseItem && caseItem.isDraft);

    if (draftDeleteBtn) draftDeleteBtn.classList.toggle('hidden', !isDraft);

    if (saveBtn) {
      saveBtn.textContent = isDraft ? '사안 등록' : '처리상황 저장';
      // 임시저장은 수정 모드에서도 [사안 등록]이 주 액션이므로 비활성화하지 않는다.
      // 정식 사안의 [처리상황 저장]만 1~8 접수 내용 수정 중에는 잠시 막아 둔다.
      const shouldDisable = !isDraft && detailEditMode;
      saveBtn.disabled = shouldDisable;
      saveBtn.classList.toggle('opacity-40', shouldDisable);
      saveBtn.classList.toggle('cursor-not-allowed', shouldDisable);
    }

    if (hintEl) {
      hintEl.textContent = isDraft
        ? '내용을 확인·보완한 뒤 [사안 등록]을 누르면 정식 분류번호로 채번되어 등록됩니다.'
        : '';
    }
  }

  /** 하단 [사안 등록]/[처리상황 저장] 버튼 클릭 분기 */
  function handleFooterPrimaryAction() {
    const caseItem = getCurrentCase();
    if (!caseItem) return;

    if (caseItem.isDraft) {
      handleDraftRegister(caseItem);
      return;
    }
    handleSaveModifications();
  }

  /**
   * 임시저장 사안의 [사안 등록]:
   * 수정 화면의 현재 입력값으로 정식 채번·등록(임시→본 파일 전환)을 수행한 뒤 창을 닫는다.
   * (임시저장 카드는 열릴 때 이미 수정 모드로 진입한다.)
   */
  function handleDraftRegister(caseItem) {
    if (!caseItem || !caseItem.isDraft) return;

    if (!detailEditMode) {
      detailEditMode = true;
      renderBody(caseItem, true);
      return;
    }

    const bodyEl = document.getElementById('case-modal-body');
    if (!bodyEl) return;
    handleSaveDetailEdit(caseItem, bodyEl);
  }

  /** [조치 경과] 위젯에서 현재 체크·기록 상태를 읽어 progressSteps + timeline으로 변환 */
  function collectProgressFromBody(bodyEl) {
    const container = bodyEl && bodyEl.querySelector('#detail-progress-timeline');
    if (!container || !window.TEA_TIMELINE) return null;
    const progressSteps = window.TEA_TIMELINE.collectTimelineData(container);
    const timeline = window.TEA_TIMELINE.buildDisplayTimeline(progressSteps);
    return { progressSteps, timeline };
  }

  function buildCaseTypeLabel(violationTypes) {
    if (!violationTypes || violationTypes.length === 0) return '미분류';
    if (violationTypes.length === 1) return violationTypes[0];
    return `${violationTypes[0]} 등 ${violationTypes.length}건`;
  }

  function buildCaseTitle(description, victimName, isDraft) {
    const raw =
      description && !description.startsWith('(임시저장)')
        ? description.split('\n')[0].slice(0, 40)
        : `${victimName || '미상'} 교사 교육활동 침해 사안`;
    return isDraft ? `[임시저장] ${raw}` : raw;
  }

  /** [1~8 전체 수정] 저장: 폼 값을 사건 객체 전체에 반영하고 Firestore에 영구 저장.
   *  첨부파일 영역에서 새로 추가된 파일이 있다면 Cloud Storage 업로드가 끝난
   *  뒤에야 저장이 완료되므로, 버튼을 잠시 비활성화하여 중복 클릭을 막는다.
   *
   *  임시저장(isDraft:true) 사안을 수정해서 저장하는 경우에는, 정식 채번
   *  카운터로 새 분류번호를 확정 발급하고(reserveClassification), 그 번호로
   *  새 문서를 만든 뒤 기존 임시 문서를 삭제하여 "임시저장 → 정식 등록"으로
   *  전환한다(Firestore는 문서 ID를 그대로 바꿀 수 없어 새로 만들고 지운다). */
  function handleSaveDetailEdit(caseItem, bodyEl) {
    if (!caseItem || !bodyEl) return;

    // 학교명은 NEIS 검색 결과에서 선택한 정식 명칭만 허용
    if (window.TEA_SCHOOL_SEARCH && !window.TEA_SCHOOL_SEARCH.isValidSelection()) {
      window.TEA_SCHOOL_SEARCH.markInvalid();
      window.TEA_TOAST.show('정식 학교명을 검색하여 선택하세요', 'error');
      return;
    }

    const saveBtn = bodyEl.querySelector('[data-detail-edit-save]');
    const cancelBtn = bodyEl.querySelector('[data-detail-edit-cancel]');
    const footerBtn = document.getElementById('case-decision-save-btn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = '저장 중...';
    }
    if (cancelBtn) cancelBtn.disabled = true;
    if (footerBtn && caseItem.isDraft) {
      footerBtn.disabled = true;
      footerBtn.textContent = '등록 중...';
    }

    const getValue = (name) => {
      const el = bodyEl.querySelector(`[data-detail-field="${name}"]`);
      return el ? el.value.trim() : '';
    };
    const getRadio = (name) => {
      const el = bodyEl.querySelector(`input[name="${name}"]:checked`);
      return el ? el.value : '';
    };
    const getYn = (group) => window.TEA_UI.getYnValue(bodyEl.querySelector(`[data-yn-group="${group}"]`));

    const selectedSchoolInfo = window.TEA_SCHOOL_SEARCH ? window.TEA_SCHOOL_SEARCH.getSelectedSchoolInfo() : null;
    const regionCode = getValue('regionCode');
    const levelCode = getValue('levelCode');
    const school = selectedSchoolInfo ? selectedSchoolInfo.name : getValue('school');
    const receivedDate = getValue('receivedDate');
    const reporterName = getValue('reporterName');
    const reporterRelation = getValue('reporterRelation');
    const description = getValue('description');
    const victimName = getValue('victimName');

    const relatedPersons = window.TEA_RELATED_PERSONS.collectRelatedPersons(bodyEl.querySelector('#detail-related-persons-list')).filter(
      (p) => p.name
    );

    const violationTypes = Array.from(bodyEl.querySelectorAll('.detail-violation-type-checkbox:checked')).map((cb) => cb.value);

    const witnessPresence = getYn('detail-witness-presence') === '유' ? '유' : '무';
    const witnessInfo =
      witnessPresence === '유' ? { name: getValue('witnessName'), phone: getValue('witnessPhone'), relation: getValue('witnessRelation') } : null;

    const wasDraft = !!caseItem.isDraft;
    const originalCaseId = caseItem.id;

    // 임시저장 사안이면 정식 채번을 먼저 확정해, 새로 추가되는 첨부파일이
    // 최종 분류번호 경로(cases/[분류번호]/)로 업로드되도록 한다.
    const classificationPromise = wasDraft
      ? window.TEA_CLASSIFICATION.reserveClassification({ regionCode, levelCode, schoolName: school, reportDate: receivedDate })
      : Promise.resolve(null);

    classificationPromise
      .then((finalClassification) => {
        const targetCaseId = finalClassification ? finalClassification.full : originalCaseId;
        const attachmentsPromise = activeAttachmentManager
          ? activeAttachmentManager.finalizeAttachments(targetCaseId, regionCode)
          : Promise.resolve(caseItem.attachments || []);

        return attachmentsPromise.then((attachments) => ({ finalClassification, targetCaseId, attachments }));
      })
      .then(({ finalClassification, targetCaseId, attachments }) => {
        const caseType = buildCaseTypeLabel(violationTypes);
        // 제목은 헤더에서 따로 수정하므로, 정식 등록(임시→본 파일) 시에만 자동 생성한다.
        // 그 외 접수 내용 수정에서는 기존 제목을 유지한다.
        const title = finalClassification
          ? buildCaseTitle(description, victimName, false)
          : caseItem.title || buildCaseTitle(description, victimName, false);

        const updates = {
          receivedDate,
          reportTime: getValue('reportTime'),
          regionCode,
          levelCode,
          school,
          schoolInfo: selectedSchoolInfo || null,
          teacherName: victimName,
          caseType,
          title,
          reporterName,
          reporterRelation,
          reporter: `${reporterName}${reporterRelation ? ' (' + reporterRelation + ')' : ''}`,
          manager: getValue('manager'),
          victim: {
            name: victimName,
            gender: getRadio('detail-victim-gender'),
            phone: getValue('victimPhone'),
            employment: getRadio('detail-victim-employment'),
            homeroomYn: getYn('detail-victim-homeroom') === 'Y' ? 'Y' : 'N',
            specialTeacherYn: getYn('detail-victim-special-teacher') === 'Y' ? 'Y' : 'N',
          },
          relatedPersons,
          violationTypes,
          description,
          victimRequest: {
            immediateSeparationYn: getYn('detail-immediate-separation') === '유' ? '유' : '무',
            otherOpinion: getValue('otherOpinion'),
          },
          witnessPresence,
          witnessInfo,
          attachments,
        };

        // 접수 내용 수정/정식 등록 시에도 조치 경과를 반영해 상태를 갱신한다.
        const progressPayload = collectProgressFromBody(bodyEl);
        if (progressPayload) {
          updates.progressSteps = progressPayload.progressSteps;
          updates.timeline = progressPayload.timeline;
          updates.status = window.TEA_DATA.deriveStatusFromProgress(progressPayload.progressSteps);
        } else if (caseItem.progressSteps) {
          updates.status = window.TEA_DATA.deriveStatusFromProgress(caseItem.progressSteps);
        }

        if (finalClassification) {
          // 임시저장 → 정식 등록 전환
          updates.classification = finalClassification;
          updates.isDraft = false;
        } else if (caseItem.classification) {
          // 신규 접수 폼으로 등록된 사건은 classification 객체의 코드도 함께 맞춰준다.
          updates.classification = Object.assign({}, caseItem.classification, {
            regionCode,
            levelCode,
            schoolName: school,
          });
        }

        if (finalClassification) {
          const newCaseDoc = Object.assign({}, caseItem, updates, { id: targetCaseId });
          delete newCaseDoc.createdAt;
          delete newCaseDoc.updatedAt;
          return window.TEA_FIRESTORE.createCase(newCaseDoc)
            .then(() => window.TEA_FIRESTORE.deleteCase(originalCaseId))
            .then(() => {
              // 구독이 이미 새 문서를 넣었을 수 있으므로 중복 추가하지 않고 교체한다.
              if (window.TEA_DATA) window.TEA_DATA.replaceCase(originalCaseId, newCaseDoc);
              return { updates, targetCaseId, promoted: true, newCaseDoc };
            });
        }

        return window.TEA_FIRESTORE.updateCase(originalCaseId, updates).then(() => ({ updates, targetCaseId, promoted: false }));
      })
      .then(({ updates, targetCaseId, promoted, newCaseDoc }) => {
        if (promoted) {
          currentCaseId = targetCaseId;
        } else {
          Object.assign(caseItem, updates);
        }

        detailEditMode = false;
        activeAttachmentManager = null;
        if (window.TEA_SCHOOL_SEARCH) window.TEA_SCHOOL_SEARCH.unbindDetail();

        const headerCase = promoted
          ? window.TEA_DATA.cases.find((c) => c.id === targetCaseId) || newCaseDoc
          : caseItem;
        const headerEl = document.getElementById('case-modal-header');
        if (headerEl && headerCase) headerEl.innerHTML = buildHeaderHtml(headerCase);

        window.TEA_SUMMARY.renderSummaryCards();
        window.TEA_KANBAN.renderKanbanBoard();
        if (window.TEA_DATABASE) window.TEA_DATABASE.render();

        if (promoted) {
          window.TEA_TOAST.show(`임시저장 사안이 정식 등록되었습니다. (분류번호: ${targetCaseId})`, 'success');
          closeCaseModal();
          if (window.TEA_NAV) window.TEA_NAV.switchView('dashboard');
        } else {
          updateFooterForCase(caseItem);
          renderBody(caseItem, true);
          window.TEA_TOAST.show('사안 정보가 수정되었습니다.', 'success');
        }
      })
      .catch((err) => {
        console.error('[TEA_MODAL] 사안 정보 수정 실패:', err);
        window.TEA_TOAST.show('사안 정보 저장 중 오류가 발생했습니다. 네트워크 상태를 확인 후 다시 시도해 주세요.', 'error');
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = caseItem.isDraft ? '정식 등록' : '저장';
        }
        if (cancelBtn) cancelBtn.disabled = false;
        if (footerBtn && caseItem.isDraft) {
          footerBtn.disabled = false;
          footerBtn.textContent = '사안 등록';
        }
      });
  }

  function openCaseModal(caseId) {
    const caseItem = findCaseById(caseId);
    if (!caseItem) return;

    const headerEl = document.getElementById('case-modal-header');
    const bodyEl = document.getElementById('case-modal-body');
    const modal = document.getElementById('case-modal');
    if (!headerEl || !bodyEl || !modal) return;

    currentCaseId = caseId;
    // 임시저장 사안은 열자마자 수정 모드로 들어가, 내용 보완 후 하단 [사안 등록]으로
    // 바로 정식 채번·등록할 수 있게 한다.
    detailEditMode = !!caseItem.isDraft;
    headerEl.innerHTML = buildHeaderHtml(caseItem);
    renderBody(caseItem, false);
    updateMemoBadge(caseItem);
    updateFooterForCase(caseItem);

    const savedAtEl = bodyEl.querySelector('[data-decision-saved-at]');
    if (savedAtEl) savedAtEl.classList.add('hidden');

    modal.classList.remove('hidden');
    bodyEl.scrollTop = 0;
    requestAnimationFrame(() => {
      modal.classList.add('modal-open');
      bodyEl.scrollTop = 0;
    });
    document.body.classList.add('overflow-hidden');
  }

  function closeCaseModal() {
    const modal = document.getElementById('case-modal');
    if (!modal) return;
    modal.classList.remove('modal-open');
    document.body.classList.remove('overflow-hidden');
    setTimeout(() => modal.classList.add('hidden'), 150);
    currentCaseId = null;
    detailEditMode = false;
    activeAttachmentManager = null;
    if (window.TEA_SCHOOL_SEARCH) window.TEA_SCHOOL_SEARCH.unbindDetail();

    const draftDeleteBtn = document.getElementById('case-draft-delete-btn');
    if (draftDeleteBtn) draftDeleteBtn.classList.add('hidden');

    // 닫을 때 하단 문구를 정식 사안용 기본값으로 되돌려 둔다.
    updateFooterForCase(null);
  }

  // ---------------------------------------------------------------------
  // [처리상황 저장] 버튼: 조치 경과 + 위원회 결정 사항 + 법률 조치 사항을 함께 저장
  // ---------------------------------------------------------------------
  function handleSaveModifications() {
    if (!currentCaseId) return;
    const caseItem = findCaseById(currentCaseId);
    if (!caseItem) return;

    const bodyEl = document.getElementById('case-modal-body');
    if (!bodyEl) return;

    const getFieldValue = (name) => {
      const el = bodyEl.querySelector(`[data-decision-field="${name}"]`);
      return el ? el.value.trim() : '';
    };

    const committeeDecision = {
      date: getFieldValue('committeeDate'),
      childMeasure: getFieldValue('childMeasure'),
      guardianMeasure: getFieldValue('guardianMeasure'),
      teacherSupport: getFieldValue('teacherSupport'),
    };

    const legalTypes = Array.from(bodyEl.querySelectorAll('[data-legal-type-checkbox]:checked')).map((cb) => cb.value);
    const legalAction = {
      date: getFieldValue('legalDate'),
      types: legalTypes,
      progress: getFieldValue('legalProgress'),
    };

    const progressPayload = collectProgressFromBody(bodyEl);
    const updates = { committeeDecision, legalAction };
    if (progressPayload) {
      updates.progressSteps = progressPayload.progressSteps;
      updates.timeline = progressPayload.timeline;
      updates.status = window.TEA_DATA.deriveStatusFromProgress(progressPayload.progressSteps);
    }

    const footerBtn = document.getElementById('case-decision-save-btn');
    if (footerBtn) {
      footerBtn.disabled = true;
      footerBtn.textContent = '저장 중...';
    }

    window.TEA_FIRESTORE.updateCase(currentCaseId, updates)
      .then(() => {
        caseItem.committeeDecision = committeeDecision;
        caseItem.legalAction = legalAction;
        if (progressPayload) {
          caseItem.progressSteps = progressPayload.progressSteps;
          caseItem.timeline = progressPayload.timeline;
          caseItem.status = updates.status;
        }

        if (window.TEA_SUMMARY) window.TEA_SUMMARY.renderSummaryCards();
        if (window.TEA_DATABASE) window.TEA_DATABASE.render();
        if (window.TEA_KANBAN) window.TEA_KANBAN.renderKanbanBoard();

        window.TEA_TOAST.show('처리상황이 저장되었습니다.', 'success');
        closeCaseModal();
      })
      .catch((err) => {
        console.error('[TEA_MODAL] 처리상황 저장 실패:', err);
        window.TEA_TOAST.show('처리상황 저장 중 오류가 발생했습니다.', 'error');
        if (footerBtn) {
          footerBtn.disabled = false;
          footerBtn.textContent = '처리상황 저장';
        }
      });
  }

  // ---------------------------------------------------------------------
  // 바디 내부 클릭/토글 이벤트를 위임(delegation) 방식으로 1회만 바인딩.
  // (바디 innerHTML은 매 렌더링마다 교체되지만, #case-modal-body 엘리먼트
  //  자체는 그대로이므로 이벤트 위임이 재바인딩 없이 계속 동작한다.)
  // ---------------------------------------------------------------------
  function bindBodyDelegation(bodyEl) {
    bodyEl.addEventListener('click', (e) => {
      const caseItem = getCurrentCase();
      if (!caseItem) return;

      if (e.target.closest('[data-detail-edit-toggle]')) {
        detailEditMode = true;
        renderBody(caseItem, true);
        return;
      }
      if (e.target.closest('[data-detail-edit-cancel]')) {
        detailEditMode = false;
        activeAttachmentManager = null;
        if (window.TEA_SCHOOL_SEARCH) window.TEA_SCHOOL_SEARCH.unbindDetail();
        renderBody(caseItem, true);
        return;
      }
      if (e.target.closest('[data-detail-edit-save]')) {
        handleSaveDetailEdit(caseItem, bodyEl);
        return;
      }
    });

    bodyEl.addEventListener('yn-change', (e) => {
      const group = e.target;
      if (!group || !group.getAttribute) return;
      if (group.getAttribute('data-yn-group') === 'detail-witness-presence') {
        const panel = bodyEl.querySelector('[data-detail-witness-panel]');
        window.TEA_UI.slideToggle(panel, e.detail.value === '유');
      }
    });
  }

  // ---------------------------------------------------------------------
  // [메모] 버튼: 형식 없는 비공식 메모를 남기는 소형 팝업
  //   - 사건 상세 모달 위에 겹쳐서 뜨는 간단한 팝업이며, 언제든 배경 클릭·
  //     ESC로도 가볍게 닫을 수 있다(정식 서식이 아니므로 데이터 손실 우려가 적음).
  //   - 메모는 caseItem.memos 배열에 누적되며 localStorage에 즉시 저장된다.
  // ---------------------------------------------------------------------
  function formatMemoTimestamp(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${y}.${m}.${day} ${hh}:${mm}`;
  }

  function updateMemoBadge(caseItem) {
    const badge = document.getElementById('case-memo-count-badge');
    if (!badge) return;
    const count = (caseItem && caseItem.memos && caseItem.memos.length) || 0;
    badge.textContent = String(count);
    badge.classList.toggle('hidden', count === 0);
  }

  function renderMemoList(caseItem) {
    const listEl = document.getElementById('case-memo-list');
    if (!listEl) return;
    const memos = caseItem.memos || [];

    if (memos.length === 0) {
      listEl.innerHTML = '<p class="text-[12px] text-slate-400 text-center py-6">아직 남겨진 메모가 없습니다.<br />편하게 첫 메모를 남겨보세요.</p>';
    } else {
      listEl.innerHTML = memos
        .map(
          (memo, idx) => `
        <div class="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 relative">
          <p class="text-[12.5px] text-slate-700 whitespace-pre-wrap pr-5 leading-relaxed">${escapeHtml(memo.text)}</p>
          <p class="text-[10.5px] text-amber-500 font-semibold mt-1">${escapeHtml(formatMemoTimestamp(memo.createdAt))}</p>
          <button type="button" class="case-memo-delete absolute top-1.5 right-1.5 w-5 h-5 rounded-full text-slate-300 hover:text-rose-500 hover:bg-white flex items-center justify-center transition-colors" data-memo-index="${idx}" title="메모 삭제">
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>`
        )
        .reverse()
        .join('');
    }

    updateMemoBadge(caseItem);
  }

  function openMemoModal() {
    const caseItem = getCurrentCase();
    if (!caseItem) return;
    renderMemoList(caseItem);

    const modal = document.getElementById('case-memo-modal');
    if (!modal) return;
    const input = document.getElementById('case-memo-input');
    if (input) input.value = '';

    modal.classList.remove('hidden');
    requestAnimationFrame(() => modal.classList.add('modal-open'));
  }

  function closeMemoModal() {
    const modal = document.getElementById('case-memo-modal');
    if (!modal) return;
    modal.classList.remove('modal-open');
    setTimeout(() => modal.classList.add('hidden'), 150);
  }

  function handleAddMemo() {
    const caseItem = getCurrentCase();
    const input = document.getElementById('case-memo-input');
    if (!caseItem || !input) return;

    const text = input.value.trim();
    if (!text) {
      window.TEA_TOAST.show('메모 내용을 입력해 주세요.', 'error');
      return;
    }

    if (!caseItem.memos) caseItem.memos = [];
    const previousMemos = caseItem.memos.slice();
    caseItem.memos.push({ text, createdAt: new Date().toISOString() });

    window.TEA_FIRESTORE.updateCase(caseItem.id, { memos: caseItem.memos })
      .then(() => {
        input.value = '';
        renderMemoList(caseItem);
        window.TEA_TOAST.show('메모가 저장되었습니다.', 'success');
      })
      .catch((err) => {
        console.error('[TEA_MODAL] 메모 저장 실패:', err);
        caseItem.memos = previousMemos;
        window.TEA_TOAST.show('메모 저장 중 오류가 발생했습니다.', 'error');
      });
  }

  function handleDeleteMemo(index) {
    const caseItem = getCurrentCase();
    if (!caseItem || !caseItem.memos) return;
    const previousMemos = caseItem.memos.slice();
    caseItem.memos.splice(index, 1);

    window.TEA_FIRESTORE.updateCase(caseItem.id, { memos: caseItem.memos })
      .then(() => renderMemoList(caseItem))
      .catch((err) => {
        console.error('[TEA_MODAL] 메모 삭제 실패:', err);
        caseItem.memos = previousMemos;
        renderMemoList(caseItem);
        window.TEA_TOAST.show('메모 삭제 중 오류가 발생했습니다.', 'error');
      });
  }

  function bindMemoModal() {
    const memoBtn = document.getElementById('case-memo-btn');
    if (memoBtn) memoBtn.addEventListener('click', openMemoModal);

    document.querySelectorAll('[data-memo-close]').forEach((btn) => btn.addEventListener('click', closeMemoModal));

    const backdrop = document.querySelector('[data-memo-backdrop]');
    if (backdrop) backdrop.addEventListener('click', closeMemoModal);

    const addBtn = document.getElementById('case-memo-add-btn');
    if (addBtn) addBtn.addEventListener('click', handleAddMemo);

    const listEl = document.getElementById('case-memo-list');
    if (listEl) {
      listEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.case-memo-delete');
        if (!btn) return;
        handleDeleteMemo(parseInt(btn.getAttribute('data-memo-index'), 10));
      });
    }
    // ESC로 닫는 처리는 js/modal-esc.js가 공통으로 담당한다.
  }

  function initModal() {
    const modal = document.getElementById('case-modal');
    if (!modal) return;

    // [X]/[닫기] 버튼으로 닫히며, ESC 키 처리는 js/modal-esc.js가 이 버튼을
    // 그대로 클릭해 동일하게 동작하도록 공통 처리한다.
    document.querySelectorAll('[data-modal-close]').forEach((btn) => {
      btn.addEventListener('click', closeCaseModal);
    });

    const saveBtn = document.getElementById('case-decision-save-btn');
    if (saveBtn) saveBtn.addEventListener('click', handleFooterPrimaryAction);

    const draftDeleteBtn = document.getElementById('case-draft-delete-btn');
    if (draftDeleteBtn) {
      draftDeleteBtn.addEventListener('click', () => {
        if (!currentCaseId || !window.TEA_DRAFT) return;
        window.TEA_DRAFT.deleteDraft(currentCaseId);
      });
    }

    const bodyEl = document.getElementById('case-modal-body');
    if (bodyEl) bindBodyDelegation(bodyEl);

    const headerEl = document.getElementById('case-modal-header');
    if (headerEl) bindHeaderDelegation(headerEl);

    // 관련자 [+ 관련자 추가] 버튼도 바디 위임 목록에 포함(컨테이너를 동적으로 찾아야 하므로 별도 처리)
    if (bodyEl) {
      bodyEl.addEventListener('click', (e) => {
        if (e.target.closest('#detail-add-related-person-btn')) {
          const container = bodyEl.querySelector('#detail-related-persons-list');
          if (container) window.TEA_RELATED_PERSONS.addRelatedPersonEntry(container);
        }
      });
    }

    bindMemoModal();
  }

  window.TEA_MODAL = { openCaseModal, closeCaseModal, initModal };
})();
