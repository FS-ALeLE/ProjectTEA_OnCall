/**
 * nav.js
 * -----------------------------------------------------------------------
 * 좌측 고정 네비게이션 메뉴 동작 + 화면(View) 전환 라우터.
 *
 * index.html 에는 3개의 화면 컨테이너(.view-section: 홈 대시보드, 종합
 * 데이터베이스, 본청 통계)가 미리 정의되어 있으며, 이 스크립트는 nav 버튼
 * 클릭 시 해당 화면만 보이도록 전환하고, 현재 활성화된 메뉴에 강조 스타일을
 * 적용합니다.
 *
 * 단, [새 사안 접수] 메뉴는 더 이상 "화면 전환"이 아니라 팝업 모달을 여는
 * 동작으로 취급합니다. (현재 보고 있던 화면은 그대로 유지된 채 모달만 위에 뜸)
 * -----------------------------------------------------------------------
 */
(function () {
  'use strict';

  const VIEW_TITLES = {
    dashboard: { title: '사안 현황', desc: '전체 사안 현황을 한눈에 확인합니다.' },
    database: { title: '데이터베이스', desc: '누적된 전체 사안을 조회·관리합니다.' },
    stats: { title: '통계', desc: '교권침해사안에 대한 통계를 확인합니다.' },
    'admin-accounts': { title: '계정 관리', desc: '시스템 로그인 계정을 생성하고 관리합니다.' },
  };

  function switchView(viewName) {
    document.querySelectorAll('.view-section').forEach((section) => {
      section.classList.add('hidden');
    });

    const target = document.getElementById('view-' + viewName);
    if (target) {
      target.classList.remove('hidden');
    }

    document.querySelectorAll('.nav-item').forEach((btn) => {
      const isActive = btn.getAttribute('data-view') === viewName;
      btn.classList.toggle('nav-item-active', isActive);
    });

    const meta = VIEW_TITLES[viewName];
    const titleEl = document.getElementById('page-title');
    const descEl = document.getElementById('page-desc');
    if (meta && titleEl) titleEl.textContent = meta.title;
    if (meta && descEl) descEl.textContent = meta.desc;

    document.title = '교권침해사안관리시스템';

    // 계정 관리 화면으로 들어올 때마다 Firestore에서 최신 계정 목록을 다시 불러온다.
    // (콘솔에서 계정을 추가한 뒤에도, 로그인 직후 한 번만 조회한 목록에 묶이지 않도록)
    if (viewName === 'admin-accounts' && window.TEA_ADMIN_ACCOUNTS) {
      window.TEA_ADMIN_ACCOUNTS.loadAndRenderAccounts();
    }

    // 통계 화면은 로그인 직후(숨김 상태)에 Chart.js가 그려지면 캔버스 크기가 0이라
    // 빈 화면으로 남을 수 있다. 화면에 진입한 뒤 전체 지역(필터 기본값)으로 다시 그린다.
    if (viewName === 'stats' && window.TEA_STATS && typeof window.TEA_STATS.render === 'function') {
      requestAnimationFrame(() => window.TEA_STATS.render());
    }
  }

  function initNav() {
    const buttons = document.querySelectorAll('.nav-item');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const view = btn.getAttribute('data-view');
        if (!view) return;

        // [새 사안 접수]는 페이지 전환이 아니라 팝업 모달 오픈으로 처리한다.
        if (view === 'new-case') {
          if (window.TEA_NEW_CASE_MODAL) window.TEA_NEW_CASE_MODAL.open();
          return;
        }

        switchView(view);
      });
    });
  }

  window.TEA_NAV = { initNav, switchView };
})();
