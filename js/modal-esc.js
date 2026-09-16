/**
 * modal-esc.js
 * -----------------------------------------------------------------------
 * ESC 키로 팝업(모달)을 닫는 공통 로직.
 *
 * 각 팝업이 원래 갖고 있는 [X]/[취소] 닫기 버튼을 그대로 클릭해 주는
 * 방식으로 동작하므로, 폼 초기화 등 기존 닫기 로직과 완전히 동일하게 처리된다.
 *
 * 여러 팝업이 겹쳐 열려 있을 수 있으므로(예: 사건카드 위의 메모창, 계정
 * 생성창 위의 비밀번호 변경창), 배열 순서상 위(z-index가 더 높은, 나중에
 * 열리는) 팝업을 먼저 검사해 그중 열려 있는 팝업만 닫는다.
 * -----------------------------------------------------------------------
 */
(function () {
  'use strict';

  const ESC_TARGETS = [
    { modalId: 'case-memo-modal', closeSelector: '[data-memo-close]' },
    { modalId: 'admin-password-modal', closeSelector: '[data-admin-password-close]' },
    { modalId: 'admin-account-modal', closeSelector: '[data-admin-account-close]' },
    { modalId: 'case-modal', closeSelector: '[data-modal-close]' },
    { modalId: 'new-case-modal', closeSelector: '[data-new-case-close]' },
  ];

  function isOpen(modalId) {
    const el = document.getElementById(modalId);
    return !!el && !el.classList.contains('hidden');
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;

    // 사건 카드에서 제목 수정 중이면 모달을 닫지 않고, 제목 편집 취소만 처리한다.
    const titleForm = document.querySelector('#case-modal [data-case-title-edit-form]:not(.hidden)');
    if (titleForm && isOpen('case-modal')) {
      const cancelBtn = titleForm.querySelector('[data-case-title-cancel]');
      if (cancelBtn) cancelBtn.click();
      return;
    }

    const target = ESC_TARGETS.find((t) => isOpen(t.modalId));
    if (!target) return;

    const modal = document.getElementById(target.modalId);
    const closeBtn = modal ? modal.querySelector(target.closeSelector) : null;
    if (closeBtn) closeBtn.click();
  });
})();
