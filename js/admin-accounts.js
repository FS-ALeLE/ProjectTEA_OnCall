/**
 * admin-accounts.js
 * -----------------------------------------------------------------------
 * [계정 관리] 화면 - 본청(총괄) 전용 계정 생성/조회/수정/비활성화 기능.
 *
 * Firebase Authentication의 createUserWithEmailAndPassword()는 호출 즉시
 * 새로 만든 계정으로 자동 로그인되어 버리는 특성이 있어, 로그인한 관리자가
 * 다른 사람의 계정을 만들면서 자신의 세션을 잃게 되는 문제가 발생한다.
 * 이를 방지하기 위해 firebase-config.js에서 미리 만들어 둔 완전히 독립된
 * "보조 앱"의 Auth 인스턴스(window.TEA_FIREBASE.secondaryAuth)로 계정을
 * 생성한 뒤 즉시 로그아웃시키고, 이후 Firestore /staff 문서만 주 앱(db)으로
 * 기록한다. 관리자의 로그인 세션(주 앱)에는 전혀 영향이 없다.
 *
 * ※ 클라이언트 SDK만으로는 다른 사용자의 Firebase Auth 비밀번호를 직접
 *   변경하거나 계정을 완전히 삭제할 수 없다(Admin SDK/Cloud Functions 필요).
 *   따라서:
 *     - 비밀번호 변경은 Cloud Function(setStaffPassword)을 호출하여
 *       관리자가 새 비밀번호를 직접 지정한다. (가상 이메일이므로 메일 발송 미사용)
 *     - 계정을 없애고 싶을 때는 완전 삭제 대신 [비활성화]로 로그인을
 *       차단한다(firestore.rules가 disabled:true 계정의 모든 접근을 거부).
 * -----------------------------------------------------------------------
 */
