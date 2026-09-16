/**
 * new-case-modal.js
 * -----------------------------------------------------------------------
 * "새 사안 접수" 팝업 모달의 열기/닫기(가시성)만 전담하는 모듈입니다.
 * 폼 입력값 초기화·검증·저장 등의 업무 로직은 new-case-form.js 에서 처리하며,
 * 이 모듈은 순수하게 화면에 모달을 보이거나 숨기는 역할만 담당합니다.
 * -----------------------------------------------------------------------
 */
(function () {
  'use strict';

  function getModal() {
    return document.getElementById('new-case-modal');
  }

  function openNewCaseModal() {
    const modal = getModal();
    if (!modal) return;
    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
      modal.classList.add('modal-open');
      const body = document.getElementById('new-case-modal-body');
      if (body) body.scrollTop = 0;
    });
    document.body.classList.add('overflow-hidden');

    if (window.TEA_NEW_CASE_FORM && typeof window.TEA_NEW_CASE_FORM.onModalOpen === 'function') {
      window.TEA_NEW_CASE_FORM.onModalOpen();
    }
  }

  function closeNewCaseModal() {
    const modal = getModal();
    if (!modal) return;
    modal.classList.remove('modal-open');
    document.body.classList.remove('overflow-hidden');
    setTimeout(() => modal.classList.add('hidden'), 150);
  }

  function isNewCaseModalOpen() {
    const modal = getModal();
    return !!modal && !modal.classList.contains('hidden');
  }

  /** 취소 처리 위임: 폼 로직(초기화)이 등록되어 있으면 그것을 우선 사용, 없으면 그냥 닫기만 함 */
  function delegateCancel() {
    if (window.TEA_NEW_CASE_FORM && typeof window.TEA_NEW_CASE_FORM.handleCancel === 'function') {
      window.TEA_NEW_CASE_FORM.handleCancel();
    } else {
      closeNewCaseModal();
    }
  }

  function initNewCaseModal() {
    const modal = getModal();
    if (!modal) return;

    document.querySelectorAll('#open-new-case-btn').forEach((btn) => {
      btn.addEventListener('click', openNewCaseModal);
    });

    // ※ 배경(바깥) 클릭으로는 닫히지 않고 오직 [X] 닫기 버튼과 [취소] 버튼으로만
    //   닫는다. ESC 키는 js/modal-esc.js가 이 버튼을 그대로 클릭해 동일하게
    //   (폼 초기화 포함) 동작하도록 공통 처리한다.
    modal.querySelectorAll('[data-new-case-close]').forEach((btn) => {
      btn.addEventListener('click', delegateCancel);
    });
  }

  window.TEA_NEW_CASE_MODAL = {
    open: openNewCaseModal,
    close: closeNewCaseModal,
    isOpen: isNewCaseModalOpen,
    init: initNewCaseModal,
  };
})();
