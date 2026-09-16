/**
 * followup-widget.js
 * -----------------------------------------------------------------------
 * 홈 대시보드 우측 - 복귀 관리 알림 플로팅 위젯.
 * 사건 처리 후 1주 / 1개월 등 추후 복귀 점검 일정이 도래한 사안을
 * 투두리스트 형태로 상시 노출하고, 체크박스를 누르면 완료 처리되어
 * 목록에서 사라집니다(로컬 저장소에 저장되어 새로고침해도 유지).
 * -----------------------------------------------------------------------
 */
(function () {
  'use strict';

  /** 오늘 기준 D-day 뱃지 정보를 계산 */
  function getDueMeta(dueDate) {
    const due = new Date(dueDate + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { label: `D+${Math.abs(diffDays)} 지연`, className: 'bg-rose-100 text-rose-700', urgent: true };
    }
    if (diffDays === 0) {
      return { label: 'D-DAY', className: 'bg-orange-100 text-orange-700', urgent: true };
    }
    if (diffDays <= 3) {
      return { label: `D-${diffDays}`, className: 'bg-amber-100 text-amber-700', urgent: false };
    }
    return { label: `D-${diffDays}`, className: 'bg-slate-100 text-slate-500', urgent: false };
  }

  function createFollowUpItemElement(item) {
    const dueMeta = getDueMeta(item.dueDate);

    const row = document.createElement('div');
    row.className = 'followup-item flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors';
    row.setAttribute('data-followup-id', item.id);

    row.innerHTML = `
      <input type="checkbox" class="followup-checkbox mt-1 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" aria-label="복귀 점검 완료 처리" />
      <div class="flex-1 min-w-0">
        <div class="flex items-center justify-between gap-2">
          <p class="text-[13px] font-bold text-slate-800 truncate">${item.teacherName} 교사</p>
          <span class="shrink-0 text-[11px] font-bold px-1.5 py-0.5 rounded-md ${dueMeta.className}">${dueMeta.label}</span>
        </div>
        <p class="text-[12px] text-slate-500 mt-0.5">${item.label}</p>
        <div class="flex items-center justify-between mt-1.5">
          <span class="text-[11px] text-slate-400">${item.school} · ${item.dueDate}</span>
          <button type="button" class="followup-goto text-[11px] font-semibold text-indigo-500 hover:text-indigo-700" data-case-id="${item.caseId}">사안 바로가기</button>
        </div>
      </div>
    `;

    const checkbox = row.querySelector('.followup-checkbox');
    checkbox.addEventListener('change', () => {
      if (!checkbox.checked) return;
      window.TEA_STORAGE.addCompletedId(item.id);
      row.classList.add('followup-item-done');
      setTimeout(() => {
        row.remove();
        updateHeaderCount();
        toggleEmptyState();
      }, 280);
    });

    const gotoBtn = row.querySelector('.followup-goto');
    gotoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.TEA_MODAL) window.TEA_MODAL.openCaseModal(item.caseId);
    });

    return row;
  }

  function updateHeaderCount() {
    const listEl = document.getElementById('followup-list');
    const countEl = document.getElementById('followup-count-badge');
    if (!listEl || !countEl) return;
    const remaining = listEl.querySelectorAll('.followup-item').length;
    countEl.textContent = remaining;
    countEl.classList.toggle('hidden', remaining === 0);
  }

  function toggleEmptyState() {
    const listEl = document.getElementById('followup-list');
    const emptyEl = document.getElementById('followup-empty');
    if (!listEl || !emptyEl) return;
    const remaining = listEl.querySelectorAll('.followup-item').length;
    const isEmpty = remaining === 0;
    // hidden/flex 는 둘 다 display 속성을 다투므로 항상 함께 토글해 상태를 확정한다.
    emptyEl.classList.toggle('hidden', !isEmpty);
    emptyEl.classList.toggle('flex', isEmpty);
  }

  function renderFollowUpWidget() {
    const { followUps } = window.TEA_DATA;
    const listEl = document.getElementById('followup-list');
    if (!listEl) return;

    const completedIds = window.TEA_STORAGE.getCompletedIds();
    const pending = followUps
      .filter((item) => !completedIds.includes(item.id))
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

    listEl.innerHTML = '';
    pending.forEach((item) => listEl.appendChild(createFollowUpItemElement(item)));

    updateHeaderCount();
    toggleEmptyState();
  }

  window.TEA_FOLLOWUP = { renderFollowUpWidget };
})();
