/**
 * new-case-attachments.js
 * -----------------------------------------------------------------------
 * 첨부파일 업로드 컴포넌트. 드래그 앤 드롭 또는 클릭을 통한 파일 선택을
 * 모두 지원하며, 사진(jpg/png/gif), HWP, PDF 파일을 지원합니다.
 *
 * "사안 접수" 폼과 사건 상세 모달의 [수정] 모드에서 동시에 여러 개의
 * 독립적인 업로드 영역이 필요할 수 있으므로, createAttachmentManager()
 * 팩토리로 인스턴스를 생성하는 구조로 되어 있습니다. 각 인스턴스는 자신만의
 * 파일 목록 상태를 가지며, 서로 다른 DOM id에 바인딩됩니다.
 *
 * 새로 선택된 파일은 실제 브라우저 File 객체(item.file)를 화면에 보관하고
 * 있다가, [사안 등록]/[저장] 시점에 finalizeAttachments()가 Firebase Cloud
 * Storage의 cases/[분류번호]/ 경로로 실제 업로드하여 다운로드 URL을
 * 확보한다. 이미 업로드되어 URL이 있는 기존 첨부파일(item.url)은 재업로드하지 않는다.
 * -----------------------------------------------------------------------
 */
(function () {
  'use strict';

  const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.hwp', '.hwpx', '.pdf'];

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function getFileIconSvg(fileName) {
    const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) {
      return '<svg class="w-4 h-4 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M4 6h16a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1z"/><circle cx="8.5" cy="8.5" r="1.5"/></svg>';
    }
    if (ext === '.pdf') {
      return '<svg class="w-4 h-4 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M7 21h10a1 1 0 001-1V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0011.586 3H7a1 1 0 00-1 1v16a1 1 0 001 1z"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v6h6"/></svg>';
    }
    if (['.hwp', '.hwpx'].includes(ext)) {
      return '<svg class="w-4 h-4 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M7 21h10a1 1 0 001-1V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0011.586 3H7a1 1 0 00-1 1v16a1 1 0 001 1z"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v6h6"/></svg>';
    }
    return '<svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M7 21h10a1 1 0 001-1V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0011.586 3H7a1 1 0 00-1 1v16a1 1 0 001 1z"/></svg>';
  }

  function isAcceptedFile(file) {
    const lowerName = file.name.toLowerCase();
    return ACCEPTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  }

  /**
   * 독립적인 첨부파일 업로드 영역 인스턴스를 생성합니다.
   * @param {object} options
   * @param {string} options.dropzoneId
   * @param {string} options.fileInputId
   * @param {string} options.listId
   * @param {string} [options.countId]
   * @param {Array}  [options.initialFiles] 기존 첨부파일 메타데이터 목록(Firestore에서 조회한 url 포함, 수정 모드 프리필용)
   * @returns {{collect:Function, reset:Function, addFiles:Function, removeFileAt:Function, hasPendingUploads:Function, finalizeAttachments:Function}}
   */
  function createAttachmentManager(options) {
    const opts = options || {};
    let attachedFiles = (opts.initialFiles || []).map((f) => Object.assign({}, f));

    function renderList() {
      const listEl = document.getElementById(opts.listId);
      const countEl = opts.countId ? document.getElementById(opts.countId) : null;
      if (!listEl) return;

      if (attachedFiles.length === 0) {
        listEl.innerHTML = '<p class="text-[12px] text-slate-400 text-center py-2">아직 첨부된 파일이 없습니다.</p>';
      } else {
        listEl.innerHTML = attachedFiles
          .map(
            (file, index) => `
          <div class="flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-lg px-3 py-2">
            <div class="flex items-center gap-2 min-w-0">
              ${getFileIconSvg(file.name)}
              ${
                file.url
                  ? `<a href="${file.url}" target="_blank" rel="noopener" download="${file.name}" class="text-[13px] font-medium text-indigo-600 hover:text-indigo-800 hover:underline truncate" title="다운로드">${file.name}</a>`
                  : `<span class="text-[13px] font-medium text-slate-700 truncate">${file.name}</span>`
              }
              <span class="text-[11px] text-slate-400 shrink-0">${formatFileSize(file.size)}</span>
              ${
                file.url
                  ? '<span class="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md shrink-0">업로드됨</span>'
                  : '<span class="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-md shrink-0">업로드 대기</span>'
              }
            </div>
            <button type="button" class="attachment-remove-btn shrink-0 text-slate-400 hover:text-rose-500 transition-colors" data-index="${index}" title="삭제">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>`
          )
          .join('');
      }

      if (countEl) countEl.textContent = attachedFiles.length + '개 파일';
    }

    function addFiles(fileList) {
      const incoming = Array.from(fileList);
      const rejected = [];

      incoming.forEach((file) => {
        if (isAcceptedFile(file)) {
          attachedFiles.push({ name: file.name, size: file.size, type: file.type, file });
        } else {
          rejected.push(file.name);
        }
      });

      renderList();

      if (rejected.length > 0) {
        window.TEA_TOAST && window.TEA_TOAST.show(`지원하지 않는 형식의 파일은 제외되었습니다: ${rejected.join(', ')}`, 'error');
      }
    }

    function removeFileAt(index) {
      attachedFiles.splice(index, 1);
      renderList();
    }

    /** 화면 표시/즉시 검증용 - 아직 업로드되지 않은 항목도 그대로 포함되어 반환된다. */
    function collect() {
      return attachedFiles.slice();
    }

    function reset(files) {
      attachedFiles = (files || []).map((f) => Object.assign({}, f));
      renderList();
    }

    function hasPendingUploads() {
      return attachedFiles.some((f) => !!f.file);
    }

    /**
     * [사안 등록]/[저장] 시점에 호출: 아직 업로드되지 않은(File 객체를 보유한)
     * 항목만 Cloud Storage로 실제 업로드하고, 이미 업로드되어 url이 있는
     * 항목은 그대로 재사용한다. File 객체는 Firestore에 저장할 수 없으므로
     * 반환값에는 포함하지 않는다.
     * @param {string} caseId
     * @param {string} [regionCode]
     * @returns {Promise<Array<{name:string,size:number,type:string,url:string,path:string}>>}
     */
    function finalizeAttachments(caseId, regionCode) {
      const tasks = attachedFiles.map((item) => {
        if (item.file) {
          return window.TEA_FIRESTORE.uploadAttachment(caseId, item.file, regionCode);
        }
        return Promise.resolve({ name: item.name, size: item.size, type: item.type || '', url: item.url || '', path: item.path || '' });
      });
      return Promise.all(tasks);
    }

    function init() {
      const dropzone = document.getElementById(opts.dropzoneId);
      const fileInput = document.getElementById(opts.fileInputId);
      const listEl = document.getElementById(opts.listId);
      if (!dropzone || !fileInput) return;

      dropzone.addEventListener('click', () => fileInput.click());

      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) addFiles(e.target.files);
        fileInput.value = '';
      });

      ['dragenter', 'dragover'].forEach((evtName) => {
        dropzone.addEventListener(evtName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.add('dropzone-active');
        });
      });

      ['dragleave', 'dragend'].forEach((evtName) => {
        dropzone.addEventListener(evtName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.remove('dropzone-active');
        });
      });

      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('dropzone-active');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          addFiles(e.dataTransfer.files);
        }
      });

      if (listEl) {
        listEl.addEventListener('click', (e) => {
          const btn = e.target.closest('.attachment-remove-btn');
          if (!btn) return;
          removeFileAt(parseInt(btn.getAttribute('data-index'), 10));
        });
      }

      renderList();
    }

    init();

    return { collect, reset, addFiles, removeFileAt, hasPendingUploads, finalizeAttachments };
  }

  // -----------------------------------------------------------------------
  // "사안 접수" 폼에서 사용하는 기본(단일) 인스턴스 - 기존 호출부와의
  // 하위 호환을 위해 유지합니다.
  // -----------------------------------------------------------------------
  let defaultManager = null;

  function initAttachmentDropzone() {
    defaultManager = createAttachmentManager({
      dropzoneId: 'attachment-dropzone',
      fileInputId: 'attachment-input',
      listId: 'attachment-list',
      countId: 'attachment-count',
      initialFiles: [],
    });
  }

  function collectAttachments() {
    return defaultManager ? defaultManager.collect() : [];
  }

  function finalizeDefaultAttachments(caseId, regionCode) {
    return defaultManager ? defaultManager.finalizeAttachments(caseId, regionCode) : Promise.resolve([]);
  }

  function resetAttachments() {
    if (defaultManager) defaultManager.reset([]);
  }

  window.TEA_ATTACHMENTS = {
    initAttachmentDropzone,
    collectAttachments,
    finalizeDefaultAttachments,
    resetAttachments,
    formatFileSize,
    getFileIconSvg,
    createAttachmentManager,
  };
})();
