/**
 * auth.js
 * -----------------------------------------------------------------------
 * Firebase Authentication 기반 로그인/로그아웃 및 소속별 권한(Role) 세션 관리.
 *
 *   - 화면에는 공공기관 행정망 스타일의 '일반 아이디'(예: admin, user01)만
 *     입력받는다. Firebase Auth는 이메일 형식을 요구하므로, 로그인 직전에
 *     `아이디@cne.go.kr` 형태의 가상 이메일로 변환하여 인증한다.
 *   - 로그인 성공 시, Firestore의 /staff/{uid} 문서를 조회하여 이름·권한(Role)·
 *     소속 지역코드를 확인한다. staff 문서가 없는 계정은 시스템 접근 권한이
 *     없는 것으로 간주하고 즉시 로그아웃시킨다.
 *   - role: 'hq'(본청·총괄)      -> 14개 지원청 전체 데이터 열람, [통계] 메뉴 활성화
 *   - role: 'region'(지역 장학사) -> 세션에 등록된 자신의 regionCode 데이터만 열람,
 *                                    [통계] 메뉴 비노출
 *
 * 이 모듈은 window.TEA_SESSION(현재 로그인 세션 조회)과 window.TEA_AUTH
 * (로그인/로그아웃/초기화, 가상 이메일 변환 헬퍼)를 전역에 노출한다.
 *
 * [관리자 계정 생성 시 주의]
 *   Firebase 콘솔 또는 Admin SDK에서 사용자를 등록할 때도 반드시
 *   TEA_AUTH.toAuthEmail('아이디') 결과(예: admin@cne.go.kr)를
 *   이메일로 저장해야 로그인과 일치한다.
 * -----------------------------------------------------------------------
 */
