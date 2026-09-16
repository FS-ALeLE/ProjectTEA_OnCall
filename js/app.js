/**
 * app.js
 * -----------------------------------------------------------------------
 * 애플리케이션 진입점(Entry Point).
 *
 * 문서 로드가 끝나면:
 *   1) 로그인 여부와 무관하게 항상 필요한 화면 뼈대(네비게이션, 모달,
 *      새 사안 접수 폼, 실시간 시계)를 초기화한다.
 *   2) Firebase Authentication 로그인/로그아웃 흐름(js/auth.js)을 시작한다.
 *   3) 로그인이 완료되어 세션(권한/소속 지역)이 확정되면, auth.js가
 *      window.TEA_APP.startAfterLogin(session)을 호출하여 그 시점부터
 *      Firestore 사안 데이터 구독과 화면 렌더링을 시작한다.
 *   4) 로그아웃되면 window.TEA_APP.stopAfterLogout()이 호출되어 실시간
 *      구독을 해제하고 화면을 초기 상태로 되돌린다.
 * -----------------------------------------------------------------------
 */
(function () {
  'use strict';

  function updateClock() {
    const dateEl = document.getElementById('live-clock-date');
    const timeEl = document.getElementById('live-clock-time');
    if (!dateEl || !timeEl) return;
    const now = new Date();
    const weekday = ['일', '월', '화', '수', '목', '금', '토'][now.getDay()];
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    dateEl.textContent = `${y}.${m}.${d} (${weekday})`;
    timeEl.textContent = `${hh}:${mm}:${ss}`;
  }

  /** 로그인 세션이 확정된 이후 호출: 사안 데이터 실시간 구독 + 전체 화면 렌더링 시작 */
  function startAfterLogin(session) {
    window.TEA_FIRESTORE.subscribeCases(
      session,
      () => {
        window.TEA_SUMMARY.renderSummaryCards();
        window.TEA_KANBAN.renderKanbanBoard();
        if (window.TEA_DATABASE) window.TEA_DATABASE.render();
      },
      () => {
        window.TEA_TOAST.show('사안 데이터를 불러오는 중 오류가 발생했습니다. 새로고침 후 다시 시도해 주세요.', 'error');
      }
    );

    window.TEA_FOLLOWUP.renderFollowUpWidget();

    if (session.role === 'hq') {
      window.TEA_STATS.init();
      window.TEA_ADMIN_ACCOUNTS.init();
      window.TEA_ADMIN_ACCOUNTS.loadAndRenderAccounts();
    }
  }

  /** 로그아웃 시 호출: 실시간 구독 해제 + 화면 데이터 초기화 */
  function stopAfterLogout() {
    if (window.TEA_FIRESTORE) window.TEA_FIRESTORE.unsubscribeCases();
    window.TEA_DATA.replaceAllCases([]);
    window.TEA_SUMMARY.renderSummaryCards();
    window.TEA_KANBAN.renderKanbanBoard();
    if (window.TEA_DATABASE) window.TEA_DATABASE.render();
    window.TEA_NAV.switchView('dashboard');
  }

  function init() {
    window.TEA_NAV.initNav();
    window.TEA_NAV.switchView('dashboard');

    window.TEA_MODAL.initModal();
    window.TEA_NEW_CASE_MODAL.init();
    window.TEA_DATABASE.init();
    window.TEA_NEW_CASE_FORM.initNewCaseForm();

    window.TEA_AUTH.initAuth();

    updateClock();
    setInterval(updateClock, 1000);
  }

  window.TEA_APP = { startAfterLogin, stopAfterLogout };

  document.addEventListener('DOMContentLoaded', init);
})();
