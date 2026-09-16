/**
 * new-case-classification.js
 * -----------------------------------------------------------------------
 * 분류번호 생성 로직.
 *
 * 형태: [년도]-[일련번호]-[지역+학교급코드]-[지역명]-[학교명]
 * 예시(정식 등록): 2026-001-012-천안-천안호수초등학교
 * 예시(임시저장) : 2026-임시001-024-공주-천안중앙고등학교
 *   임시저장 번호는 정식 채번 카운터와 완전히 분리된 별도 카운터를 사용하므로
 *   "임시"는 임시끼리 001부터 별도로 증가하며, 정식 사안 번호 자원을 소비하지 않는다.
 *
 * 일련번호(001, 002, ...)는 더 이상 클라이언트가 로컬 배열을 훑어 계산하지
 * 않는다. 여러 장학사가 동시에 [사안 등록]을 눌러도 절대 중복되지 않도록,
 * js/firebase-cases.js의 getNextSerialTransactional()이 Firestore
 * runTransaction으로 "해당 년도 카운터를 읽고 +1 하여 다시 쓰는" 과정을
 * 원자적으로 수행한 결과를 사용한다.
 *
 * ※ 화면에 실시간 미리보기를 노출하면 "다음 일련번호"가 사용자 입력
 *   중간중간 계속 조회되어 채번이 꼬일 수 있다는 실무 피드백에 따라,
 *   이 값은 오직 "사안 등록"을 실제로 실행하는 순간에만 1회 조회되어 확정된다.
 * -----------------------------------------------------------------------
 */
(function () {
  'use strict';

  const { REGIONS, SCHOOL_LEVELS } = window.TEA_FORM_OPTIONS;

  function findRegion(code) {
    return REGIONS.find((r) => r.code === code) || null;
  }
  function findLevel(code) {
    return SCHOOL_LEVELS.find((l) => l.code === code) || null;
  }

  /** 이미 채번된 일련번호(serial)를 받아 분류번호 전체 문자열을 조립하는 순수 함수 */
  function buildClassification(input, serial) {
    const { regionCode, levelCode, schoolName, reportDate } = input || {};

    const year = reportDate ? new Date(reportDate + 'T00:00:00').getFullYear() : new Date().getFullYear();
    const region = findRegion(regionCode);
    const level = findLevel(levelCode);

    const combinedCode = (region ? region.code : '00') + (level ? level.code : '0');
    const regionName = region ? region.name : '지역미상';
    const schoolDisplay = schoolName && schoolName.trim() ? schoolName.trim() : '학교명미상';

    const full = `${year}-${serial}-${combinedCode}-${regionName}-${schoolDisplay}`;

    return {
      year,
      serial,
      regionCode: region ? region.code : '',
      levelCode: level ? level.code : '',
      regionName,
      schoolName: schoolDisplay,
      combinedCode,
      full,
    };
  }

  /**
   * [사안 등록] 시점에만 1회 호출: Firestore 트랜잭션으로 해당 연도의
   * 일련번호를 동시성 안전하게 채번한 뒤, 분류번호 전체를 확정 생성한다.
   * @param {{regionCode:string, levelCode:string, schoolName:string, reportDate:string}} input
   * @returns {Promise<object>} buildClassification()과 동일한 형태의 분류 정보
   */
  function reserveClassification(input) {
    const reportDate = input && input.reportDate;
    const year = reportDate ? new Date(reportDate + 'T00:00:00').getFullYear() : new Date().getFullYear();

    return window.TEA_FIRESTORE.getNextSerialTransactional(year).then((serial) => buildClassification(input, serial));
  }

  /**
   * [임시저장] 전용: 정식 일련번호 카운터와 완전히 분리된 "임시" 전용 카운터로
   * 채번한다(임시는 임시끼리 001, 002, ... 순서로 증가하며 정식 사안 번호
   * 자원은 소비하지 않음). 형태는 정식 분류번호와 동일하되 일련번호 자리에
   * "임시001" 처럼 표기된다. 예: 2026-임시001-024-공주-천안중앙고등학교
   * @param {{regionCode:string, levelCode:string, schoolName:string, reportDate:string}} input
   * @returns {Promise<object>} buildClassification()과 동일한 형태의 분류 정보
   */
  function reserveDraftClassification(input) {
    const reportDate = input && input.reportDate;
    const year = reportDate ? new Date(reportDate + 'T00:00:00').getFullYear() : new Date().getFullYear();

    return window.TEA_FIRESTORE.getNextDraftSerialTransactional(year).then((serial) => {
      const classification = buildClassification(input, `임시${serial}`);
      classification.isDraftSerial = true;
      return classification;
    });
  }

  window.TEA_CLASSIFICATION = { buildClassification, reserveClassification, reserveDraftClassification };
})();
