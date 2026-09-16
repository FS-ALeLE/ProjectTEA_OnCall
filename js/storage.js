/**
 * storage.js
 * -----------------------------------------------------------------------
 * 브라우저 localStorage를 이용한 간단한 상태 저장소.
 *
 * 사안(Case) 데이터 자체와 사건 수정 이력은 이제 Firestore(js/firebase-cases.js)
 * 를 통해 실제 서버 데이터베이스에 영구 저장되므로, 이 파일은 오직
 * "복귀 관리 알림 위젯에서 완료 처리한 항목의 ID 목록"처럼 사용자의
 * 브라우저에만 남기면 되는 가벼운 UI 상태만 다룬다.
 * -----------------------------------------------------------------------
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'tea_followup_completed_v1';

  function getCompletedIds() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.warn('[TEA_STORAGE] 완료 목록을 불러오지 못했습니다:', err);
      return [];
    }
  }

  function addCompletedId(id) {
    const ids = getCompletedIds();
    if (!ids.includes(id)) {
      ids.push(id);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
      } catch (err) {
        console.warn('[TEA_STORAGE] 완료 상태 저장에 실패했습니다:', err);
      }
    }
  }

  function isCompleted(id) {
    return getCompletedIds().includes(id);
  }

  function resetCompletedIds() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.warn('[TEA_STORAGE] 완료 목록 초기화에 실패했습니다:', err);
    }
  }

  window.TEA_STORAGE = {
    getCompletedIds,
    addCompletedId,
    isCompleted,
    resetCompletedIds,
  };
})();
