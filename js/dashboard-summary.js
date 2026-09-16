/**
 * dashboard-summary.js
 * -----------------------------------------------------------------------
 * 홈 대시보드 상단 배너의 "현재 상태 요약 지표 카드"
 * (접수 / 진행중 / 사후관리 / 종결) 건수를 계산하여 화면에 반영합니다.
 * -----------------------------------------------------------------------
 */
(function () {
  'use strict';

  function renderSummaryCards() {
    const { cases, CASE_STATUS } = window.TEA_DATA;

    const counts = {
      [CASE_STATUS.RECEIVED]: 0,
      [CASE_STATUS.IN_PROGRESS]: 0,
      [CASE_STATUS.AFTERCARE]: 0,
      [CASE_STATUS.CLOSED]: 0,
    };

    cases.forEach((c) => {
      if (counts[c.status] !== undefined) counts[c.status] += 1;
    });

    const map = {
      'stat-received': counts[CASE_STATUS.RECEIVED],
      'stat-inprogress': counts[CASE_STATUS.IN_PROGRESS],
      'stat-aftercare': counts[CASE_STATUS.AFTERCARE],
      'stat-closed': counts[CASE_STATUS.CLOSED],
    };

    Object.keys(map).forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = map[id] + '건';
    });

    const totalEl = document.getElementById('stat-total');
    if (totalEl) totalEl.textContent = cases.length + '건';
  }

  window.TEA_SUMMARY = { renderSummaryCards };
})();
