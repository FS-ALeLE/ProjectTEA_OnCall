/**
 * new-case-form.js
 * -----------------------------------------------------------------------
 * "새 사안 접수" 팝업 모달의 총괄 진입점.
 *   - 지역/학교급/신고인관계 선택박스와 16개 침해유형 체크박스를 렌더링
 *   - 하위 모듈(관련자, 첨부파일, 타임라인) 초기화
 *   - 참고인 유/무 슬라이드 패널 제어
 *   - 하단 3개 버튼([취소] / [임시저장] / [사안등록])의 업무 로직 분리 구현
 *
 * [사안 등록]을 누르면:
 *   1) js/new-case-classification.js의 reserveClassification()이 Firestore
 *      runTransaction으로 해당 연도 일련번호를 동시성 안전하게 채번한다.
 *   2) 확정된 분류번호를 Storage 경로(cases/[분류번호]/)로 사용해 첨부파일을
 *      실제로 업로드하고 다운로드 URL을 확보한다.
 *   3) 완성된 사안 문서를 Firestore cases 컬렉션에 저장한다.
 * 이 과정은 네트워크 호출을 포함하므로 전체 흐름이 비동기(async)로 처리된다.
 *
 * '지역 장학사' 권한 계정으로 로그인한 경우, 지역코드 선택란은 본인의
 * 소속 지역으로 자동 고정되어 다른 지역의 사안으로 접수할 수 없다.
 * -----------------------------------------------------------------------
 */
