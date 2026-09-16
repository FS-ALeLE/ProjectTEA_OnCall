/**
 * kanban.js
 * -----------------------------------------------------------------------
 * 홈 대시보드 중앙 영역 - 미해결 사안 칸반보드.
 * "종결"된 사건은 제외하고 [접수] - [진행중] - [사후관리] 3개 컬럼에
 * 처리 중인 사안 카드를 렌더링합니다. 카드를 클릭하면 상세 모달이 열립니다.
 * -----------------------------------------------------------------------
 */
(function () {
  'use strict';

  const COLUMN_ORDER = ['received', 'inprogress', 'aftercare'];

  /** 접수일로부터 경과 일수 계산 (D+n) */
  function getElapsedDays(receivedDate) {
    const start = new Date(receivedDate + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffMs = today.getTime() - start.getTime();
    return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
  }

  function createCaseCardElement(caseItem) {
    const { STATUS_META, PRIORITY_META } = window.TEA_DATA;
    const statusMeta = STATUS_META[caseItem.status];
    const priorityMeta = PRIORITY_META[caseItem.priority] || PRIORITY_META.medium;
    const elapsed = getElapsedDays(caseItem.receivedDate);

    const card = document.createElement('button');
    card.type = 'button';
    card.className =
      'kanban-card w-full text-left bg-white rounded-xl border border-slate-200 border-l-4 ' +
      statusMeta.cardBorder +
      ' shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 p-4 flex flex-col gap-2.5 cursor-pointer';
    card.setAttribute('data-case-id', caseItem.id);
    card.title = '클릭하여 사건 상세 정보 보기';

    card.innerHTML = `
      <div class="flex items-start justify-between gap-2">
        <span class="text-[10.5px] font-semibold text-slate-400 leading-snug break-all">${caseItem.id}</span>
        <span class="flex items-center gap-1.5 shrink-0">
          ${caseItem.isDraft ? '<span class="draft-badge">임시저장</span>' : ''}
          <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold ${priorityMeta.badgeClass}">${priorityMeta.label}</span>
        </span>
      </div>
      <h4 class="text-[15px] font-bold text-slate-800 leading-snug line-clamp-2">${caseItem.title}</h4>
      <div class="flex flex-wrap items-center gap-1.5 text-[12px] text-slate-500">
        <span class="inline-flex items-center gap-1 bg-slate-50 px-2 py-0.5 rounded-md ring-1 ring-inset ring-slate-200">
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
          ${caseItem.teacherName} 교사
        </span>
        <span class="inline-flex items-center gap-1 bg-slate-50 px-2 py-0.5 rounded-md ring-1 ring-inset ring-slate-200">
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/></svg>
          ${caseItem.school}
        </span>
      </div>
      <div class="flex items-center justify-between pt-2 mt-auto border-t border-slate-100">
        <span class="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600">${caseItem.caseType}</span>
        <span class="flex items-center gap-2">
          ${
            caseItem.isDraft
              ? `<button type="button" class="draft-delete-btn inline-flex items-center gap-1 text-[11px] font-bold text-rose-500 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-2 py-0.5 rounded-md transition-colors" data-draft-delete="${caseItem.id}" title="임시저장 사안 삭제">
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3m5 0H4" /></svg>
                  삭제
                </button>`
              : ''
          }
          <span class="text-[12px] text-slate-400 font-medium">접수 D+${elapsed}일</span>
        </span>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-draft-delete]')) return;
      if (window.TEA_MODAL) window.TEA_MODAL.openCaseModal(caseItem.id);
    });

    if (caseItem.isDraft) {
      const deleteBtn = card.querySelector('[data-draft-delete]');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (window.TEA_DRAFT) window.TEA_DRAFT.deleteDraft(caseItem.id);
        });
      }
    }

    return card;
  }

  function renderKanbanBoard() {
    const { cases } = window.TEA_DATA;

    COLUMN_ORDER.forEach((statusKey) => {
      const listEl = document.getElementById('kanban-list-' + statusKey);
      const countEl = document.getElementById('kanban-count-' + statusKey);
      const emptyEl = document.getElementById('kanban-empty-' + statusKey);
      if (!listEl) return;

      const items = cases.filter((c) => c.status === statusKey);

      listEl.innerHTML = '';
      items.forEach((item) => listEl.appendChild(createCaseCardElement(item)));

      if (countEl) countEl.textContent = items.length + '건';
      if (emptyEl) emptyEl.classList.toggle('hidden', items.length > 0);
    });
  }

  window.TEA_KANBAN = { renderKanbanBoard, getElapsedDays };
})();