(function () {
  'use strict';

  const STAFF_COLLECTION = 'staff';

  // Firebase Auth용 가상 도메인. 실제 메일 발송에는 쓰이지 않으며,
  // 행정망 아이디를 이메일/비밀번호 인증 스키마에 맞추기 위한 내부 식별자이다.
  const AUTH_EMAIL_DOMAIN = 'cne.go.kr';

  // 아이디: 영문/숫자/._- 만 허용 (이메일 @ 기호 및 공백 불가)
  const LOGIN_ID_PATTERN = /^[A-Za-z0-9._\-]+$/;

  let currentSession = null;

  /**
   * 화면에서 입력한 일반 아이디를 Firebase Auth용 가상 이메일로 변환한다.
   * 예: 'admin' -> 'admin@cne.go.kr'
   * 이미 동일 도메인 이메일이 들어온 경우에는 그대로 정규화하여 반환한다.
   */
  function toAuthEmail(loginId) {
    const raw = String(loginId || '').trim();
    if (!raw) return '';

    const atIndex = raw.indexOf('@');
    if (atIndex >= 0) {
      const local = raw.slice(0, atIndex).trim();
      const domain = raw.slice(atIndex + 1).trim().toLowerCase();
      if (local && domain === AUTH_EMAIL_DOMAIN && LOGIN_ID_PATTERN.test(local)) {
        return local + '@' + AUTH_EMAIL_DOMAIN;
      }
      return '';
    }

    if (!LOGIN_ID_PATTERN.test(raw)) return '';
    return raw + '@' + AUTH_EMAIL_DOMAIN;
  }

  /** 가상 이메일에서 화면 표시용 아이디(로컬 파트)를 추출한다. */
  function toLoginId(authEmail) {
    const email = String(authEmail || '').trim();
    const atIndex = email.indexOf('@');
    return atIndex >= 0 ? email.slice(0, atIndex) : email;
  }

  // ---------------------------------------------------------------------
  // 세션 조회 헬퍼 (window.TEA_SESSION)
  // ---------------------------------------------------------------------
  function getSession() {
    return currentSession;
  }
  function isHQ() {
    return !!currentSession && currentSession.role === 'hq';
  }
  function isRegion() {
    return !!currentSession && currentSession.role === 'region';
  }

  window.TEA_SESSION = { get: getSession, isHQ, isRegion };

  // ---------------------------------------------------------------------
  // 화면 표시 헬퍼
  // ---------------------------------------------------------------------
  function showLoginScreen() {
    const loginEl = document.getElementById('login-screen');
    const shellEl = document.getElementById('app-shell');
    if (loginEl) loginEl.classList.remove('app-shell-hidden');
    if (shellEl) shellEl.classList.add('app-shell-hidden');
  }

  function showAppShell() {
    const loginEl = document.getElementById('login-screen');
    const shellEl = document.getElementById('app-shell');
    if (loginEl) loginEl.classList.add('app-shell-hidden');
    if (shellEl) shellEl.classList.remove('app-shell-hidden');
  }

  function setLoginError(message) {
    const el = document.getElementById('login-error');
    if (!el) return;
    if (!message) {
      el.textContent = '';
      el.classList.add('hidden');
    } else {
      el.textContent = message;
      el.classList.remove('hidden');
    }
  }

  function setLoginSubmitting(submitting) {
    const btn = document.getElementById('login-submit-btn');
    if (!btn) return;
    btn.disabled = submitting;
    btn.textContent = submitting ? '로그인 중...' : '로그인';
    btn.classList.toggle('opacity-60', submitting);
    btn.classList.toggle('cursor-not-allowed', submitting);
  }

  // ---------------------------------------------------------------------
  // 소속별 권한(Role) UI 반영: [통계] 메뉴 노출 여부, 사이드바 사용자 정보
  // ---------------------------------------------------------------------
  function applyRoleGating(session) {
    const isHqSession = session.role === 'hq';

    const statsNavBtn = document.querySelector('.nav-item[data-view="stats"]');
    if (statsNavBtn) {
      statsNavBtn.classList.toggle('hidden', !isHqSession);
    }

    // [계정 관리] 메뉴는 본청(총괄) 계정에게만 노출한다.
    const accountsNavBtn = document.querySelector('.nav-item[data-view="admin-accounts"]');
    if (accountsNavBtn) {
      accountsNavBtn.classList.toggle('hidden', !isHqSession);
    }

    // 지역 장학사가 본청 전용 화면(통계/계정 관리)을 열어 둔 채로 로그인했을
    // 가능성에 대비해 홈으로 되돌린다.
    if (!isHqSession) {
      const restrictedViewIds = ['view-stats', 'view-admin-accounts'];
      const isOnRestrictedView = restrictedViewIds.some((id) => {
        const el = document.getElementById(id);
        return el && !el.classList.contains('hidden');
      });
      if (isOnRestrictedView && window.TEA_NAV) {
        window.TEA_NAV.switchView('dashboard');
      }
    }

    const nameEl = document.getElementById('session-user-name');
    const scopeEl = document.getElementById('session-user-scope');
    const avatarEl = document.getElementById('session-user-avatar');
    if (nameEl) nameEl.textContent = session.name || session.loginId || '담당 장학사';
    if (scopeEl) {
      if (session.role === 'hq') {
        scopeEl.textContent = '교권보호관 · 본청(총괄)';
      } else {
        const regionLabel = (session.regionName || '').trim();
        scopeEl.innerHTML = `${regionLabel}교육지원청<br />장학사`;
      }
    }
    if (avatarEl) avatarEl.textContent = (session.name || '?').charAt(0);
  }

  // ---------------------------------------------------------------------
  // 로그인한 계정의 /staff/{uid} 문서를 조회하여 세션 객체를 구성
  // ---------------------------------------------------------------------
  function loadStaffSession(user) {
    const db = window.TEA_FIREBASE.db;
    return db
      .collection(STAFF_COLLECTION)
      .doc(user.uid)
      .get()
      .then((doc) => {
        if (!doc.exists) {
          throw new Error('STAFF_NOT_FOUND');
        }
        const data = doc.data();
        if (data.disabled === true) {
          throw new Error('ACCOUNT_DISABLED');
        }
        if (data.role !== 'hq' && data.role !== 'region') {
          throw new Error('INVALID_ROLE');
        }
        if (data.role === 'region' && !data.regionCode) {
          throw new Error('MISSING_REGION_CODE');
        }
        const loginId = data.loginId || toLoginId(user.email);
        return {
          uid: user.uid,
          email: user.email,
          loginId: loginId,
          name: data.name || loginId || '담당 장학사',
          role: data.role,
          regionCode: data.regionCode || '',
          regionName: data.regionName || '',
        };
      });
  }

  // ---------------------------------------------------------------------
  // 로그인 폼 제출
  // ---------------------------------------------------------------------
  function handleLoginSubmit(e) {
    e.preventDefault();
    setLoginError('');

    const idEl = document.getElementById('login-id');
    const passwordEl = document.getElementById('login-password');
    const loginId = idEl ? idEl.value.trim() : '';
    const password = passwordEl ? passwordEl.value : '';

    if (!loginId || !password) {
      setLoginError('아이디와 비밀번호를 모두 입력해 주세요.');
      return;
    }

    const authEmail = toAuthEmail(loginId);
    if (!authEmail) {
      setLoginError('아이디는 영문, 숫자, 점(.), 밑줄(_), 하이픈(-)만 사용할 수 있습니다.');
      return;
    }

    setLoginSubmitting(true);
    window.TEA_FIREBASE.auth
      .signInWithEmailAndPassword(authEmail, password)
      .catch((err) => {
        setLoginSubmitting(false);
        setLoginError(describeAuthError(err));
      });
    // 로그인 성공 이후의 화면 전환은 onAuthStateChanged 리스너에서 일괄 처리한다.
  }

  function describeAuthError(err) {
    const code = err && err.code;
    if (code === 'STAFF_NOT_FOUND' || err.message === 'STAFF_NOT_FOUND') {
      return '시스템 이용 권한이 등록되지 않은 계정입니다. 관리자에게 문의해 주세요.';
    }
    if (err.message === 'INVALID_ROLE' || err.message === 'MISSING_REGION_CODE') {
      return '계정의 권한 설정이 올바르지 않습니다. 관리자에게 문의해 주세요.';
    }
    if (err.message === 'ACCOUNT_DISABLED') {
      return '비활성화된 계정입니다. 관리자에게 문의해 주세요.';
    }
    switch (code) {
      case 'auth/invalid-email':
        return '아이디 형식이 올바르지 않습니다.';
      case 'auth/user-disabled':
        return '사용이 정지된 계정입니다. 관리자에게 문의해 주세요.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return '아이디 또는 비밀번호가 올바르지 않습니다.';
      case 'auth/too-many-requests':
        return '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.';
      case 'auth/network-request-failed':
        return '네트워크 연결을 확인해 주세요.';
      default:
        return '로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
    }
  }

  function handleLogout() {
    if (window.TEA_FIRESTORE) window.TEA_FIRESTORE.unsubscribeCases();
    window.TEA_FIREBASE.auth.signOut();
  }

  // ---------------------------------------------------------------------
  // 인증 상태 변화 감지 (로그인/로그아웃/새로고침 시 자동 재로그인 판별)
  // ---------------------------------------------------------------------
  function bindAuthStateListener() {
    window.TEA_FIREBASE.auth.onAuthStateChanged((user) => {
      if (!user) {
        currentSession = null;
        if (window.TEA_APP && typeof window.TEA_APP.stopAfterLogout === 'function') {
          window.TEA_APP.stopAfterLogout();
        }
        showLoginScreen();
        setLoginSubmitting(false);
        return;
      }

      loadStaffSession(user)
        .then((session) => {
          currentSession = session;
          setLoginSubmitting(false);
          setLoginError('');
          const passwordEl = document.getElementById('login-password');
          if (passwordEl) passwordEl.value = '';

          applyRoleGating(session);
          showAppShell();

          if (window.TEA_APP && typeof window.TEA_APP.startAfterLogin === 'function') {
            window.TEA_APP.startAfterLogin(session);
          }
        })
        .catch((err) => {
          console.error('[TEA_AUTH] 세션 권한 확인 실패:', err);
          setLoginSubmitting(false);
          setLoginError(describeAuthError(err));
          window.TEA_FIREBASE.auth.signOut();
        });
    });
  }

  function initAuth() {
    const form = document.getElementById('login-form');
    if (form) form.addEventListener('submit', handleLoginSubmit);

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

    bindAuthStateListener();
  }

  window.TEA_AUTH = {
    initAuth,
    applyRoleGating,
    logout: handleLogout,
    /** 일반 아이디 → Firebase Auth용 가상 이메일 (계정 생성·로그인 공통) */
    toAuthEmail,
    /** 가상 이메일 → 화면 표시용 아이디 */
    toLoginId,
    AUTH_EMAIL_DOMAIN,
  };
})();
