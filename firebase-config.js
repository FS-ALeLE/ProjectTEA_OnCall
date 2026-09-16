/**
 * firebase-config.js
 * -----------------------------------------------------------------------
 * Firebase 프로젝트 초기화 스크립트.
 *   - Cloud Firestore : 사안(cases) 데이터, 분류번호 카운터(counters),
 *                       소속/권한 정보(staff)를 저장하는 실시간 데이터베이스
 *   - Cloud Storage    : 사안 첨부파일 원본 바이너리 저장소
 *   - Firebase Auth    : 장학사 계정 로그인(아이디→가상이메일/비밀번호) 인증
 *
 * 이 파일은 index.html에서 Firebase SDK(compat) <script> 태그들이 모두
 * 로드된 직후, 그리고 js/firebase-cases.js · js/auth.js 등 이 값을
 * 사용하는 다른 스크립트보다 반드시 먼저 로드되어야 합니다.
 * -----------------------------------------------------------------------
 */
(function () {
  'use strict';

  const firebaseConfig = {
    apiKey: 'AIzaSyBBWFHSaWdgJpVMnKa1OtTzNroWGTiajTA',
    authDomain: 'project-tea-68fc1.firebaseapp.com',
    projectId: 'project-tea-68fc1',
    storageBucket: 'project-tea-68fc1.firebasestorage.app',
    messagingSenderId: '874541277659',
    appId: '1:874541277659:web:4727f38bc01d71f4ad07fe',
  };

  if (typeof firebase === 'undefined') {
    console.error(
      '[TEA_FIREBASE] Firebase SDK가 로드되지 않았습니다. index.html에서 firebase-app-compat.js 등 SDK 스크립트가 이 파일보다 먼저 로드되어야 합니다.'
    );
    return;
  }

  const app = firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.firestore();
  const storage = firebase.storage();

  // ---------------------------------------------------------------------
  // 계정 관리(관리자용) 전용 "보조 앱" 인스턴스.
  //   Firebase Auth의 createUserWithEmailAndPassword()는 호출 즉시 새로 만든
  //   계정으로 자동 로그인되어 버리는 특성이 있다. 본청 관리자가 다른 사람의
  //   계정을 만들면서 자신의 로그인 세션이 끊기는 것을 막기 위해, 계정
  //   생성 작업만 처리하는 완전히 독립된 보조 Firebase 앱을 하나 더 띄워
  //   그 안에서 사용자를 생성한 뒤 즉시 로그아웃시킨다(주 앱의 로그인 상태에는
  //   영향을 주지 않음). js/admin-accounts.js 에서 사용한다.
  // ---------------------------------------------------------------------
  const secondaryApp = firebase.initializeApp(firebaseConfig, 'TEA_ADMIN_SECONDARY');
  const secondaryAuth = secondaryApp.auth();

  // 관리자 비밀번호 직접 변경 등 Callable Cloud Functions (서울 리전)
  const functions = firebase.app().functions('asia-northeast3');

  // 지원청 인터넷 환경이 불안정한 경우에도 마지막으로 조회한 사안 목록을
  // 유지해 화면이 비어 보이지 않도록, 브라우저 로컬 캐시(IndexedDB) 지속성을 활성화한다.
  db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
    if (err && (err.code === 'failed-precondition' || err.code === 'unimplemented')) {
      console.warn('[TEA_FIREBASE] 이 브라우저/탭 환경에서는 오프라인 캐시를 사용할 수 없습니다:', err.code);
    } else {
      console.warn('[TEA_FIREBASE] Firestore 오프라인 캐시 활성화 중 오류가 발생했습니다:', err);
    }
  });

  window.TEA_FIREBASE = {
    app,
    auth,
    db,
    storage,
    secondaryAuth,
    functions,
    FieldValue: firebase.firestore.FieldValue,
    Timestamp: firebase.firestore.Timestamp,
  };
})();
