/**
 * toast.js
 * -----------------------------------------------------------------------
 * 화면 우측 하단에 잠깐 나타났다가 사라지는 알림 토스트 컴포넌트.
 * 폼 저장 성공/실패, 첨부파일 형식 오류 등의 간단한 피드백에 사용합니다.
 * -----------------------------------------------------------------------
 */
(function () {
  'use strict';

  const TYPE_STYLE = {
    success: { bar: 'bg-emerald-500', icon: '✓', iconBg: 'bg-emerald-100 text-emerald-600' },
    error: { bar: 'bg-rose-500', icon: '!', iconBg: 'bg-rose-100 text-rose-600' },
    info: { bar: 'bg-indigo-500', icon: 'i', iconBg: 'bg-indigo-100 text-indigo-600' },
  };

  function ensureContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'fixed bottom-6 right-6 z-[100] flex flex-col gap-3 items-end';
      document.body.appendChild(container);
    }
    return container;
  }

  function show(message, type = 'info', durationMs = 3200) {
    const container = ensureContainer();
    const style = TYPE_STYLE[type] || TYPE_STYLE.info;

    const toast = document.createElement('div');
    toast.className =
      'toast-item flex items-center gap-3 bg-white shadow-xl border border-slate-200 rounded-xl pl-3 pr-4 py-3 max-w-sm overflow-hidden relative';
    toast.innerHTML = `
      <span class="absolute left-0 top-0 bottom-0 w-1 ${style.bar}"></span>
      <span class="w-7 h-7 rounded-full ${style.iconBg} flex items-center justify-center font-bold text-sm shrink-0">${style.icon}</span>
      <p class="text-[13px] font-semibold text-slate-700 leading-snug">${message}</p>
    `;

    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast-item-visible'));

    setTimeout(() => {
      toast.classList.remove('toast-item-visible');
      setTimeout(() => toast.remove(), 200);
    }, durationMs);
  }

  window.TEA_TOAST = { show };
})();
