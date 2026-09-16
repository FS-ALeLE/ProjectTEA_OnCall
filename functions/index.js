/**
 * Cloud Functions - 교권침해사안관리시스템(TEA)
 * -----------------------------------------------------------------------
 * 클라이언트 SDK만으로는 다른 사용자의 Firebase Auth 비밀번호를 변경할 수
 * 없다(Admin SDK 필요). 본청(hq) 관리자가 [계정 관리] 화면에서 직접 새
 * 비밀번호를 지정할 수 있도록 setStaffPassword Callable Function을 제공한다.
 *
 * 배포 (프로젝트 루트에서):
 *   cd functions && npm install
 *   firebase deploy --only functions
 *
 * ※ Blaze(종량제) 요금제가 필요합니다. 호출량이 매우 적으면 사실상 비용이
 *   거의 발생하지 않습니다.
 * -----------------------------------------------------------------------
 */
const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

// ---------------------------------------------------------------------
// NEIS(교육정보 개방 포털) 학교기본정보 검색 - 지역/학교급 매핑 테이블
//   NEIS API는 학교가 속한 "시도(충청남도)"까지만 필드로 내려주고, 세부
//   시·군(천안/아산 등)은 도로명주소 문자열에서만 확인할 수 있다. 아래
//   키워드 매핑으로 주소를 검사해 js/form-options.js의 REGIONS 코드와
//   동일한 지역코드를 부여한다. ※ REGIONS 배열이 바뀌면 이 표도 함께 갱신.
// ---------------------------------------------------------------------
const NEIS_REGION_MAP = [
  { code: '01', name: '천안', keywords: ['천안'] },
  { code: '02', name: '공주', keywords: ['공주'] },
  { code: '03', name: '보령', keywords: ['보령'] },
  { code: '04', name: '아산', keywords: ['아산'] },
  { code: '05', name: '서산', keywords: ['서산'] },
  { code: '06', name: '논산계룡', keywords: ['논산', '계룡'] },
  { code: '07', name: '당진', keywords: ['당진'] },
  { code: '08', name: '금산', keywords: ['금산'] },
  { code: '09', name: '부여', keywords: ['부여'] },
  { code: '10', name: '서천', keywords: ['서천'] },
  { code: '11', name: '청양', keywords: ['청양'] },
  { code: '12', name: '홍성', keywords: ['홍성'] },
  { code: '13', name: '예산', keywords: ['예산'] },
  { code: '14', name: '태안', keywords: ['태안'] },
];

// NEIS SCHUL_KND_SC_NM 값은 js/form-options.js의 SCHOOL_LEVELS 이름과 표기가 동일하다.
const NEIS_LEVEL_CODE_BY_NAME = {
  유치원: '1',
  초등학교: '2',
  중학교: '3',
  고등학교: '4',
  특수학교: '5',
  각종학교: '6',
};

function detectRegionFromAddress(address) {
  const text = String(address || '');
  const found = NEIS_REGION_MAP.find((r) => r.keywords.some((kw) => text.includes(kw)));
  return found ? { regionCode: found.code, regionName: found.name } : { regionCode: '', regionName: '' };
}

/** NEIS 원본 행(row)을 화면에서 다루기 쉬운 { id, name, level, levelCode, region, regionCode } 형태로 정리 */
function mapNeisSchoolRow(row) {
  const address = row.ORG_RDNMA || row.ORG_RDNZC || '';
  const { regionCode, regionName } = detectRegionFromAddress(address);
  const levelName = row.SCHUL_KND_SC_NM || '';
  return {
    id: row.SD_SCHUL_CODE || '',
    name: row.SCHUL_NM || '',
    level: levelName,
    levelCode: NEIS_LEVEL_CODE_BY_NAME[levelName] || '',
    region: regionName,
    regionCode,
    address,
  };
}

/**
 * [학교명] 검색 자동완성이 사용하는 NEIS(교육정보 개방 포털) 학교기본정보
 * Open API 프록시. 브라우저에서 NEIS를 직접 호출하면 (1) NEIS가 CORS를
 * 허용하지 않아 대부분 차단되고, (2) 인증키(KEY)가 클라이언트 코드에 그대로
 * 노출되므로, 이 Callable Function이 서버에서 대신 호출하고 정리된 결과만
 * 클라이언트로 돌려준다. 인증키는 functions/.env의 NEIS_API_KEY로 관리된다.
 * data: { query: string }
 */
