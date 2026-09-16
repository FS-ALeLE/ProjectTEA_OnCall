/**
 * ui-components.js
 * -----------------------------------------------------------------------
 * 여러 폼 모듈에서 공통으로 재사용하는 소형 UI 컴포넌트 동작을 정의합니다.
 *   1) 세그먼트 토글(Y/N, 유/무, 개최/미개최 등 2지선다 버튼 그룹)
 *   2) 슬라이드 펼침/접힘 애니메이션 헬퍼 (조건부 입력칸 노출용)
 *
 * 이벤트 위임(delegation) 방식을 사용하기 때문에, 이후 JS로 동적으로
 * 추가되는 요소(예: 관련자 카드)에도 별도 재바인딩 없이 즉시 동작합니다.
 * -----------------------------------------------------------------------
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // 세그먼트 토글 (예: <div data-yn-group="..." data-value="N"> 안의
  // <button data-yn-value="Y">, <button data-yn-value="N"> 클릭 처리)
  // ---------------------------------------------------------------------
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-yn-value]');
    if (!btn) return;
    const group = btn.closest('[data-yn-group]');
    if (!group) return;

    const value = btn.getAttribute('data-yn-value');
    group.setAttribute('data-value', value);

    group.querySelectorAll('[data-yn-value]').forEach((optionBtn) => {
      optionBtn.classList.toggle('yn-option-active', optionBtn === btn);
    });

    group.dispatchEvent(new CustomEvent('yn-change', { detail: { value }, bubbles: true }));
  });

  /** 세그먼트 토글 그룹의 현재 선택 값을 반환 */
  function getYnValue(group) {
    if (!group) return null;
    return group.getAttribute('data-value');
  }

  /** 세그먼트 토글 그룹의 값을 프로그램적으로 지정 (초기화 등에 사용) */
  function setYnValue(group, value) {
    if (!group) return;
    group.setAttribute('data-value', value);
    group.querySelectorAll('[data-yn-value]').forEach((optionBtn) => {
      optionBtn.classList.toggle('yn-option-active', optionBtn.getAttribute('data-yn-value') === value);
    });
  }

  // ---------------------------------------------------------------------
  // 슬라이드 펼침 / 접힘
  //   대상 엘리먼트는 CSS 클래스 `.slide-panel` 을 가지고 있어야 하며,
  //   접힌 상태에서는 `hidden` 클래스가 함께 붙어 있어야 합니다.
  // ---------------------------------------------------------------------
  function slideDown(el) {
    if (!el) return;
    el.classList.remove('hidden');
    el.style.height = '0px';
    const targetHeight = el.scrollHeight;
    requestAnimationFrame(() => {
      el.style.height = targetHeight + 'px';
    });
    const onEnd = () => {
      el.style.height = '';
      el.removeEventListener('transitionend', onEnd);
    };
    el.addEventListener('transitionend', onEnd);
  }

  function slideUp(el) {
    if (!el || el.classList.contains('hidden')) return;
    el.style.height = el.scrollHeight + 'px';
    requestAnimationFrame(() => {
      el.style.height = '0px';
    });
    const onEnd = () => {
      el.classList.add('hidden');
      el.style.height = '';
      el.removeEventListener('transitionend', onEnd);
    };
    el.addEventListener('transitionend', onEnd);
  }

  function slideToggle(el, shouldShow) {
    if (shouldShow) slideDown(el);
    else slideUp(el);
  }

  // ---------------------------------------------------------------------
  // 연락처 자동 하이픈 포맷터
  //   class="phone-input" 이 붙은 입력창에 숫자를 입력하면 010-0000-0000
  //   형태로 자동으로 하이픈이 삽입됩니다. 이벤트 위임 방식이므로 이후
  //   동적으로 추가되는 입력창(예: 보호자 연락처)에도 바로 적용됩니다.
  // ---------------------------------------------------------------------
  function formatPhoneNumber(raw) {
    const digits = (raw || '').replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return digits.slice(0, 3) + '-' + digits.slice(3);
    if (digits.length <= 10) return digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6);
    return digits.slice(0, 3) + '-' + digits.slice(3, 7) + '-' + digits.slice(7, 11);
  }

  document.addEventListener('input', function (e) {
    const el = e.target;
    if (!el || !el.classList || !el.classList.contains('phone-input')) return;
    el.value = formatPhoneNumber(el.value);
  });

  // ---------------------------------------------------------------------
  // Enter 키로 실수 제출되는 것 방지
  //   입력칸에 값을 채우다가 Enter를 눌렀을 때 폼이 곧바로 제출(등록)되어
  //   버리는 사고를 막기 위해, 지정한 <form> 안에서는 Enter 키로는 절대
  //   제출되지 않게 한다(줄바꿈이 필요한 <textarea>는 예외로 그대로 둔다).
  //   실제 등록/저장은 오직 버튼을 직접 클릭해야만 이루어진다.
  // ---------------------------------------------------------------------
  function disableEnterSubmit(form) {
    if (!form) return;
    form.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const tag = e.target && e.target.tagName;
      if (tag === 'TEXTAREA' || tag === 'BUTTON') return;
      e.preventDefault();
    });
  }

  window.TEA_UI = { getYnValue, setYnValue, slideDown, slideUp, slideToggle, formatPhoneNumber, disableEnterSubmit };
})();
