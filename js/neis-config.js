/**
 * neis-config.js
 * -----------------------------------------------------------------------
 * NEIS(교육정보 개방 포털) Open API 연동 설정.
 * 루트 .env 의 VITE_NEIS_API_KEY 값과 동일하게 유지한다.
 * (이 프로젝트는 Vite 빌드가 없어 .env를 브라우저가 직접 읽지 못하므로
 *  여기에도 동일 키를 둔다.)
 * -----------------------------------------------------------------------
 */
(function () {
  'use strict';

  window.TEA_NEIS_CONFIG = {
    apiKey: 'e67f143af9ec4f90be4bbf00e46154a1',
    // 충청남도교육청
    officeCode: 'N10',
    baseUrl: 'https://open.neis.go.kr/hub/schoolInfo',
    pageSize: 30,
  };
})();
