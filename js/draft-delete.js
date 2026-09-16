/**
 * draft-delete.js
 * -----------------------------------------------------------------------
 * 임시저장(isDraft) 사안 삭제 공통 로직.
 * 칸반 카드 · 종합 DB 카드 · 사건 상세 모달에서 동일하게 호출합니다.
 *
 * Firestore cases 컬렉션에서 문서를 삭제하며, 실시간 구독(onSnapshot)이
 * 삭제 사실을 감지해 로컬 목록에서도 자동으로 제거된다. 첨부파일이 있었다면
 * Cloud Storage에서도 함께 정리한다.
 * -----------------------------------------------------------------------
 */
(function () {
  'use strict';

  function refreshViews() {
    if (window.TEA_SUMMARY) window.TEA_SUMMARY.renderSummaryCards();
    if (window.TEA_KANBAN) window.TEA_KANBAN.renderKanbanBoard();
    if (window.TEA_DATABASE) window.TEA_DATABASE.render();
    if (window.TEA_FOLLOWUP) window.TEA_FOLLOWUP.renderFollowUpWidget();
  }

  /**
   * 임시저장 사안만 삭제합니다.
   * @returns {boolean} 삭제 요청 시작 성공 여부(실제 삭제는 비동기로 진행됨)
   */
  function deleteDraft(caseId) {
    if (!caseId) return false;

    const caseItem = window.TEA_DATA.cases.find((c) => c.id === caseId);
    if (!caseItem) {
      window.TEA_TOAST.show('삭제할 사안을 찾을 수 없습니다.', 'error');
      return false;
    }
    if (!caseItem.isDraft) {
      window.TEA_TOAST.show('임시저장된 사안만 삭제할 수 있습니다.', 'error');
      return false;
    }

    const confirmed = window.confirm(
      `임시저장된 사안을 삭제할까요?\n\n분류번호: ${caseItem.id}\n삭제 후에는 복구할 수 없습니다.`
    );
    if (!confirmed) return false;

    const attachments = caseItem.attachments || [];

    window.TEA_FIRESTORE.deleteCase(caseId)
      .then(() => {
        // 로컬 캐시에서도 즉시 제거해 다음 실시간 구독 갱신 전까지 화면에 남지 않게 한다.
        window.TEA_DATA.removeCase(caseId);
        return Promise.all(attachments.map((f) => window.TEA_FIRESTORE.deleteAttachment(f.path)));
      })
      .then(() => {
        if (window.TEA_MODAL && typeof window.TEA_MODAL.closeCaseModal === 'function') {
          const modal = document.getElementById('case-modal');
          if (modal && !modal.classList.contains('hidden')) {
            window.TEA_MODAL.closeCaseModal();
          }
        }
        refreshViews();
        window.TEA_TOAST.show('임시저장된 사안이 삭제되었습니다.', 'success');
      })
      .catch((err) => {
        console.error('[TEA_DRAFT] 사안 삭제 실패:', err);
        window.TEA_TOAST.show('사안 삭제 중 오류가 발생했습니다. 다시 시도해 주세요.', 'error');
      });

    return true;
  }

  window.TEA_DRAFT = { deleteDraft };
})();
