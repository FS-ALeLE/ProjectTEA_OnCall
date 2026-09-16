/**
 * firebase-cases.js
 * -----------------------------------------------------------------------
 * Firestore/Cloud Storage 기반 사안(Case) 데이터 접근 계층.
 *
 *   1) getNextSerialTransactional() : 분류번호 일련번호를 runTransaction으로
 *      안전하게 채번한다. 여러 장학사가 동시에 [사안 등록]을 눌러도
 *      "해당 년도 카운터를 읽고 +1 하여 쓰는" 과정이 원자적으로 처리되어
 *      일련번호가 절대 중복되지 않는다.
 *   2) uploadAttachment() / uploadAttachments() : 첨부파일을
 *      Cloud Storage의 cases/[분류번호]/ 경로에 실제로 업로드하고,
 *      다운로드 가능한 보안 URL을 반환한다.
 *   3) createCase() / updateCase() / deleteCase() : 사안 문서 CRUD.
 *   4) subscribeCases() : 로그인 세션의 권한(Role)에 따라 서버 측 쿼리
 *      자체를 다르게 구성하여, 지역 장학사에게는 처음부터 자신의 지역
 *      데이터만 전달되도록 한다(클라이언트 후처리 필터링이 아님).
 * -----------------------------------------------------------------------
 */
