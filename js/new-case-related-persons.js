/**
 * new-case-related-persons.js
 * -----------------------------------------------------------------------
 * [침해 관련자] 가변(동적) 입력 UI. "사안 접수" 폼과 사건 상세 모달의
 * [수정] 모드에서 함께 재사용할 수 있도록, 대상 컨테이너를 인자로 받는
 * 형태로 구현되어 있습니다. (인자를 생략하면 "사안 접수" 폼의 기본
 * 컨테이너(#related-persons-list)를 사용합니다.)
 *
 * [+ 관련자 추가] 버튼을 누르면 인적사항 입력 카드가 목록 아래에 추가됩니다.
 * 각 카드의 "구분"이 '학생'으로 선택되면, 학생에게만 의미가 있는
 * 특수교육대상자여부 / 보호자 이름 / 보호자 연락처 입력칸이 슬라이딩
 * 애니메이션과 함께 나타납니다. (학생이 아닌 경우에는 모두 숨김)
 * -----------------------------------------------------------------------
 */
(function () {
  'use strict';

  const { RELATED_PERSON_TYPES } = window.TEA_FORM_OPTIONS;
  const DEFAULT_LIST_ID = 'related-persons-list';

  let entrySeq = 0;

  function escapeAttr(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }

  function buildTypeOptionsHtml(selected) {
    return RELATED_PERSON_TYPES.map(
      (type) => `<option value="${type}" ${type === selected ? 'selected' : ''}>${type}</option>`
    ).join('');
  }

  function resolveList(container) {
    if (container instanceof HTMLElement) return container;
    return document.getElementById(DEFAULT_LIST_ID);
  }

  /** @param {object} [prefill] 기존 관련자 데이터(수정 모드에서 값을 채워 넣을 때 사용) */
  function createRelatedPersonEntry(prefill) {
    prefill = prefill || {};
    entrySeq += 1;
    const entryId = 'rel-' + entrySeq;
    const isStudent = (prefill.type || '학생') === '학생';

    const wrapper = document.createElement('div');
    wrapper.className = 'related-person-entry bg-slate-50 border border-slate-200 rounded-xl p-3 relative';
    wrapper.setAttribute('data-entry-id', entryId);

    wrapper.innerHTML = `
      <button type="button" class="related-person-remove absolute top-2.5 right-2.5 w-6 h-6 rounded-full bg-white border border-slate-200 hover:bg-rose-50 hover:border-rose-200 flex items-center justify-center text-slate-400 hover:text-rose-500 transition-colors" title="이 관련자 삭제">
        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>

      <div class="grid grid-cols-3 gap-3 pr-7">
        <div>
          <label class="form-label">구분</label>
          <select class="form-select related-person-type" data-field="type">
            ${buildTypeOptionsHtml(prefill.type || '학생')}
          </select>
        </div>
        <div>
          <label class="form-label">이름</label>
          <input type="text" class="form-input" data-field="name" placeholder="이름 입력" value="${escapeAttr(prefill.name)}" />
        </div>
        <div>
          <label class="form-label">성별</label>
          <div class="flex items-center gap-3 h-[34px]">
            <label class="radio-inline"><input type="radio" name="gender-${entryId}" value="남" data-field="gender" ${prefill.gender !== '여' ? 'checked' : ''} /> 남</label>
            <label class="radio-inline"><input type="radio" name="gender-${entryId}" value="여" data-field="gender" ${prefill.gender === '여' ? 'checked' : ''} /> 여</label>
          </div>
        </div>
      </div>

      <div class="slide-panel ${isStudent ? '' : 'hidden'} mt-3 pt-3 border-t border-dashed border-slate-300 grid grid-cols-3 gap-3" data-guardian-panel>
        <div>
          <label class="form-label">특수교육대상자여부</label>
          <div class="yn-toggle" data-yn-group="sped-${entryId}" data-value="${prefill.specialEdYn === 'Y' ? 'Y' : 'N'}" data-field="specialEdYn">
            <button type="button" class="yn-option ${prefill.specialEdYn !== 'Y' ? 'yn-option-active' : ''}" data-yn-value="N">N</button>
            <button type="button" class="yn-option ${prefill.specialEdYn === 'Y' ? 'yn-option-active' : ''}" data-yn-value="Y">Y</button>
          </div>
        </div>
        <div>
          <label class="form-label">보호자 이름</label>
          <input type="text" class="form-input" data-field="guardianName" placeholder="보호자 이름 입력" value="${escapeAttr(prefill.guardianName)}" />
        </div>
        <div>
          <label class="form-label">보호자 연락처</label>
          <input type="text" class="form-input phone-input" data-field="guardianPhone" placeholder="010-0000-0000" inputmode="numeric" value="${escapeAttr(prefill.guardianPhone)}" />
        </div>
      </div>
    `;

    const typeSelect = wrapper.querySelector('.related-person-type');
    const guardianPanel = wrapper.querySelector('[data-guardian-panel]');

    typeSelect.addEventListener('change', () => {
      window.TEA_UI.slideToggle(guardianPanel, typeSelect.value === '학생');
    });

    wrapper.querySelector('.related-person-remove').addEventListener('click', () => {
      wrapper.classList.add('related-person-removing');
      setTimeout(() => wrapper.remove(), 180);
    });

    return wrapper;
  }

  /**
   * @param {HTMLElement} [container] 대상 목록 컨테이너 (생략 시 "사안 접수" 폼의 기본 목록)
   * @param {object} [prefill] 기존 관련자 데이터
   */
  function addRelatedPersonEntry(container, prefill) {
    const list = resolveList(container);
    if (!list) return;
    list.appendChild(createRelatedPersonEntry(prefill));
  }

  function collectRelatedPersons(container) {
    const list = resolveList(container);
    if (!list) return [];

    return Array.from(list.querySelectorAll('.related-person-entry')).map((entry) => {
      const type = entry.querySelector('[data-field="type"]').value;
      const name = entry.querySelector('[data-field="name"]').value.trim();
      const genderInput = entry.querySelector('[data-field="gender"]:checked');

      const result = {
        type,
        name,
        gender: genderInput ? genderInput.value : '',
      };

      // 특수교육대상자여부 / 보호자 정보는 '학생'인 경우에만 의미가 있다.
      if (type === '학생') {
        const specialEdGroup = entry.querySelector('[data-yn-group^="sped-"]');
        result.specialEdYn = window.TEA_UI.getYnValue(specialEdGroup) || 'N';
        result.guardianName = entry.querySelector('[data-field="guardianName"]').value.trim();
        result.guardianPhone = entry.querySelector('[data-field="guardianPhone"]').value.trim();
      }

      return result;
    });
  }

  function resetRelatedPersons(container) {
    const list = resolveList(container);
    if (list) list.innerHTML = '';
  }

  function initRelatedPersons() {
    const addBtn = document.getElementById('add-related-person-btn');
    if (addBtn) addBtn.addEventListener('click', () => addRelatedPersonEntry());
    // 폼 최초 진입 시 입력을 바로 시작할 수 있도록 카드 1개를 기본 배치
    addRelatedPersonEntry();
  }

  window.TEA_RELATED_PERSONS = {
    initRelatedPersons,
    addRelatedPersonEntry,
    collectRelatedPersons,
    resetRelatedPersons,
  };
})();