exports.searchNeisSchools = functions
  .region('asia-northeast3')
  .https.onCall(async (data, context) => {
    if (!context.auth || !context.auth.uid) {
      throw new functions.https.HttpsError('unauthenticated', '로그인이 필요합니다.');
    }

    const query = data && typeof data.query === 'string' ? data.query.trim() : '';
    if (!query) return { schools: [] };
    if (query.length > 40) {
      throw new functions.https.HttpsError('invalid-argument', '검색어가 너무 깁니다.');
    }

    const apiKey = process.env.NEIS_API_KEY;
    if (!apiKey) {
      console.error('[searchNeisSchools] NEIS_API_KEY가 설정되어 있지 않습니다. functions/.env를 확인해 주세요.');
      throw new functions.https.HttpsError('failed-precondition', 'NEIS 연동 설정이 완료되지 않았습니다. 관리자에게 문의해 주세요.');
    }

    const url =
      'https://open.neis.go.kr/hub/schoolInfo' +
      `?KEY=${encodeURIComponent(apiKey)}` +
      '&Type=json&pIndex=1&pSize=30' +
      '&ATPT_OFCDC_SC_CODE=N10' + // 충청남도교육청
      `&SCHUL_NM=${encodeURIComponent(query)}`;

    let payload;
    try {
      const res = await fetch(url);
      payload = await res.json();
    } catch (err) {
      console.error('[searchNeisSchools] NEIS API 호출 실패:', err);
      throw new functions.https.HttpsError('unavailable', 'NEIS 교육정보 개방 포털 호출에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    }

    // 검색 결과가 없으면 NEIS는 schoolInfo 배열 없이 최상위 RESULT만 내려준다.
    const rows = (payload && payload.schoolInfo && payload.schoolInfo[1] && payload.schoolInfo[1].row) || [];
    const schools = rows.map(mapNeisSchoolRow).filter((s) => s.id && s.name);

    return { schools };
  });

/**
 * 본청(hq) 관리자가 지정한 계정의 비밀번호를 직접 변경한다.
 * data: { uid: string, password: string }
 */
exports.setStaffPassword = functions
  .region('asia-northeast3')
  .https.onCall(async (data, context) => {
    if (!context.auth || !context.auth.uid) {
      throw new functions.https.HttpsError('unauthenticated', '로그인이 필요합니다.');
    }

    const callerUid = context.auth.uid;
    const targetUid = data && typeof data.uid === 'string' ? data.uid.trim() : '';
    const password = data && typeof data.password === 'string' ? data.password : '';

    if (!targetUid) {
      throw new functions.https.HttpsError('invalid-argument', '대상 계정(uid)이 없습니다.');
    }
    if (!password || password.length < 6) {
      throw new functions.https.HttpsError('invalid-argument', '비밀번호는 6자 이상이어야 합니다.');
    }
    if (password.length > 128) {
      throw new functions.https.HttpsError('invalid-argument', '비밀번호가 너무 깁니다.');
    }

    const callerDoc = await admin.firestore().collection('staff').doc(callerUid).get();
    if (!callerDoc.exists) {
      throw new functions.https.HttpsError('permission-denied', '시스템 이용 권한이 없습니다.');
    }
    const caller = callerDoc.data() || {};
    if (caller.role !== 'hq' || caller.disabled === true) {
      throw new functions.https.HttpsError('permission-denied', '본청(총괄) 관리자만 비밀번호를 변경할 수 있습니다.');
    }

    const targetDoc = await admin.firestore().collection('staff').doc(targetUid).get();
    if (!targetDoc.exists) {
      throw new functions.https.HttpsError('not-found', '대상 계정의 권한 정보가 없습니다.');
    }

    try {
      await admin.auth().updateUser(targetUid, { password });
    } catch (err) {
      console.error('[setStaffPassword] Auth updateUser 실패:', err);
      if (err && err.code === 'auth/user-not-found') {
        throw new functions.https.HttpsError('not-found', 'Firebase Authentication에서 해당 계정을 찾을 수 없습니다.');
      }
      throw new functions.https.HttpsError('internal', '비밀번호 변경 중 오류가 발생했습니다.');
    }

    await admin
      .firestore()
      .collection('staff')
      .doc(targetUid)
      .update({
        passwordUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        passwordUpdatedBy: callerUid,
      });

    return { ok: true };
  });