(function () {
  'use strict';

  const STAFF_COLLECTION = 'staff';

  let accounts = [];
  let editingUid = null; // null이면 "생성" 모드, 값이 있으면 "수정" 모드
  let passwordTargetUid = null; // 비밀번호 변경 대상 uid
  let initialized = false;

  function db() {
    return window.TEA_FIREBASE.db;
  }

  // ---------------------------------------------------------------------
  // DOM 헬퍼
  // ---------------------------------------------------------------------
  function el(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getRegionOptions() {
    return (window.TEA_FORM_OPTIONS && window.TEA_FORM_OPTIONS.REGIONS) || [];
  }

  function findRegionName(code) {
    const found = getRegionOptions().find((r) => r.code === code);
    return found ? found.name : '';
  }

  // ---------------------------------------------------------------------
  // 목록 조회 및 렌더링
  // ---------------------------------------------------------------------
  function loadAccounts() {
    return db()
      .collection(STAFF_COLLECTION)
      .get({ source: 'server' })
      .then((snap) => {
        accounts = snap.docs.map((doc) => Object.assign({ uid: doc.id }, doc.data()));
        accounts.sort((a, b) => {
          if (a.role !== b.role) return a.role === 'hq' ? -1 : 1;
          return String(a.name || '').localeCompare(String(b.name || ''), 'ko');
        });
        return accounts;
      });
  }

  function renderAccountList() {
    const listEl = el('admin-account-list');
    const emptyEl = el('admin-account-empty');
    if (!listEl) return;

    const mySession = window.TEA_SESSION ? window.TEA_SESSION.get() : null;
    const myUid = mySession ? mySession.uid : '';

    if (accounts.length === 0) {
      listEl.innerHTML = '';
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }
    if (emptyEl) emptyEl.classList.add('hidden');

    listEl.innerHTML = accounts.map((acc) => buildAccountRowHtml(acc, acc.uid === myUid)).join('');
  }

  function buildAccountRowHtml(acc, isSelf) {
    const roleLabel = acc.role === 'hq' ? '본청(총괄)' : '지역 장학사';
    const roleBadgeClass = acc.role === 'hq' ? 'bg-indigo-100 text-indigo-700' : 'bg-sky-100 text-sky-700';
    const regionLabel = acc.role === 'region' ? (acc.regionName || findRegionName(acc.regionCode) || '-') : '전체(14개 지원청)';
    const isDisabled = acc.disabled === true;
    const statusLabel = isDisabled ? '비활성화' : '활성';
    const statusBadgeClass = isDisabled ? 'bg-slate-200 text-slate-500' : 'bg-emerald-100 text-emerald-700';
    const loginId = acc.loginId || '-';

    const toggleBtnLabel = isDisabled ? '활성화' : '비활성화';
    const toggleBtnClass = isDisabled
      ? 'text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
      : 'text-rose-500 hover:text-rose-700 bg-rose-50 hover:bg-rose-100';

    return `
      <div class="admin-account-row-grid px-5 py-3.5 border-b border-slate-100 last:border-b-0 items-center">
        <div class="min-w-0">
          <p class="text-[12.5px] font-bold text-slate-700 truncate">${escapeHtml(loginId)}</p>
          ${isSelf ? '<span class="text-[10px] font-bold text-indigo-500">내 계정</span>' : ''}
        </div>
        <div class="min-w-0">
          <p class="text-[12.5px] font-semibold text-slate-700 truncate">${escapeHtml(acc.name || '-')}</p>
        </div>
        <div><span class="px-2 py-0.5 rounded-full text-[11px] font-bold ${roleBadgeClass}">${escapeHtml(roleLabel)}</span></div>
        <div class="min-w-0">
          <p class="text-[12px] text-slate-600 truncate">${escapeHtml(regionLabel)}</p>
        </div>
        <div><span class="px-2 py-0.5 rounded-full text-[11px] font-bold ${statusBadgeClass}">${statusLabel}</span></div>
        <div class="flex items-center justify-end gap-1.5">
          <button type="button" class="admin-account-edit-btn inline-flex items-center text-[11px] font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-md transition-colors" data-uid="${escapeHtml(acc.uid)}">
            수정
          </button>
          <button type="button" class="admin-account-reset-btn inline-flex items-center text-[11px] font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-md transition-colors" data-uid="${escapeHtml(acc.uid)}" title="비밀번호 직접 변경">
            비밀번호
          </button>
          <button
            type="button"
            class="admin-account-toggle-btn inline-flex items-center text-[11px] font-bold px-2 py-1 rounded-md transition-colors ${toggleBtnClass} disabled:opacity-40 disabled:cursor-not-allowed"
            data-uid="${escapeHtml(acc.uid)}"
            data-next-disabled="${!isDisabled}"
            ${isSelf ? 'disabled title="본인 계정은 여기서 비활성화할 수 없습니다."' : ''}
          >
            ${toggleBtnLabel}
          </button>
        </div>
      </div>`;
  }

  function loadAndRenderAccounts() {
    return loadAccounts()
      .then(renderAccountList)
      .catch((err) => {
        console.error('[TEA_ADMIN_ACCOUNTS] 계정 목록 조회 실패:', err);
        window.TEA_TOAST.show('계정 목록을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.', 'error');
      });
  }

  // ---------------------------------------------------------------------
  // 생성/수정 모달
  // ---------------------------------------------------------------------
  function getModal() {
    return el('admin-account-modal');
  }

  function populateRegionSelect() {
    const sel = el('admin-account-region');
    if (!sel || sel.options.length > 1) return;
    getRegionOptions().forEach((r) => {
      const opt = document.createElement('option');
      opt.value = r.code;
      opt.textContent = r.name;
      sel.appendChild(opt);
    });
  }

  function setFormError(message) {
    const errEl = el('admin-account-form-error');
    if (!errEl) return;
    if (!message) {
      errEl.textContent = '';
      errEl.classList.add('hidden');
    } else {
      errEl.textContent = message;
      errEl.classList.remove('hidden');
    }
  }

  function updateRegionFieldVisibility() {
    const role = el('admin-account-role').value;
    const regionField = el('admin-account-region-field');
    const regionSel = el('admin-account-region');
    const isRegion = role === 'region';
    if (regionField) regionField.classList.toggle('hidden', !isRegion);
    if (regionSel) regionSel.required = isRegion;
  }

  function openModal(mode, acc) {
    const modal = getModal();
    if (!modal) return;

    editingUid = mode === 'edit' && acc ? acc.uid : null;

    const titleEl = el('admin-account-modal-title');
    const idEl = el('admin-account-login-id');
    const nameEl = el('admin-account-name');
    const passwordField = el('admin-account-password-field');
    const passwordEl = el('admin-account-password');
    const roleEl = el('admin-account-role');
    const regionEl = el('admin-account-region');

    setFormError('');
    populateRegionSelect();

    if (editingUid) {
      if (titleEl) titleEl.textContent = '계정 정보 수정';
      if (idEl) {
        idEl.value = acc.loginId || '';
        idEl.disabled = true;
      }
      if (nameEl) nameEl.value = acc.name || '';
      if (passwordField) passwordField.classList.add('hidden');
      if (passwordEl) passwordEl.value = '';
      if (roleEl) roleEl.value = acc.role === 'hq' ? 'hq' : 'region';
      if (regionEl) regionEl.value = acc.regionCode || '';
    } else {
      if (titleEl) titleEl.textContent = '계정 생성';
      if (idEl) {
        idEl.value = '';
        idEl.disabled = false;
      }
      if (nameEl) nameEl.value = '';
      if (passwordField) passwordField.classList.remove('hidden');
      if (passwordEl) passwordEl.value = '';
      if (roleEl) roleEl.value = 'region';
      if (regionEl) regionEl.value = '';
    }

    updateRegionFieldVisibility();

    modal.classList.remove('hidden');
    requestAnimationFrame(() => modal.classList.add('modal-open'));
    document.body.classList.add('overflow-hidden');
  }

  function closeModal() {
    const modal = getModal();
    if (!modal) return;
    modal.classList.remove('modal-open');
    document.body.classList.remove('overflow-hidden');
    setTimeout(() => modal.classList.add('hidden'), 150);
    editingUid = null;
  }

  function setSubmitBusy(busy, label) {
    const btn = el('admin-account-submit-btn');
    if (!btn) return;
    btn.disabled = busy;
    btn.textContent = busy ? label || '처리 중...' : '저장';
  }

  // ---------------------------------------------------------------------
  // 생성 처리 (보조 앱으로 Auth 계정 생성 → 주 앱 Firestore에 staff 문서 기록)
  // ---------------------------------------------------------------------
  function describeCreateError(err) {
    const code = err && err.code;
    switch (code) {
      case 'auth/email-already-in-use':
        return '이미 사용 중인 아이디입니다.';
      case 'auth/invalid-email':
        return '아이디 형식이 올바르지 않습니다. 영문/숫자/._- 만 사용해 주세요.';
      case 'auth/weak-password':
        return '비밀번호는 6자 이상으로 설정해 주세요.';
      case 'auth/network-request-failed':
        return '네트워크 연결을 확인해 주세요.';
      default:
        return '계정 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
    }
  }

  function handleCreateAccount(input) {
    const { authEmail, password, name, role, regionCode, regionName, loginId } = input;
    const secondaryAuth = window.TEA_FIREBASE.secondaryAuth;

    return secondaryAuth
      .createUserWithEmailAndPassword(authEmail, password)
      .then((credential) => {
        const uid = credential.user.uid;
        // 보조 앱에 남은 로그인 상태를 즉시 정리한다(주 앱의 관리자 세션과는 무관).
        return secondaryAuth.signOut().then(() => uid);
      })
      .then((uid) =>
        db()
          .collection(STAFF_COLLECTION)
          .doc(uid)
          .set({
            name,
            role,
            loginId,
            regionCode,
            regionName,
            disabled: false,
            createdAt: window.TEA_FIREBASE.FieldValue.serverTimestamp(),
            updatedAt: window.TEA_FIREBASE.FieldValue.serverTimestamp(),
          })
      );
  }

  function handleUpdateAccount(uid, input) {
    const { name, role, regionCode, regionName } = input;
    return db()
      .collection(STAFF_COLLECTION)
      .doc(uid)
      .update({
        name,
        role,
        regionCode,
        regionName,
        updatedAt: window.TEA_FIREBASE.FieldValue.serverTimestamp(),
      });
  }

  function handleFormSubmit(e) {
    e.preventDefault();
    setFormError('');

    const loginId = el('admin-account-login-id').value.trim();
    const name = el('admin-account-name').value.trim();
    const password = el('admin-account-password').value;
    const role = el('admin-account-role').value;
    const regionCode = role === 'region' ? el('admin-account-region').value : '';

    if (!loginId || !name) {
      setFormError('아이디와 이름을 모두 입력해 주세요.');
      return;
    }
    if (role === 'region' && !regionCode) {
      setFormError('지역 장학사 계정은 소속 지역을 선택해야 합니다.');
      return;
    }

    const regionName = role === 'region' ? findRegionName(regionCode) : '';

    if (editingUid) {
      setSubmitBusy(true, '수정 중...');
      handleUpdateAccount(editingUid, { name, role, regionCode, regionName })
        .then(() => {
          window.TEA_TOAST.show('계정 정보가 수정되었습니다.', 'success');
          closeModal();
          return loadAndRenderAccounts();
        })
        .catch((err) => {
          console.error('[TEA_ADMIN_ACCOUNTS] 계정 수정 실패:', err);
          setFormError('계정 수정 중 오류가 발생했습니다. 다시 시도해 주세요.');
        })
        .finally(() => setSubmitBusy(false));
      return;
    }

    const authEmail = window.TEA_AUTH.toAuthEmail(loginId);
    if (!authEmail) {
      setFormError('아이디는 영문, 숫자, 점(.), 밑줄(_), 하이픈(-)만 사용할 수 있습니다.');
      return;
    }
    if (!password || password.length < 6) {
      setFormError('초기 비밀번호는 6자 이상으로 입력해 주세요.');
      return;
    }

    setSubmitBusy(true, '생성 중...');
    handleCreateAccount({ authEmail, password, name, role, regionCode, regionName, loginId })
      .then(() => {
        window.TEA_TOAST.show(`계정(${loginId})이 생성되었습니다.`, 'success');
        closeModal();
        return loadAndRenderAccounts();
      })
      .catch((err) => {
        console.error('[TEA_ADMIN_ACCOUNTS] 계정 생성 실패:', err);
        setFormError(describeCreateError(err));
      })
      .finally(() => setSubmitBusy(false));
  }

  // ---------------------------------------------------------------------
  // 비활성화 / 활성화 토글
  // ---------------------------------------------------------------------
  function handleToggleDisabled(uid, nextDisabled) {
    const mySession = window.TEA_SESSION ? window.TEA_SESSION.get() : null;
    if (mySession && mySession.uid === uid) {
      window.TEA_TOAST.show('본인 계정은 비활성화할 수 없습니다.', 'error');
      return;
    }

    const acc = accounts.find((a) => a.uid === uid);
    const label = nextDisabled ? '비활성화' : '활성화';
    const confirmed = window.confirm(
      `이 계정을 ${label}하시겠습니까?${acc ? `\n\n아이디: ${acc.loginId || '-'} / 이름: ${acc.name || '-'}` : ''}${
        nextDisabled ? '\n비활성화하면 해당 계정은 즉시 로그인할 수 없게 됩니다.' : ''
      }`
    );
    if (!confirmed) return;

    db()
      .collection(STAFF_COLLECTION)
      .doc(uid)
      .update({ disabled: nextDisabled, updatedAt: window.TEA_FIREBASE.FieldValue.serverTimestamp() })
      .then(() => {
        window.TEA_TOAST.show(`계정이 ${label}되었습니다.`, 'success');
        return loadAndRenderAccounts();
      })
      .catch((err) => {
        console.error('[TEA_ADMIN_ACCOUNTS] 계정 상태 변경 실패:', err);
        window.TEA_TOAST.show('계정 상태 변경 중 오류가 발생했습니다. 다시 시도해 주세요.', 'error');
      });
  }

  // ---------------------------------------------------------------------
  // 비밀번호 직접 변경 (Cloud Function: setStaffPassword)
  //   가상 이메일(@cne.go.kr)을 쓰므로 재설정 메일은 사용하지 않고,
  //   본청 관리자가 새 비밀번호를 직접 지정한다.
  // ---------------------------------------------------------------------
  function getPasswordModal() {
    return el('admin-password-modal');
  }

  function setPasswordFormError(message) {
    const errEl = el('admin-password-form-error');
    if (!errEl) return;
    if (!message) {
      errEl.textContent = '';
      errEl.classList.add('hidden');
    } else {
      errEl.textContent = message;
      errEl.classList.remove('hidden');
    }
  }

  function openPasswordModal(acc) {
    const modal = getPasswordModal();
    if (!modal || !acc) return;

    passwordTargetUid = acc.uid;
    setPasswordFormError('');

    const labelEl = el('admin-password-target-label');
    if (labelEl) {
      labelEl.textContent = `대상: ${acc.loginId || '-'} (${acc.name || '-'})`;
    }

    const newEl = el('admin-password-new');
    const confirmEl = el('admin-password-confirm');
    if (newEl) newEl.value = '';
    if (confirmEl) confirmEl.value = '';

    modal.classList.remove('hidden');
    requestAnimationFrame(() => modal.classList.add('modal-open'));
    document.body.classList.add('overflow-hidden');
    if (newEl) newEl.focus();
  }

  function closePasswordModal() {
    const modal = getPasswordModal();
    if (!modal) return;
    modal.classList.remove('modal-open');
    document.body.classList.remove('overflow-hidden');
    setTimeout(() => modal.classList.add('hidden'), 150);
    passwordTargetUid = null;
  }

  function setPasswordSubmitBusy(busy) {
    const btn = el('admin-password-submit-btn');
    if (!btn) return;
    btn.disabled = busy;
    btn.textContent = busy ? '변경 중...' : '변경';
  }

  function describePasswordChangeError(err) {
    const code = err && (err.code || err.message);
    if (code === 'functions/not-found' || code === 'not-found') {
      return '비밀번호 변경 기능(Cloud Function)이 아직 배포되지 않았습니다. firebase deploy --only functions 를 실행해 주세요.';
    }
    if (code === 'functions/permission-denied' || code === 'permission-denied') {
      return '본청(총괄) 관리자만 비밀번호를 변경할 수 있습니다.';
    }
    if (code === 'functions/unauthenticated' || code === 'unauthenticated') {
      return '로그인이 필요합니다. 다시 로그인해 주세요.';
    }
    if (code === 'functions/invalid-argument' || code === 'invalid-argument') {
      return (err.details && String(err.details)) || '입력값을 확인해 주세요. 비밀번호는 6자 이상이어야 합니다.';
    }
    if (code === 'functions/internal' || code === 'internal') {
      return '비밀번호 변경 중 서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
    }
    return '비밀번호 변경 중 오류가 발생했습니다. Cloud Function 배포 상태를 확인해 주세요.';
  }

  function handlePasswordFormSubmit(e) {
    e.preventDefault();
    setPasswordFormError('');

    if (!passwordTargetUid) {
      setPasswordFormError('대상 계정을 찾을 수 없습니다.');
      return;
    }

    const newPassword = el('admin-password-new').value;
    const confirmPassword = el('admin-password-confirm').value;

    if (!newPassword || newPassword.length < 6) {
      setPasswordFormError('새 비밀번호는 6자 이상으로 입력해 주세요.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordFormError('새 비밀번호와 확인 입력이 일치하지 않습니다.');
      return;
    }

    if (!window.TEA_FIREBASE.functions) {
      setPasswordFormError('Cloud Functions SDK가 로드되지 않았습니다.');
      return;
    }

    setPasswordSubmitBusy(true);
    const callable = window.TEA_FIREBASE.functions.httpsCallable('setStaffPassword');
    callable({ uid: passwordTargetUid, password: newPassword })
      .then(() => {
        window.TEA_TOAST.show('비밀번호가 변경되었습니다.', 'success');
        closePasswordModal();
      })
      .catch((err) => {
        console.error('[TEA_ADMIN_ACCOUNTS] 비밀번호 변경 실패:', err);
        setPasswordFormError(describePasswordChangeError(err));
      })
      .finally(() => setPasswordSubmitBusy(false));
  }

  // ---------------------------------------------------------------------
  // 초기화
  // ---------------------------------------------------------------------
  function init() {
    if (initialized) return;
    initialized = true;

    const createBtn = el('admin-account-create-btn');
    if (createBtn) createBtn.addEventListener('click', () => openModal('create'));

    const modal = getModal();
    if (modal) {
      modal.querySelectorAll('[data-admin-account-close]').forEach((btn) => {
        btn.addEventListener('click', closeModal);
      });
    }

    const form = el('admin-account-form');
    if (form) {
      form.addEventListener('submit', handleFormSubmit);
      // Enter 키로 실수 제출되는 것을 방지: 오직 [저장] 버튼을 눌러야만 계정이 생성/수정된다.
      window.TEA_UI.disableEnterSubmit(form);
    }

    const roleEl = el('admin-account-role');
    if (roleEl) roleEl.addEventListener('change', updateRegionFieldVisibility);

    const passwordModal = getPasswordModal();
    if (passwordModal) {
      passwordModal.querySelectorAll('[data-admin-password-close]').forEach((btn) => {
        btn.addEventListener('click', closePasswordModal);
      });
    }
    const passwordForm = el('admin-password-form');
    if (passwordForm) {
      passwordForm.addEventListener('submit', handlePasswordFormSubmit);
      // Enter 키로 실수 제출되는 것을 방지: 오직 [변경] 버튼을 눌러야만 비밀번호가 변경된다.
      window.TEA_UI.disableEnterSubmit(passwordForm);
    }

    const listEl = el('admin-account-list');
    if (listEl) {
      listEl.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.admin-account-edit-btn');
        if (editBtn) {
          const uid = editBtn.getAttribute('data-uid');
          const acc = accounts.find((a) => a.uid === uid);
          if (acc) openModal('edit', acc);
          return;
        }

        const resetBtn = e.target.closest('.admin-account-reset-btn');
        if (resetBtn) {
          const uid = resetBtn.getAttribute('data-uid');
          const acc = accounts.find((a) => a.uid === uid);
          if (acc) openPasswordModal(acc);
          return;
        }

        const toggleBtn = e.target.closest('.admin-account-toggle-btn');
        if (toggleBtn && !toggleBtn.disabled) {
          const uid = toggleBtn.getAttribute('data-uid');
          const nextDisabled = toggleBtn.getAttribute('data-next-disabled') === 'true';
          handleToggleDisabled(uid, nextDisabled);
        }
      });
    }
  }

  window.TEA_ADMIN_ACCOUNTS = { init, loadAndRenderAccounts };
})();