(function () {
  'use strict';

  const { REGIONS, SCHOOL_LEVELS, REPORTER_RELATIONS, VIOLATION_TYPES } = window.TEA_FORM_OPTIONS;

  // ---------------------------------------------------------------------
  // 선택박스 / 체크박스 렌더링
  // ---------------------------------------------------------------------
  function populateSelectOptions(selectEl, items, getValue, getLabel) {
    if (!selectEl) return;
    items.forEach((item) => {
      const option = document.createElement('option');
      option.value = getValue(item);
      option.textContent = getLabel(item);
      selectEl.appendChild(option);
    });
  }

  function renderViolationTypeCheckboxes() {
    const grid = document.getElementById('violation-types-grid');
    if (!grid) return;
    grid.innerHTML = VIOLATION_TYPES.map(
      (type) => `
      <label class="checkbox-inline">
        <input type="checkbox" class="violation-type-checkbox" value="${type}" />
        <span>${type}</span>
      </label>`
    ).join('');
  }

  // ---------------------------------------------------------------------
  // 참고인 유/무 슬라이드 패널
  // ---------------------------------------------------------------------
  function initWitnessToggle() {
    const group = document.querySelector('[data-yn-group="witness-presence"]');
    const panel = document.querySelector('[data-witness-panel]');
    if (!group || !panel) return;
    group.addEventListener('yn-change', (e) => {
      window.TEA_UI.slideToggle(panel, e.detail.value === '유');
    });
  }

  // ---------------------------------------------------------------------
  // '지역 장학사' 권한 계정: 지역코드 선택란을 본인 소속 지역으로 고정
  // ---------------------------------------------------------------------
  function applyRegionLockIfNeeded() {
    const regionSelect = document.getElementById('field-region');
    if (regionSelect) {
      const session = window.TEA_SESSION ? window.TEA_SESSION.get() : null;
      if (session && session.role === 'region' && session.regionCode) {
        regionSelect.value = session.regionCode;
        regionSelect.disabled = true;
        regionSelect.classList.add('bg-slate-100', 'cursor-not-allowed');
      } else {
        regionSelect.disabled = false;
        regionSelect.classList.remove('bg-slate-100', 'cursor-not-allowed');
      }
    }

    // 지역 장학사 세션이면 학교명 검색 결과에서도 소속 지역 학교를 우선 노출한다.
    if (window.TEA_SCHOOL_SEARCH) window.TEA_SCHOOL_SEARCH.applySessionPreference();
  }

  // ---------------------------------------------------------------------
  // 폼 검증 ([사안 등록] 시에만 전체 필수값을 강제한다)
  // ---------------------------------------------------------------------
  const REQUIRED_FIELDS = [
    { id: 'field-report-date', label: '신고일자' },
    { id: 'field-report-time', label: '신고시각' },
    { id: 'field-region', label: '지역코드' },
    { id: 'field-school-level', label: '학교급코드' },
    { id: 'field-reporter-name', label: '신고인 이름' },
    { id: 'field-reporter-relation', label: '신고인 관계' },
    { id: 'field-victim-name', label: '피해 교원 이름' },
    { id: 'field-case-content', label: '사안 내용' },
  ];

  function clearFieldErrors() {
    document.querySelectorAll('.field-invalid').forEach((el) => el.classList.remove('field-invalid'));
    const summary = document.getElementById('form-validation-summary');
    if (summary) summary.classList.add('hidden');
  }

  const SCHOOL_SELECTION_WARNING = '정식 학교명을 검색하여 선택하세요';

  function validateForm() {
    clearFieldErrors();
    const missing = [];

    REQUIRED_FIELDS.forEach((field) => {
      const el = document.getElementById(field.id);
      if (!el || !el.value || !el.value.trim()) {
        if (el) el.classList.add('field-invalid');
        missing.push(field.label);
      }
    });

    // 학교명은 자유 텍스트가 아니라 school-search.js의 자동완성 목록에서
    // 정식 명칭을 검색·선택해야만 유효한 값으로 인정한다.
    const schoolSelectionValid = window.TEA_SCHOOL_SEARCH.isValidSelection();
    if (!schoolSelectionValid) {
      window.TEA_SCHOOL_SEARCH.markInvalid();
      missing.push('학교명 (정식 명칭 검색 후 선택)');
    }

    const checkedViolationTypes = document.querySelectorAll('.violation-type-checkbox:checked');
    if (checkedViolationTypes.length === 0) {
      missing.push('교육활동 침해 유형 (최소 1개)');
      const grid = document.getElementById('violation-types-grid');
      if (grid) grid.classList.add('field-invalid');
    } else {
      const grid = document.getElementById('violation-types-grid');
      if (grid) grid.classList.remove('field-invalid');
    }

    if (missing.length > 0) {
      const summary = document.getElementById('form-validation-summary');
      if (summary) {
        summary.textContent = `다음 항목을 확인해 주세요: ${missing.join(', ')}`;
        summary.classList.remove('hidden');
      }
      // 학교명 미선택이 유일한 문제일 때는 요구된 문구를 그대로 안내한다.
      const toastMessage = !schoolSelectionValid && missing.length === 1 ? SCHOOL_SELECTION_WARNING : '필수 입력 항목을 확인해 주세요.';
      window.TEA_TOAST.show(toastMessage, 'error');
      return false;
    }

    return true;
  }

  // ---------------------------------------------------------------------
  // 업무 규칙: 침해유형/요청사항을 근거로 우선순위·사안유형 자동 산정
  // ---------------------------------------------------------------------
  function decidePriority(violationTypes, immediateSeparation) {
    const highRiskTypes = ['성폭력범죄', '상해·폭행', '협박'];
    if (immediateSeparation === 'Y') return 'high';
    if (violationTypes.some((t) => highRiskTypes.includes(t))) return 'high';
    if (violationTypes.length >= 3) return 'medium';
    return 'medium';
  }

  function buildCaseTypeLabel(violationTypes) {
    if (violationTypes.length === 0) return '미분류';
    if (violationTypes.length === 1) return violationTypes[0];
    return `${violationTypes[0]} 등 ${violationTypes.length}건`;
  }

  /** 값이 비어있고 임시저장(isDraft) 모드인 경우에만 더미 값으로 대체 */
  function resolveValue(rawValue, isDraft, dummyValue) {
    const trimmed = (rawValue || '').trim();
    if (trimmed) return trimmed;
    return isDraft ? dummyValue : trimmed;
  }

  /**
   * 화면에 입력된 값을 읽어 사건(Case) 객체를 구성한다. (id/classification/attachments 제외)
   * @param {boolean} isDraft true면 [임시저장] - 필수값이 비어 있어도 더미 값으로 채워 저장.
   */
  function buildCaseInputFromForm(isDraft) {
    const reportDate = resolveValue(document.getElementById('field-report-date').value, isDraft, window.TEA_DATA.isoDateOffset(0));
    const reportTime = resolveValue(document.getElementById('field-report-time').value, isDraft, '09:00');
    const regionCode = resolveValue(document.getElementById('field-region').value, isDraft, '01');
    const levelCode = resolveValue(document.getElementById('field-school-level').value, isDraft, '2');
    // 학교명은 더 이상 자유 텍스트가 아니라, NEIS 검색으로 선택한 학교의
    // 객체 정보({ id, name, level, region })를 그대로 사안 데이터에 저장한다.
    const selectedSchoolInfo = window.TEA_SCHOOL_SEARCH.getSelectedSchoolInfo();
    const schoolName = selectedSchoolInfo ? selectedSchoolInfo.name : resolveValue('', isDraft, '(임시)학교명 미입력');
    const reporterName = resolveValue(document.getElementById('field-reporter-name').value, isDraft, '(임시)신고인 미입력');
    const reporterRelation = resolveValue(document.getElementById('field-reporter-relation').value, isDraft, '기타');
    const victimName = resolveValue(document.getElementById('field-victim-name').value, isDraft, '(임시)성명 미입력');
    const caseContent = resolveValue(document.getElementById('field-case-content').value, isDraft, '(임시저장) 사안 내용이 아직 입력되지 않았습니다.');

    const victimGender = document.querySelector('input[name="victim-gender"]:checked').value;
    const victimPhone = document.getElementById('field-victim-phone').value.trim();
    const victimEmployment = document.querySelector('input[name="victim-employment"]:checked').value;
    const victimHomeroomYn = window.TEA_UI.getYnValue(document.querySelector('[data-yn-group="victim-homeroom"]'));
    const victimSpecialTeacherYn = window.TEA_UI.getYnValue(document.querySelector('[data-yn-group="victim-special-teacher"]'));

    const relatedPersons = window.TEA_RELATED_PERSONS.collectRelatedPersons();

    const violationTypes = Array.from(document.querySelectorAll('.violation-type-checkbox:checked')).map((cb) => cb.value);

    const immediateSeparation = window.TEA_UI.getYnValue(document.querySelector('[data-yn-group="immediate-separation"]'));
    const victimOtherOpinion = document.getElementById('field-victim-other-opinion').value.trim();

    const witnessPresence = window.TEA_UI.getYnValue(document.querySelector('[data-yn-group="witness-presence"]'));
    const witnessInfo =
      witnessPresence === '유'
        ? {
            name: document.getElementById('field-witness-name').value.trim(),
            phone: document.getElementById('field-witness-phone').value.trim(),
            relation: document.getElementById('field-witness-relation').value.trim(),
          }
        : null;

    const progressSteps = window.TEA_TIMELINE.collectTimelineData();

    const priority = decidePriority(violationTypes, immediateSeparation);
    const caseType = buildCaseTypeLabel(violationTypes);

    const timelineFromProgress = window.TEA_TIMELINE.buildDisplayTimeline(progressSteps);
    const timeline =
      timelineFromProgress.length > 0
        ? timelineFromProgress
        : [{ date: reportDate, note: isDraft ? '임시저장된 사안 (추가 작성이 필요합니다)' : '신규 사안 접수 (사안 접수 팝업을 통해 등록됨)' }];

    const rawTitle = caseContent && !caseContent.startsWith('(임시저장)') ? caseContent.split('\n')[0].slice(0, 40) : `${victimName} 교사 교육활동 침해 사안`;
    const title = isDraft ? `[임시저장] ${rawTitle}` : rawTitle;

    return {
      classificationInput: { regionCode, levelCode, schoolName, reportDate },
      caseFields: {
        status: window.TEA_DATA.deriveStatusFromProgress(progressSteps),
        isDraft: !!isDraft,
        priority,
        caseType,
        title,
        teacherName: victimName,
        school: schoolName,
        // NEIS 학교기본정보 객체 전체({ id: 학교코드, name: 정식학교명, level, region }).
        // 화면 표시는 계속 문자열(school)을 사용하고, 이 필드는 상세 데이터가
        // 필요할 때(추후 통계·연동 등)를 위해 통째로 Firestore에 함께 저장한다.
        schoolInfo: selectedSchoolInfo || null,
        gradeClass: '',
        manager: '배정 대기',
        reporter: `${reporterName}${reporterRelation ? ' (' + reporterRelation + ')' : ''}`,
        reporterName,
        reporterRelation,
        receivedDate: reportDate,
        description: caseContent,
        timeline,

        reportTime,
        victim: {
          name: victimName,
          gender: victimGender,
          phone: victimPhone,
          employment: victimEmployment,
          homeroomYn: victimHomeroomYn,
          specialTeacherYn: victimSpecialTeacherYn,
        },
        relatedPersons,
        violationTypes,
        victimRequest: {
          immediateSeparationYn: immediateSeparation,
          otherOpinion: victimOtherOpinion,
        },
        witnessPresence,
        witnessInfo,
        progressSteps,
      },
    };
  }

  // ---------------------------------------------------------------------
  // 초기화 (등록/임시저장 완료 후, 취소 시 공통으로 사용)
  // ---------------------------------------------------------------------
  function resetForm() {
    const form = document.getElementById('new-case-form');
    if (form) form.reset();

    clearFieldErrors();

    window.TEA_UI.setYnValue(document.querySelector('[data-yn-group="victim-homeroom"]'), 'N');
    window.TEA_UI.setYnValue(document.querySelector('[data-yn-group="victim-special-teacher"]'), 'N');
    window.TEA_UI.setYnValue(document.querySelector('[data-yn-group="immediate-separation"]'), 'N');
    window.TEA_UI.setYnValue(document.querySelector('[data-yn-group="witness-presence"]'), '무');

    const witnessPanel = document.querySelector('[data-witness-panel]');
    if (witnessPanel) witnessPanel.classList.add('hidden');

    window.TEA_RELATED_PERSONS.resetRelatedPersons();
    window.TEA_RELATED_PERSONS.addRelatedPersonEntry();

    window.TEA_ATTACHMENTS.resetAttachments();
    window.TEA_TIMELINE.resetTimeline();
    window.TEA_SCHOOL_SEARCH.reset();

    applyRegionLockIfNeeded();
  }

  /** 등록/임시저장 공통 후처리: 모달 닫기 + 낙관적 로컬 반영 + 대시보드 갱신
   *  (Firestore 실시간 구독이 곧 동일한 데이터로 다시 채워 넣지만,
   *   네트워크 왕복 지연 없이 즉시 화면에 반영되도록 먼저 로컬에 추가한다.
   *   창 닫기를 가장 먼저 수행해, 이후 폼 초기화 중 오류가 나도 등록 창이
   *   화면에 남지 않도록 한다.) */
  function finalizeAndClose(newCase, successMessage) {
    window.TEA_NEW_CASE_MODAL.close();
    window.TEA_TOAST.show(successMessage, 'success');

    try {
      window.TEA_DATA.addCase(newCase);
      window.TEA_SUMMARY.renderSummaryCards();
      window.TEA_KANBAN.renderKanbanBoard();
      if (window.TEA_DATABASE) window.TEA_DATABASE.render();
      resetForm();
      window.TEA_NAV.switchView('dashboard');
    } catch (err) {
      console.error('[TEA_NEW_CASE_FORM] 등록 후처리 중 오류:', err);
    }
  }

  function setFormButtonsBusy(busy, busyLabel) {
    const submitBtn = document.getElementById('submit-case-btn');
    const draftBtn = document.getElementById('draft-save-case-btn');
    const cancelBtn = document.getElementById('cancel-case-form-btn');
    [submitBtn, draftBtn, cancelBtn].forEach((btn) => {
      if (btn) btn.disabled = busy;
    });
    if (submitBtn) submitBtn.textContent = busy ? busyLabel || '처리 중...' : '사안 등록';
  }

  // ---------------------------------------------------------------------
  // 버튼 1) [취소] - 입력 내용을 반영하지 않고 팝업만 닫음
  // ---------------------------------------------------------------------
  function handleCancel() {
    resetForm();
    window.TEA_NEW_CASE_MODAL.close();
  }

  // ---------------------------------------------------------------------
  // 버튼 2) [임시저장] - 필수값이 비어 있어도 더미 값으로 채워 우선 저장.
  //   정식 일련번호(Transaction)는 소비하지 않고, "임시" 전용 카운터로
  //   별도 채번된 ID로 Firestore에 isDraft:true 상태로 저장한다.
  // ---------------------------------------------------------------------
  function handleDraftSave() {
    const { classificationInput, caseFields } = buildCaseInputFromForm(true);

    setFormButtonsBusy(true, '임시저장 번호 발급 중...');

    window.TEA_CLASSIFICATION.reserveDraftClassification(classificationInput)
      .then((classification) => {
        const caseId = classification.full;
        setFormButtonsBusy(true, '임시저장 중...');

        return window.TEA_ATTACHMENTS.finalizeDefaultAttachments(caseId, classification.regionCode).then((attachments) => {
          const newCase = Object.assign({ id: caseId, classification, attachments }, caseFields);
          return window.TEA_FIRESTORE.createCase(newCase).then(() => newCase);
        });
      })
      .then((newCase) => {
        finalizeAndClose(newCase, `사안이 임시저장되었습니다. (분류번호: ${newCase.id}) 추후 이어서 작성해 주세요.`);
      })
      .catch((err) => {
        console.error('[TEA_NEW_CASE_FORM] 임시저장 실패:', err);
        window.TEA_TOAST.show('임시저장 중 오류가 발생했습니다. 네트워크 상태를 확인 후 다시 시도해 주세요.', 'error');
      })
      .finally(() => setFormButtonsBusy(false));
  }

  // ---------------------------------------------------------------------
  // 버튼 3) [사안 등록] - 필수값 전체 검증 후:
  //   1) Firestore 트랜잭션으로 분류번호 일련번호 채번
  //   2) 첨부파일을 Cloud Storage에 실제 업로드
  //   3) 완성된 사안 문서를 Firestore에 저장
  // ---------------------------------------------------------------------
  function handleSubmit(e) {
    e.preventDefault();
    if (!validateForm()) return;

    const { classificationInput, caseFields } = buildCaseInputFromForm(false);

    setFormButtonsBusy(true, '분류번호 채번 중...');

    window.TEA_CLASSIFICATION.reserveClassification(classificationInput)
      .then((classification) => {
        const caseId = classification.full;
        setFormButtonsBusy(true, '첨부파일 업로드 중...');

        return window.TEA_ATTACHMENTS.finalizeDefaultAttachments(caseId, classification.regionCode).then((attachments) => {
          const newCase = Object.assign({ id: caseId, classification, attachments }, caseFields);
          setFormButtonsBusy(true, '사안 등록 중...');
          return window.TEA_FIRESTORE.createCase(newCase).then(() => newCase);
        });
      })
      .then((newCase) => {
        finalizeAndClose(newCase, `사안이 정상 등록되었습니다. (분류번호: ${newCase.id})`);
      })
      .catch((err) => {
        console.error('[TEA_NEW_CASE_FORM] 사안 등록 실패:', err);
        window.TEA_TOAST.show('사안 등록 중 오류가 발생했습니다. 네트워크 상태를 확인 후 다시 시도해 주세요.', 'error');
      })
      .finally(() => setFormButtonsBusy(false));
  }

  function initNewCaseForm() {
    populateSelectOptions(document.getElementById('field-region'), REGIONS, (r) => r.code, (r) => `${r.code} - ${r.name}`);
    populateSelectOptions(
      document.getElementById('field-school-level'),
      SCHOOL_LEVELS,
      (l) => l.code,
      (l) => `${l.code} - ${l.name}`
    );
    populateSelectOptions(
      document.getElementById('field-reporter-relation'),
      REPORTER_RELATIONS,
      (r) => r,
      (r) => r
    );
    renderViolationTypeCheckboxes();

    initWitnessToggle();

    window.TEA_RELATED_PERSONS.initRelatedPersons();
    window.TEA_ATTACHMENTS.initAttachmentDropzone();
    window.TEA_TIMELINE.initTimeline();
    window.TEA_SCHOOL_SEARCH.init();

    const form = document.getElementById('new-case-form');
    if (form) {
      form.addEventListener('submit', handleSubmit);
      // Enter 키로 실수 등록되는 것을 방지: 오직 [사안 등록] 버튼을 눌러야만 제출된다.
      window.TEA_UI.disableEnterSubmit(form);
    }

    const cancelBtn = document.getElementById('cancel-case-form-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', handleCancel);

    const draftBtn = document.getElementById('draft-save-case-btn');
    if (draftBtn) draftBtn.addEventListener('click', handleDraftSave);

    applyRegionLockIfNeeded();
  }

  window.TEA_NEW_CASE_FORM = { initNewCaseForm, handleCancel, onModalOpen: applyRegionLockIfNeeded };
})();
