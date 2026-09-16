/**
 * data.js
 * -----------------------------------------------------------------------
 * 교권보호 부서 사건 관리 시스템 - 공용 코드표 및 사안(Case) 로컬 캐시.
 *
 * 이 파일은 전역 객체 window.TEA_DATA 에 아래 내용을 담아 다른 스크립트에서
 * 사용할 수 있도록 노출합니다.
 *   - CASE_STATUS      : 사건 진행 상태 코드
 *   - STATUS_META      : 상태별 라벨/색상 등 표시 정보
 *   - PRIORITY_META    : 긴급도별 라벨/색상 정보
 *   - cases            : 현재 로그인 세션에 노출되는 사안 목록(로컬 캐시)
 *   - followUps        : 복귀 관리(사후 점검) 알림 목록
 *   - replaceAllCases() : js/firebase-cases.js의 Firestore 실시간 구독
 *                         결과로 cases 배열 전체를 교체할 때 사용
 *
 * ⚠ cases/followUps는 더 이상 더미 데이터를 하드코딩하지 않습니다.
 *   실제 데이터는 로그인 이후 js/firebase-cases.js가 Firestore의
 *   cases 컬렉션을 실시간 구독(onSnapshot)하여 이 배열을 채웁니다.
 * -----------------------------------------------------------------------
 */