(function () {
  'use strict';

  const CASES_COLLECTION = 'cases';
  const COUNTERS_COLLECTION = 'counters';

  function db() {
    if (!window.TEA_FIREBASE) throw new Error('Firebase가 초기화되지 않았습니다. firebase-config.js 로드 순서를 확인하세요.');
    return window.TEA_FIREBASE.db;
  }

  function storageRoot() {
    return window.TEA_FIREBASE.storage;
  }

  let unsubscribeCasesFn = null;

  // -----------------------------------------------------------------------
  // 1) 분류번호 일련번호 동시성 안전 채번 (Transaction)
  // -----------------------------------------------------------------------
  function getNextSerialTransactional(year) {
    const counterRef = db().collection(COUNTERS_COLLECTION).doc(String(year));

    return db()
      .runTransaction((transaction) => {
        return transaction.get(counterRef).then((snapshot) => {
          const currentSerial = snapshot.exists ? Number(snapshot.data().lastSerial) || 0 : 0;
          const nextSerial = currentSerial + 1;

          transaction.set(
            counterRef,
            {
              year: Number(year),
              lastSerial: nextSerial,
              updatedAt: window.TEA_FIREBASE.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );

          return nextSerial;
        });
      })
      .then((nextSerial) => String(nextSerial).padStart(3, '0'));
  }

  /**
   * [임시저장] 전용 일련번호. 정식 채번 카운터(counters/{year})와는 완전히
   * 분리된 카운터(counters/{year}_draft)를 사용해, "임시는 임시끼리" 001부터
   * 별도로 증가한다(정식 사안 번호 자원을 소비하지 않음).
   */
  function getNextDraftSerialTransactional(year) {
    const counterRef = db().collection(COUNTERS_COLLECTION).doc(`${year}_draft`);

    return db()
      .runTransaction((transaction) => {
        return transaction.get(counterRef).then((snapshot) => {
          const currentSerial = snapshot.exists ? Number(snapshot.data().lastSerial) || 0 : 0;
          const nextSerial = currentSerial + 1;

          transaction.set(
            counterRef,
            {
              year: Number(year),
              lastSerial: nextSerial,
              updatedAt: window.TEA_FIREBASE.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );

          return nextSerial;
        });
      })
      .then((nextSerial) => String(nextSerial).padStart(3, '0'));
  }

  // -----------------------------------------------------------------------
  // 2) 첨부파일 업로드 (Cloud Storage: cases/[분류번호]/파일명)
  // -----------------------------------------------------------------------
  function sanitizeFileName(name) {
    return name.replace(/[^\w.\-가-힣ㄱ-ㅎㅏ-ㅣ]/g, '_');
  }

  /**
   * @param {string} caseId 사안 분류번호 (Storage 폴더명으로 사용)
   * @param {File} file 브라우저 File 객체
   * @param {string} [regionCode] 보안 규칙(storage.rules)에서 지역 필터링에 사용할 2자리 지역코드
   * @returns {Promise<{name:string, size:number, type:string, path:string, url:string}>}
   */
  function uploadAttachment(caseId, file, regionCode) {
    const path = `cases/${caseId}/${Date.now()}_${sanitizeFileName(file.name)}`;
    const ref = storageRoot().ref(path);
    const metadata = {
      contentType: file.type || 'application/octet-stream',
      customMetadata: { regionCode: regionCode || '' },
    };

    return ref
      .put(file, metadata)
      .then((snapshot) => snapshot.ref.getDownloadURL())
      .then((url) => ({
        name: file.name,
        size: file.size,
        type: file.type || '',
        path,
        url,
      }));
  }

  function uploadAttachments(caseId, files, regionCode) {
    const list = files || [];
    return Promise.all(list.map((file) => uploadAttachment(caseId, file, regionCode)));
  }

  function deleteAttachment(path) {
    if (!path) return Promise.resolve();
    return storageRoot()
      .ref(path)
      .delete()
      .catch((err) => {
        console.warn('[TEA_FIRESTORE] 첨부파일 삭제 중 오류(무시하고 계속 진행):', path, err);
      });
  }

  // -----------------------------------------------------------------------
  // 3) 사안(Case) 문서 CRUD
  // -----------------------------------------------------------------------
  function createCase(caseObj) {
    const session = window.TEA_SESSION ? window.TEA_SESSION.get() : null;
    const payload = Object.assign({}, caseObj, {
      createdAt: window.TEA_FIREBASE.FieldValue.serverTimestamp(),
      updatedAt: window.TEA_FIREBASE.FieldValue.serverTimestamp(),
      createdByUid: session ? session.uid : null,
      createdByName: session ? session.name : null,
    });
    return db().collection(CASES_COLLECTION).doc(caseObj.id).set(payload);
  }

  function updateCase(caseId, updates) {
    const payload = Object.assign({}, updates, {
      updatedAt: window.TEA_FIREBASE.FieldValue.serverTimestamp(),
    });
    return db().collection(CASES_COLLECTION).doc(caseId).update(payload);
  }

  function deleteCase(caseId) {
    return db().collection(CASES_COLLECTION).doc(caseId).delete();
  }

  // -----------------------------------------------------------------------
  // 4) 실시간 구독 - 로그인 세션의 소속 권한에 따라 서버 측 쿼리를 다르게 구성
  // -----------------------------------------------------------------------
  function subscribeCases(session, onUpdate, onError) {
    if (unsubscribeCasesFn) {
      unsubscribeCasesFn();
      unsubscribeCasesFn = null;
    }

    let query = db().collection(CASES_COLLECTION);

    // '지역 장학사' 권한 계정은 자신의 지역코드와 일치하는 사안만 서버에서부터 조회한다.
    if (session && session.role === 'region' && session.regionCode) {
      query = query.where('classification.regionCode', '==', session.regionCode);
    }

    unsubscribeCasesFn = query.onSnapshot(
      (snapshot) => {
        const cases = snapshot.docs.map((doc) => Object.assign({}, doc.data(), { id: doc.id }));
        window.TEA_DATA.replaceAllCases(cases);
        if (typeof onUpdate === 'function') onUpdate(cases);
      },
      (err) => {
        console.error('[TEA_FIRESTORE] 사안 목록 구독 오류:', err);
        if (typeof onError === 'function') onError(err);
      }
    );
  }

  function unsubscribeCases() {
    if (unsubscribeCasesFn) {
      unsubscribeCasesFn();
      unsubscribeCasesFn = null;
    }
  }

  window.TEA_FIRESTORE = {
    getNextSerialTransactional,
    getNextDraftSerialTransactional,
    uploadAttachment,
    uploadAttachments,
    deleteAttachment,
    createCase,
    updateCase,
    deleteCase,
    subscribeCases,
    unsubscribeCases,
  };
})();
