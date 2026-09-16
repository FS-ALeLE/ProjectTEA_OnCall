/**
 * stats-view.js
 * -----------------------------------------------------------------------
 * [통계] 화면 - 본청(총괄) 전용 대시보드 시각화.
 *
 * - window.TEA_DATA.cases(js/firebase-cases.js가 Firestore에서 실시간 구독한
 *   실제 사안 목록)를 그대로 집계하여 화면을 구성합니다. 별도의 더미(임시)
 *   데이터는 더 이상 사용하지 않습니다.
 * - 상단 필터바(지역/기간/학교급)를 조작하면 KPI 카드, 지역별 막대그래프,
 *   학교급별 진행바, 16대 침해유형 랭킹이 모두 실시간으로 재계산됩니다.
 * - "전년 동기 대비"는 분류번호의 접수년도(classification.year)를 기준으로
 *   올해(현재 연도)와 작년 데이터를 실제 사안 목록에서 각각 걸러내어 비교합니다.
 *   작년 데이터가 아직 없으면(신규 도입 등) 증감률 문구는 표시하지 않습니다.
 * - [엑셀 다운로드] 버튼은 현재 필터가 적용된 결과를 BOM UTF-8 CSV로
 *   즉시 다운로드합니다. (한글 깨짐 없이 Excel에서 바로 열림)
 * - [통계 보고서 출력] 버튼은 화면 상단 필터/버튼 영역을 숨기고, 인쇄 전용
 *   헤더(필터 요약 포함)를 노출한 뒤 브라우저 인쇄 다이얼로그를 엽니다.
 * -----------------------------------------------------------------------
 */