(function () {
  'use strict';

  /** 오늘 날짜 기준 n일 전/후의 날짜를 'YYYY-MM-DD' 문자열로 반환 */
  function isoDateOffset(days) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  const CASE_STATUS = {
    RECEIVED: 'received',
    IN_PROGRESS: 'inprogress',
    AFTERCARE: 'aftercare',
    CLOSED: 'closed',
  };

  const STATUS_META = {
    received: {
      label: '접수',
      badgeClass: 'bg-sky-100 text-sky-700',
      cardBorder: 'border-l-sky-500',
    },
    inprogress: {
      label: '진행중',
      badgeClass: 'bg-amber-100 text-amber-700',
      cardBorder: 'border-l-amber-500',
    },
    aftercare: {
      label: '사후관리',
      badgeClass: 'bg-violet-100 text-violet-700',
      cardBorder: 'border-l-violet-500',
    },
    closed: {
      label: '종결',
      badgeClass: 'bg-emerald-100 text-emerald-700',
      cardBorder: 'border-l-emerald-500',
    },
  };

  /** 구 버전 status 코드(review=심의진행)를 신규 코드(aftercare=사후관리)로 맞춘다. */
  function normalizeCaseStatus(status) {
    if (status === 'review') return CASE_STATUS.AFTERCARE;
    return status;
  }

  function isProgressStepActive(progressSteps, key) {
    const step = (progressSteps || []).find((s) => s.key === key);
    return !!(step && step.active);
  }

  /**
   * 조치 경과(progressSteps)에 따라 사건 상태를 산출한다.
   * - 종결 + 심리지원 → 사후관리(aftercare)
   * - 종결만 → 종결(closed)  ※ 사안현황 칸반에는 표시하지 않음
   * - 1차 출동·긴급보호조치·2차 출동·지역교보위·심리지원 등 → 진행중(inprogress)
   * - 그 외(접수만) → 접수(received)
   */
  function deriveStatusFromProgress(progressSteps) {
    const closed = isProgressStepActive(progressSteps, 'closed');
    const counseling = isProgressStepActive(progressSteps, 'counseling');

    if (closed && counseling) return CASE_STATUS.AFTERCARE;
    if (closed) return CASE_STATUS.CLOSED;

    const inProgressKeys = ['firstResponse', 'protection', 'secondResponse', 'committee', 'counseling'];
    if (inProgressKeys.some((key) => isProgressStepActive(progressSteps, key))) {
      return CASE_STATUS.IN_PROGRESS;
    }

    return CASE_STATUS.RECEIVED;
  }

  /** 저장된 status와 조치 경과를 종합해 표시용 상태를 확정한다. */
  function resolveCaseStatus(caseItem) {
    if (!caseItem) return CASE_STATUS.RECEIVED;
    if (caseItem.progressSteps && caseItem.progressSteps.length > 0) {
      return deriveStatusFromProgress(caseItem.progressSteps);
    }
    return normalizeCaseStatus(caseItem.status) || CASE_STATUS.RECEIVED;
  }

  const PRIORITY_META = {
    high: {
      label: '긴급',
      badgeClass: 'bg-rose-100 text-rose-700',
      tooltip: '긴급 조건: 즉시 분리 희망(Y) 또는 침해유형에 성폭력범죄·상해·폭행·협박 포함',
    },
    medium: {
      label: '보통',
      badgeClass: 'bg-amber-100 text-amber-700',
      tooltip: '보통: 긴급 조건(즉시 분리 희망 또는 성폭력범죄·상해·폭행·협박)에 해당하지 않음',
    },
  };

  // 로그인 세션에 노출되는 사안 목록. 로그인 직후 js/firebase-cases.js의
  // subscribeCases()가 Firestore 실시간 구독 결과로 이 배열의 "내용"을
  // 교체한다(참조 자체는 그대로 유지되므로, 이 배열을 구조분해해 들고 있는
  // 다른 모듈들도 항상 최신 데이터를 참조할 수 있다).
  const cases = [];

  // 복귀 관리(사후 점검) 알림 목록. 현재는 별도 Firestore 컬렉션으로
  // 관리하지 않으며, 로그인 세션이 시작될 때 비어 있는 상태로 초기화된다.
  const followUps = [];

  /** Firestore 실시간 구독 결과로 cases 배열 전체를 교체한다(배열 참조 유지). */
  function replaceAllCases(newCases) {
    cases.length = 0;
    const normalized = (newCases || []).map((c) => {
      if (!c) return c;
      const status = resolveCaseStatus(c);
      return status === c.status ? c : Object.assign({}, c, { status });
    });
    Array.prototype.push.apply(cases, normalized);
  }

  function addCase(caseObj) {
    cases.push(caseObj);
    return caseObj;
  }

  function removeCase(caseId) {
    const idx = cases.findIndex((c) => c.id === caseId);
    if (idx < 0) return false;
    cases.splice(idx, 1);
    return true;
  }

  /**
   * 임시저장→정식 등록처럼 문서 ID가 바뀌는 경우 로컬 목록을 안전하게 교체한다.
   * Firestore onSnapshot이 이미 새 문서를 넣어 둔 상태면 중복 push 하지 않고
   * 기존 항목을 최신 값으로 덮어쓴다.
   */
  function replaceCase(oldId, newCase) {
    if (!newCase || !newCase.id) return null;

    const oldIdx = cases.findIndex((c) => c.id === oldId);
    const newIdx = cases.findIndex((c) => c.id === newCase.id);

    if (oldIdx >= 0 && newIdx >= 0 && oldIdx !== newIdx) {
      // 구독이 새 문서를 이미 추가한 뒤라 옛 임시 문서만 제거하고 새 문서를 갱신
      cases.splice(oldIdx, 1);
      const adjustedNewIdx = cases.findIndex((c) => c.id === newCase.id);
      cases[adjustedNewIdx] = newCase;
      return newCase;
    }
    if (oldIdx >= 0) {
      cases[oldIdx] = newCase;
      return newCase;
    }
    if (newIdx >= 0) {
      cases[newIdx] = newCase;
      return newCase;
    }
    cases.push(newCase);
    return newCase;
  }

  window.TEA_DATA = {
    CASE_STATUS,
    STATUS_META,
    PRIORITY_META,
    cases,
    followUps,
    isoDateOffset,
    replaceAllCases,
    addCase,
    removeCase,
    replaceCase,
    deriveStatusFromProgress,
    resolveCaseStatus,
  };
})();