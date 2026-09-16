/**
 * new-case-timeline.js
 * -----------------------------------------------------------------------
 * [조치 경과] 유연한 단계별 타임라인 위젯.
 *
 * [접수 → 1차 출동 → 긴급보호조치 → 2차 출동 → 지역교보위 → 종결 → 심리지원]
 * 각 단계는 순서와 무관하게 원하는 단계를 자유롭게 클릭하여 활성화(기록 시작)
 * 할 수 있고, 활성화된 단계에는 날짜 선택 및 진행 내용 입력칸이 나타납니다.
 * 특정 단계(긴급보호조치, 지역교보위)는 전용 하위 입력 UI를 추가로 제공합니다.
 *
 * "사안 접수" 폼과 사건 상세 모달(조치 경과 섹션)에서 함께 재사용할 수 있도록,
 * 대상 컨테이너와 기존 진행 데이터(prefill)를 인자로 받는 형태로 구현되어
 * 있습니다. 사건 상세 모달에서는 사안이 진행되는 동안 언제든 이 위젯을 통해
 * 조치 경과를 계속 체크/기록하고 저장할 수 있습니다.
 * -----------------------------------------------------------------------
 */
(function () {
  'use strict';

  const { TIMELINE_STEPS, PROTECTION_OPTIONS } = window.TEA_FORM_OPTIONS;
  const DEFAULT_CONTAINER_ID = 'progress-timeline';

  function resolveContainer(container) {
    if (container instanceof HTMLElement) return container;
    return document.getElementById(DEFAULT_CONTAINER_ID);
  }

  function buildProtectionExtraHtml(extra) {
    const selected = (extra && extra.protectionOptions) || [];
    return `
      <div class="mt-3 pt-3 border-t border-dashed border-slate-300">
        <label class="form-label mb-1.5">보호조치 유형 (중복 선택 가능)</label>
        <div class="flex flex-wrap gap-3">
          ${PROTECTION_OPTIONS.map(
            (opt) => `
            <label class="checkbox-inline">
              <input type="checkbox" data-protection-option value="${opt}" ${selected.includes(opt) ? 'checked' : ''} />
              <span>${opt}</span>
            </label>`
          ).join('')}
        </div>
      </div>
    `;
  }

  function buildCommitteeExtraHtml(stepKey, extra) {
    extra = extra || {};
    const held = extra.committeeHeld !== false;
    return `
      <div class="mt-3 pt-3 border-t border-dashed border-slate-300">
        <label class="form-label mb-1.5">개최 여부</label>
        <div class="yn-toggle" data-yn-group="committee-${stepKey}" data-value="${held ? '개최' : '미개최'}">
          <button type="button" class="yn-option ${held ? 'yn-option-active' : ''}" data-yn-value="개최">개최</button>
          <button type="button" class="yn-option ${held ? '' : 'yn-option-active'}" data-yn-value="미개최">미개최</button>
        </div>

        <div class="slide-panel ${held ? '' : 'hidden'} mt-3 grid grid-cols-2 gap-3" data-committee-held-panel>
          <div>
            <label class="form-label">개최일자</label>
            <input type="date" class="form-input" data-field="committeeDate" value="${extra.committeeDate || ''}" />
          </div>
          <div>
            <label class="form-label">처분 사항</label>
            <input type="text" class="form-input" data-field="committeeDecision" placeholder="예: 서면사과, 특별교육 5시간 등" value="${extra.committeeDecision || ''}" />
          </div>
        </div>

        <div class="slide-panel ${held ? 'hidden' : ''} mt-3" data-committee-not-held-panel>
          <label class="form-label">미개최 사유</label>
          <textarea class="form-textarea" rows="2" data-field="committeeNotHeldReason" placeholder="미개최 사유를 입력하세요">${extra.committeeNotHeldReason || ''}</textarea>
        </div>
      </div>
    `;
  }

  /** @param {object} prefillEntry {active, date, note, extra} */
  function createStepElement(step, isLast, prefillEntry) {
    prefillEntry = prefillEntry || {};
    const isActive = !!prefillEntry.active;

    const wrapper = document.createElement('div');
    wrapper.className = 'timeline-step';
    wrapper.setAttribute('data-step-key', step.key);

    let extraHtml = '';
    if (step.kind === 'protection') extraHtml = buildProtectionExtraHtml(prefillEntry.extra);
    if (step.kind === 'committee') extraHtml = buildCommitteeExtraHtml(step.key, prefillEntry.extra);

    wrapper.innerHTML = `
      <div class="timeline-step-side">
        <button type="button" class="timeline-dot" data-step-dot title="클릭하여 이 단계 활성화/비활성화">
          <svg class="w-3 h-3 text-white opacity-0" data-step-check fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
        </button>
        ${isLast ? '' : '<div class="timeline-line"></div>'}
      </div>
      <div class="timeline-step-content ${isLast ? '' : 'pb-4'}">
        <button type="button" class="timeline-step-header" data-step-header>
          <span class="timeline-step-title">${step.label}</span>
          <span class="timeline-step-badge ${isActive ? '' : 'hidden'}" data-step-badge>기록됨</span>
          <svg class="w-4 h-4 text-slate-400 ml-auto transition-transform" data-step-chevron fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" /></svg>
        </button>
        <div class="slide-panel ${isActive ? '' : 'hidden'} mt-2 bg-slate-50 border border-slate-200 rounded-xl p-3" data-step-detail>
          <div class="grid grid-cols-3 gap-3">
            <div>
              <label class="form-label">처리일자</label>
              <input type="date" class="form-input" data-field="date" value="${prefillEntry.date || ''}" />
            </div>
            <div class="col-span-2">
              <label class="form-label">진행 내용</label>
              <textarea class="form-textarea" rows="2" data-field="note" placeholder="진행 내용을 개조식으로 입력하세요">${prefillEntry.note || ''}</textarea>
            </div>
          </div>
          ${extraHtml}
        </div>
      </div>
    `;

    const header = wrapper.querySelector('[data-step-header]');
    const dot = wrapper.querySelector('[data-step-dot]');
    const detail = wrapper.querySelector('[data-step-detail]');
    const badge = wrapper.querySelector('[data-step-badge]');
    const chevron = wrapper.querySelector('[data-step-chevron]');
    const check = wrapper.querySelector('[data-step-check]');

    if (isActive) {
      wrapper.classList.add('timeline-step-active');
      dot.classList.add('timeline-dot-active');
      check.classList.remove('opacity-0');
      chevron.classList.add('rotate-180');
    }

    const setActive = (active) => {
      wrapper.classList.toggle('timeline-step-active', active);
      dot.classList.toggle('timeline-dot-active', active);
      check.classList.toggle('opacity-0', !active);
      badge.classList.toggle('hidden', !active);
      chevron.classList.toggle('rotate-180', active);
      window.TEA_UI.slideToggle(detail, active);
    };

    const toggleActive = () => setActive(!wrapper.classList.contains('timeline-step-active'));

    header.addEventListener('click', toggleActive);
    dot.addEventListener('click', toggleActive);

    // 지역교보위: 개최/미개최 전환 시 하위 패널 토글
    if (step.kind === 'committee') {
      const committeeGroup = wrapper.querySelector(`[data-yn-group="committee-${step.key}"]`);
      const heldPanel = wrapper.querySelector('[data-committee-held-panel]');
      const notHeldPanel = wrapper.querySelector('[data-committee-not-held-panel]');
      committeeGroup.addEventListener('yn-change', (e) => {
        const held = e.detail.value === '개최';
        window.TEA_UI.slideToggle(heldPanel, held);
        window.TEA_UI.slideToggle(notHeldPanel, !held);
      });
    }

    return wrapper;
  }

  /**
   * @param {HTMLElement} [container] 대상 컨테이너 (생략 시 "사안 접수" 폼의 기본 컨테이너)
   * @param {Array} [prefillSteps] 기존 진행 데이터 [{key, active, date, note, extra}, ...]
   */
  function renderTimeline(container, prefillSteps) {
    const target = resolveContainer(container);
    if (!target) return;
    target.innerHTML = '';

    TIMELINE_STEPS.forEach((stepMeta, idx) => {
      const prefillEntry = (prefillSteps || []).find((s) => s.key === stepMeta.key) || null;
      target.appendChild(createStepElement(stepMeta, idx === TIMELINE_STEPS.length - 1, prefillEntry));
    });
  }

  function collectTimelineData(container) {
    const target = resolveContainer(container);
    if (!target) return [];

    return Array.from(target.querySelectorAll('.timeline-step')).map((stepEl) => {
      const key = stepEl.getAttribute('data-step-key');
      const stepMeta = TIMELINE_STEPS.find((s) => s.key === key);
      const active = stepEl.classList.contains('timeline-step-active');
      const date = stepEl.querySelector('[data-field="date"]').value;
      const note = stepEl.querySelector('[data-field="note"]').value.trim();

      const entry = { key, label: stepMeta ? stepMeta.label : key, active, date, note, extra: {} };

      if (stepMeta && stepMeta.kind === 'protection') {
        entry.extra.protectionOptions = Array.from(
          stepEl.querySelectorAll('[data-protection-option]:checked')
        ).map((cb) => cb.value);
      }

      if (stepMeta && stepMeta.kind === 'committee') {
        const committeeGroup = stepEl.querySelector(`[data-yn-group="committee-${key}"]`);
        const held = window.TEA_UI.getYnValue(committeeGroup) === '개최';
        entry.extra.committeeHeld = held;
        if (held) {
          entry.extra.committeeDate = stepEl.querySelector('[data-field="committeeDate"]').value;
          entry.extra.committeeDecision = stepEl.querySelector('[data-field="committeeDecision"]').value.trim();
        } else {
          entry.extra.committeeNotHeldReason = stepEl.querySelector('[data-field="committeeNotHeldReason"]').value.trim();
        }
      }

      return entry;
    });
  }

  /** 조치 경과 단계 데이터를 사건 상세 모달이 표시하는 간단한 timeline(date/note) 배열로 변환 */
  function buildDisplayTimeline(progressSteps) {
    return (progressSteps || [])
      .filter((step) => step.active)
      .map((step) => {
        const parts = [`[${step.label}]`];
        if (step.note) parts.push(step.note);

        if (step.extra && step.extra.protectionOptions && step.extra.protectionOptions.length > 0) {
          parts.push(`(보호조치: ${step.extra.protectionOptions.join(', ')})`);
        }
        if (step.extra && typeof step.extra.committeeHeld === 'boolean') {
          if (step.extra.committeeHeld) {
            parts.push(
              `(개최${step.extra.committeeDate ? ' ' + step.extra.committeeDate : ''}${
                step.extra.committeeDecision ? ' · 처분: ' + step.extra.committeeDecision : ''
              })`
            );
          } else {
            parts.push(`(미개최${step.extra.committeeNotHeldReason ? ' · 사유: ' + step.extra.committeeNotHeldReason : ''})`);
          }
        }

        return {
          date: step.date || window.TEA_DATA.isoDateOffset(0),
          note: parts.join(' '),
        };
      });
  }

  function initTimeline() {
    renderTimeline();
  }

  function resetTimeline(container) {
    renderTimeline(container, null);
  }

  window.TEA_TIMELINE = { initTimeline, renderTimeline, collectTimelineData, resetTimeline, buildDisplayTimeline };
})();