(function () {
  'use strict';

  const state = {
    region: '',
    period: '',
    level: '',
  };

  let initialized = false;
  let regionChartInstance = null;
  let violationPieChartInstance = null;

  const CHART_PALETTE = ['#4f46e5', '#0ea5e9', '#f59e0b', '#f43f5e', '#10b981', '#8b5cf6', '#ec4899', '#14b8a6'];

  // ---------------------------------------------------------------------
  // 실제 사안(Case) 객체 접근 헬퍼
  //   신규 접수 폼은 classification.{regionCode,levelCode,year} 체계를 쓰므로
  //   이 값을 우선 사용하고, 혹시 없는 구형 레코드는 최상위 필드로 대체한다.
  // ---------------------------------------------------------------------
  function getCaseRegionCode(c) {
    return (c.classification && c.classification.regionCode) || c.regionCode || '';
  }
  function getCaseLevelCode(c) {
    return (c.classification && c.classification.levelCode) || c.levelCode || '';
  }
  function getCaseYear(c) {
    if (c.classification && c.classification.year) return c.classification.year;
    if (c.receivedDate) {
      const y = parseInt(String(c.receivedDate).slice(0, 4), 10);
      if (!isNaN(y)) return y;
    }
    return null;
  }
  function getCaseQuarter(c) {
    if (!c.receivedDate) return null;
    const month = parseInt(String(c.receivedDate).slice(5, 7), 10);
    if (!month || isNaN(month)) return null;
    return Math.ceil(month / 3);
  }
  function getCaseViolationTypes(c) {
    if (c.violationTypes && c.violationTypes.length > 0) return c.violationTypes;
    return c.caseType ? [c.caseType] : [];
  }
  function getRegionName(code) {
    const { REGIONS } = window.TEA_FORM_OPTIONS;
    const found = REGIONS.find((r) => r.code === code);
    return found ? found.name : '';
  }
  function getLevelName(code) {
    const { SCHOOL_LEVELS } = window.TEA_FORM_OPTIONS;
    const found = SCHOOL_LEVELS.find((l) => l.code === code);
    return found ? found.name : '';
  }

  // ---------------------------------------------------------------------
  // 필터 select 옵션 채우기
  // ---------------------------------------------------------------------
  function populateFilterOptions() {
    const { REGIONS, SCHOOL_LEVELS } = window.TEA_FORM_OPTIONS;

    const periodDefaultOpt = document.querySelector('#stats-filter-period option[value=""]');
    if (periodDefaultOpt) periodDefaultOpt.textContent = `${new Date().getFullYear()}년 전체`;

    const regionSel = document.getElementById('stats-filter-region');
    if (regionSel && regionSel.options.length <= 1) {
      REGIONS.forEach((r) => {
        const opt = document.createElement('option');
        opt.value = r.code;
        opt.textContent = r.name;
        regionSel.appendChild(opt);
      });
    }

    const levelSel = document.getElementById('stats-filter-level');
    if (levelSel && levelSel.options.length <= 1) {
      SCHOOL_LEVELS.forEach((l) => {
        const opt = document.createElement('option');
        opt.value = l.code;
        opt.textContent = l.name;
        levelSel.appendChild(opt);
      });
    }
  }

  function readFilters() {
    return {
      region: document.getElementById('stats-filter-region')?.value || '',
      level: document.getElementById('stats-filter-level')?.value || '',
      quarter: document.getElementById('stats-filter-period')?.value || '',
    };
  }

  /** 실제 사안 목록에서 특정 연도 + 화면 필터 조건에 맞는 레코드만 추출한다. */
  function filterCasesByYear(cases, year, filters) {
    const f = filters || {};
    return cases.filter((c) => {
      if (getCaseYear(c) !== year) return false;
      if (f.region && getCaseRegionCode(c) !== f.region) return false;
      if (f.level && getCaseLevelCode(c) !== f.level) return false;
      if (f.quarter && String(getCaseQuarter(c)) !== String(f.quarter)) return false;
      return true;
    });
  }

  // ---------------------------------------------------------------------
  // KPI 요약 카드
  // ---------------------------------------------------------------------
  function renderKpiCards(filtered, prevFiltered) {
    const total = filtered.length;
    const progress = filtered.filter((r) => !r.isDraft && r.status !== 'closed').length;
    const closed = filtered.filter((r) => !r.isDraft && r.status === 'closed').length;
    const draft = filtered.filter((r) => r.isDraft).length;

    setText('stats-kpi-total', total + '건');
    setText('stats-kpi-progress', progress + '건');
    setText('stats-kpi-closed', closed + '건');
    setText('stats-kpi-draft', draft + '건');

    const prevTotal = prevFiltered.length;
    const yoyEl = document.getElementById('stats-kpi-total-yoy');
    if (yoyEl) {
      if (prevTotal > 0) {
        const diff = total - prevTotal;
        const pct = ((diff / prevTotal) * 100).toFixed(1);
        const icon = diff > 0 ? '🔺' : diff < 0 ? '🔽' : '–';
        yoyEl.textContent = `${icon} 전년 동기 대비 ${diff >= 0 ? '+' : ''}${pct}% (${prevTotal}건 → ${total}건)`;
        yoyEl.className = 'text-[11px] font-bold mt-3 ' + (diff > 0 ? 'text-rose-600' : diff < 0 ? 'text-indigo-600' : 'text-slate-400');
      } else {
        yoyEl.textContent = '';
      }
    }
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // ---------------------------------------------------------------------
  // 지역별 발생 건수 비교 차트 (Chart.js 막대 그래프)
  // ---------------------------------------------------------------------
  function renderRegionChart(filtered) {
    const canvas = document.getElementById('stats-region-chart-canvas');
    const emptyEl = document.getElementById('stats-region-chart-empty');
    if (!canvas || typeof Chart === 'undefined') return;

    const { REGIONS } = window.TEA_FORM_OPTIONS;
    const counts = {};
    REGIONS.forEach((r) => { counts[r.code] = { name: r.name, count: 0 }; });
    filtered.forEach((r) => {
      const code = getCaseRegionCode(r);
      if (counts[code]) counts[code].count += 1;
    });

    const rows = Object.values(counts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const hasData = rows.some((r) => r.count > 0);
    canvas.classList.toggle('hidden', !hasData);
    if (emptyEl) {
      emptyEl.classList.toggle('hidden', hasData);
      emptyEl.textContent = '선택한 조건에 해당하는 데이터가 없습니다.';
    }
    if (!hasData) return;

    const chartData = {
      labels: rows.map((r) => r.name),
      datasets: [
        {
          label: '발생 건수',
          data: rows.map((r) => r.count),
          backgroundColor: '#6366f1',
          hoverBackgroundColor: '#4338ca',
          borderRadius: 6,
          maxBarThickness: 36,
        },
      ],
    };

    if (regionChartInstance) {
      regionChartInstance.data = chartData;
      regionChartInstance.update();
      return;
    }

    regionChartInstance = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: chartData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.parsed.y}건`,
            },
          },
        },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0, font: { size: 11 } } },
          x: { ticks: { font: { size: 11, weight: '600' } } },
        },
      },
    });
  }

  // ---------------------------------------------------------------------
  // 침해 유형 Top 5 원형 차트 (Chart.js 도넛/파이 그래프)
  // ---------------------------------------------------------------------
  function renderViolationPieChart(filtered) {
    const canvas = document.getElementById('stats-violation-pie-canvas');
    const emptyEl = document.getElementById('stats-violation-pie-empty');
    if (!canvas || typeof Chart === 'undefined') return;

    const counts = countByViolationType(filtered);
    const ranked = Object.keys(counts)
      .map((type) => ({ type, count: counts[type] }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const hasData = ranked.length > 0;
    canvas.classList.toggle('hidden', !hasData);
    if (emptyEl) {
      emptyEl.classList.toggle('hidden', hasData);
      emptyEl.textContent = '선택한 조건에 해당하는 데이터가 없습니다.';
    }
    if (!hasData) return;

    const chartData = {
      labels: ranked.map((r) => r.type),
      datasets: [
        {
          data: ranked.map((r) => r.count),
          backgroundColor: CHART_PALETTE.slice(0, ranked.length),
          borderColor: '#ffffff',
          borderWidth: 2,
        },
      ],
    };

    if (violationPieChartInstance) {
      violationPieChartInstance.data = chartData;
      violationPieChartInstance.update();
      return;
    }

    violationPieChartInstance = new Chart(canvas.getContext('2d'), {
      type: 'pie',
      data: chartData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12 } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const total = ctx.dataset.data.reduce((sum, v) => sum + v, 0) || 1;
                const pct = ((ctx.parsed / total) * 100).toFixed(1);
                return `${ctx.label}: ${ctx.parsed}건 (${pct}%)`;
              },
            },
          },
        },
      },
    });
  }

  // ---------------------------------------------------------------------
  // 학교급별 발생 비율 - 진행 바
  // ---------------------------------------------------------------------
  function renderLevelChart(filtered) {
    const container = document.getElementById('stats-level-chart');
    if (!container) return;

    const { SCHOOL_LEVELS } = window.TEA_FORM_OPTIONS;
    const counts = {};
    SCHOOL_LEVELS.forEach((l) => { counts[l.code] = { name: l.name, count: 0 }; });
    filtered.forEach((r) => {
      const code = getCaseLevelCode(r);
      if (counts[code]) counts[code].count += 1;
    });

    const total = filtered.length || 1;

    if (filtered.length === 0) {
      container.innerHTML = '<p class="text-[12px] text-slate-400 text-center py-6">선택한 조건에 해당하는 데이터가 없습니다.</p>';
      return;
    }

    const levelColors = {
      1: 'bg-amber-100 text-amber-700',
      2: 'bg-sky-100 text-sky-700',
      3: 'bg-indigo-100 text-indigo-700',
      4: 'bg-violet-100 text-violet-700',
      5: 'bg-rose-100 text-rose-700',
      6: 'bg-slate-200 text-slate-600',
    };

    container.innerHTML = SCHOOL_LEVELS.map((l) => {
      const item = counts[l.code];
      const pct = ((item.count / total) * 100).toFixed(1);
      return `
        <div class="level-bar-row tea-tooltip" data-tooltip="${escapeHtml(item.name)}: ${item.count}건 (${pct}%)">
          <div class="flex items-center justify-between">
            <span class="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-slate-700">
              <span class="w-2 h-2 rounded-full ${(levelColors[l.code] || '').split(' ')[0]}"></span>
              ${escapeHtml(item.name)}
            </span>
            <span class="text-[12px] font-extrabold text-slate-800">${item.count}건 <span class="text-slate-400 font-semibold">(${pct}%)</span></span>
          </div>
          <div class="level-bar-track">
            <div class="level-bar-fill" style="width:${pct}%"></div>
          </div>
        </div>`;
    }).join('');
  }

  // ---------------------------------------------------------------------
  // 16대 교육활동 침해 유형별 랭킹 (전년 동기 대비 증감 포함)
  // ---------------------------------------------------------------------
  function countByViolationType(records) {
    const map = {};
    records.forEach((r) => {
      getCaseViolationTypes(r).forEach((type) => {
        map[type] = (map[type] || 0) + 1;
      });
    });
    return map;
  }

  function renderRankingList(filtered, prevFiltered) {
    const container = document.getElementById('stats-ranking-list');
    if (!container) return;

    const currentCounts = countByViolationType(filtered);
    const prevCounts = countByViolationType(prevFiltered);

    const ranked = Object.keys(currentCounts)
      .map((type) => ({ type, count: currentCounts[type], prevCount: prevCounts[type] || 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    if (ranked.length === 0) {
      container.innerHTML = '<p class="text-[12px] text-slate-400 text-center py-6">선택한 조건에 해당하는 데이터가 없습니다.</p>';
      return;
    }

    container.innerHTML = ranked.map((item, idx) => {
      const rank = idx + 1;
      const diff = item.count - item.prevCount;
      let trendHtml;
      if (diff > 0) {
        trendHtml = `<span class="text-rose-600 font-extrabold">🔺 ${diff}건 증가</span>`;
      } else if (diff < 0) {
        trendHtml = `<span class="text-indigo-600 font-extrabold">🔽 ${Math.abs(diff)}건 감소</span>`;
      } else {
        trendHtml = `<span class="text-slate-400 font-extrabold">– 전년 동일</span>`;
      }

      return `
        <div class="rank-row">
          <span class="rank-badge rank-badge-${rank}">${rank}</span>
          <div class="flex-1 min-w-0">
            <p class="text-[13px] font-bold text-slate-800 leading-snug">${escapeHtml(item.type)}</p>
            <p class="text-[11px] text-slate-400 mt-0.5">전년 동기 ${item.prevCount}건 → 올해 ${item.count}건</p>
          </div>
          <div class="text-right shrink-0">
            <p class="text-lg font-extrabold text-slate-900">${item.count}<span class="text-[12px] font-bold text-slate-400 ml-0.5">건</span></p>
            <p class="text-[11px] mt-0.5">${trendHtml}</p>
          </div>
        </div>`;
    }).join('');
  }

  // ---------------------------------------------------------------------
  // 인쇄 보고서 헤더 텍스트 갱신
  // ---------------------------------------------------------------------
  function updatePrintHeading(filters, year) {
    const metaEl = document.getElementById('stats-print-meta');
    if (!metaEl) return;

    const regionName = filters.region ? getRegionName(filters.region) : '전체 지역';
    const levelName = filters.level ? getLevelName(filters.level) : '전체 학교급';
    const periodName = filters.quarter ? `${year}년 ${filters.quarter}분기` : `${year}년 전체`;
    const today = new Date();
    const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;

    metaEl.textContent = `대상: ${regionName} · ${levelName} · ${periodName}  |  출력일: ${dateStr}`;
  }

  // ---------------------------------------------------------------------
  // 전체 렌더링
  // ---------------------------------------------------------------------
  function render() {
    const filters = readFilters();
    state.region = filters.region;
    state.level = filters.level;
    state.period = filters.quarter;

    const currentYear = new Date().getFullYear();
    const allCases = (window.TEA_DATA && window.TEA_DATA.cases) || [];
    const filtered = filterCasesByYear(allCases, currentYear, filters);
    const prevFiltered = filterCasesByYear(allCases, currentYear - 1, filters);

    renderKpiCards(filtered, prevFiltered);
    renderRegionChart(filtered);
    renderViolationPieChart(filtered);
    renderLevelChart(filtered);
    renderRankingList(filtered, prevFiltered);
    updatePrintHeading(filters, currentYear);
  }

  // ---------------------------------------------------------------------
  // ★ 엑셀(CSV) 다운로드 - BOM UTF-8 처리로 한글 깨짐 없이 Excel에서 열림
  // ---------------------------------------------------------------------
  function csvEscape(value) {
    const str = String(value == null ? '' : value);
    if (/[",\n]/.test(str)) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  function handleExportCsv() {
    const filters = readFilters();
    const currentYear = new Date().getFullYear();
    const allCases = (window.TEA_DATA && window.TEA_DATA.cases) || [];
    const filtered = filterCasesByYear(allCases, currentYear, filters);
    const { STATUS_META } = window.TEA_DATA;

    if (filtered.length === 0) {
      window.TEA_TOAST.show('다운로드할 데이터가 없습니다. 필터 조건을 확인해 주세요.', 'error');
      return;
    }

    const header = ['분류번호', '지역', '학교급', '학교명', '피해교원', '침해유형', '진행상태', '접수일자'];
    const rows = filtered.map((r) => {
      const statusLabel = r.isDraft ? '임시저장' : ((STATUS_META[r.status] || {}).label || r.status);
      return [
        r.id,
        getRegionName(getCaseRegionCode(r)),
        getLevelName(getCaseLevelCode(r)),
        r.school,
        r.teacherName,
        getCaseViolationTypes(r).join(' / '),
        statusLabel,
        r.receivedDate,
      ];
    });

    const lines = [header, ...rows].map((row) => row.map(csvEscape).join(','));
    const csvContent = lines.join('\r\n');

    // BOM(Byte Order Mark)을 맨 앞에 추가해야 Excel에서 한글이 깨지지 않는다.
    const bom = '\ufeff';
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });

    const url = URL.createObjectURL(blob);
    const today = new Date();
    const stamp = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    const link = document.createElement('a');
    link.href = url;
    link.download = `교권침해사안통계_${currentYear}_${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    window.TEA_TOAST.show(`${filtered.length}건의 통계 데이터를 CSV 파일로 다운로드했습니다.`, 'success');
  }

  // ---------------------------------------------------------------------
  // 통계 보고서 출력 (인쇄)
  // ---------------------------------------------------------------------
  function handlePrint() {
    updatePrintHeading(readFilters(), new Date().getFullYear());
    window.print();
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ---------------------------------------------------------------------
  // 초기화
  // ---------------------------------------------------------------------
  function init() {
    populateFilterOptions();

    // [통계] 화면은 '본청(총괄)' 계정으로 로그인할 때마다 다시 초기화될 수 있으므로,
    // change/click 리스너가 중복으로 쌓이지 않도록 최초 1회만 바인딩한다.
    if (!initialized) {
      ['stats-filter-region', 'stats-filter-period', 'stats-filter-level'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', render);
      });

      const exportBtn = document.getElementById('stats-export-btn');
      if (exportBtn) exportBtn.addEventListener('click', handleExportCsv);

      const printBtn = document.getElementById('stats-print-btn');
      if (printBtn) printBtn.addEventListener('click', handlePrint);

      initialized = true;
    }

    render();
  }

  window.TEA_STATS = { init, render };
})();
