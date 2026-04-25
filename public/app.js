const state = {
  date: getInitialDate(),
  today: todayString(),
  month: "",
  shifts: [],
  shift: null,
  todayShift: null,
  history: [],
  config: {
    kakaoJsKey: "",
    appBaseUrl: "",
  },
};

const els = {
  statusArea: document.querySelector("#statusArea"),
  refreshButton: document.querySelector("#refreshButton"),
  kakaoShareButton: document.querySelector("#kakaoShareButton"),
  todayDateText: document.querySelector("#todayDateText"),
  todayShift: document.querySelector("#todayShift"),
  templateDownloadButton: document.querySelector("#templateDownloadButton"),
  downloadHelp: document.querySelector("#downloadHelp"),
  downloadHelpText: document.querySelector("#downloadHelpText"),
  templateLocalPath: document.querySelector("#templateLocalPath"),
  templateDirectLink: document.querySelector("#templateDirectLink"),
  copyTemplateUrlButton: document.querySelector("#copyTemplateUrlButton"),
  copyTemplatePathButton: document.querySelector("#copyTemplatePathButton"),
  importForm: document.querySelector("#importForm"),
  importChangedByInput: document.querySelector("#importChangedByInput"),
  importReasonInput: document.querySelector("#importReasonInput"),
  xlsxInput: document.querySelector("#xlsxInput"),
  dateInput: document.querySelector("#dateInput"),
  monthInput: document.querySelector("#monthInput"),
  clearMonthButton: document.querySelector("#clearMonthButton"),
  listMeta: document.querySelector("#listMeta"),
  shiftList: document.querySelector("#shiftList"),
  selectedDateText: document.querySelector("#selectedDateText"),
  historyList: document.querySelector("#historyList"),
  undoDialog: document.querySelector("#undoDialog"),
  undoForm: document.querySelector("#undoForm"),
  undoDateText: document.querySelector("#undoDateText"),
  undoChangedByInput: document.querySelector("#undoChangedByInput"),
  undoReasonInput: document.querySelector("#undoReasonInput"),
  closeUndoButton: document.querySelector("#closeUndoButton"),
  cancelUndoButton: document.querySelector("#cancelUndoButton"),
};

init();

async function init() {
  els.dateInput.value = state.date;
  els.monthInput.value = "";
  restoreActorNames();
  bindEvents();

  await Promise.all([loadConfig(), reloadAll()]);
  initKakao();
}

function bindEvents() {
  els.refreshButton.addEventListener("click", reloadAll);
  els.kakaoShareButton.addEventListener("click", shareToKakao);
  els.templateDownloadButton.addEventListener("click", downloadTemplate);
  els.copyTemplateUrlButton.addEventListener("click", copyTemplateUrl);
  els.copyTemplatePathButton.addEventListener("click", copyTemplatePath);
  els.importForm.addEventListener("submit", importXlsx);
  els.clearMonthButton.addEventListener("click", async () => {
    state.month = "";
    els.monthInput.value = "";
    await loadShifts();
  });

  els.dateInput.addEventListener("change", async () => {
    if (!els.dateInput.value) return;
    await selectDate(els.dateInput.value);
  });

  els.monthInput.addEventListener("change", async () => {
    state.month = els.monthInput.value;
    await loadShifts();
  });

  els.undoForm.addEventListener("submit", undoSchedule);
  els.closeUndoButton.addEventListener("click", closeUndoDialog);
  els.cancelUndoButton.addEventListener("click", closeUndoDialog);
}

async function reloadAll() {
  await Promise.all([loadShifts(), loadShift(state.date), loadTodayShift()]);
}

async function selectDate(date) {
  state.date = date;
  els.dateInput.value = date;
  window.history.replaceState(null, "", `/shifts/${date}`);
  await loadShift(date);
  renderShiftList();
}

async function loadConfig() {
  try {
    state.config = await api("/api/config");
  } catch (error) {
    setStatus(error.message || "설정 조회에 실패했습니다.", "error");
  }
}

async function loadShifts() {
  try {
    const query = state.month ? `?month=${encodeURIComponent(state.month)}` : "";
    const data = await api(`/api/shifts${query}`);
    state.shifts = data.shifts || [];
    renderShiftList();
  } catch (error) {
    setStatus(error.message || "근무표 목록 조회에 실패했습니다.", "error");
  }
}

async function loadShift(date) {
  try {
    const data = await api(`/api/shifts/${encodeURIComponent(date)}`);
    state.shift = data.shift;
    state.history = sortHistory(data.history || []);
    renderHistory();
  } catch (error) {
    setStatus(error.message || "근무표 조회에 실패했습니다.", "error");
  }
}

async function loadTodayShift() {
  try {
    const data = await api(`/api/shifts/${encodeURIComponent(state.today)}`);
    state.todayShift = data.shift;
    renderTodayShift();
  } catch (error) {
    setStatus(error.message || "오늘의 근무자 조회에 실패했습니다.", "error");
  }
}

async function importXlsx(event) {
  event.preventDefault();
  const file = els.xlsxInput.files?.[0];
  if (!file) {
    setStatus("업로드할 xlsx 파일을 선택해주세요.", "error");
    return;
  }

  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    setStatus("xlsx 파일만 업로드할 수 있습니다.", "error");
    return;
  }

  try {
    const fileBase64 = await fileToBase64(file);
    const payload = {
      fileBase64,
      fileName: file.name,
      changedBy: els.importChangedByInput.value,
      reason: els.importReasonInput.value,
    };

    rememberActor(payload.changedBy);
    const data = await api("/api/shifts/import-xlsx", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    els.xlsxInput.value = "";
    setStatus(`${data.count}건의 근무표를 등록했습니다.`, "success");
    await reloadAll();
  } catch (error) {
    handleApiError(error, "xlsx 등록에 실패했습니다.");
  }
}

async function downloadTemplate() {
  try {
    const data = await api("/api/shifts-template/save-local", { method: "POST" });
    showDownloadHelp(data.filePath);
    setStatus("양식 파일을 생성했습니다. 표시된 파일 경로에서 열어주세요.", "success");
  } catch (error) {
    showDownloadHelp("");
    setStatus(error.message || "양식 파일 생성에 실패했습니다.", "error");
  }
}

async function copyTemplateUrl() {
  const url = new URL("/api/shifts-template.xlsx", window.location.origin).href;
  try {
    await navigator.clipboard.writeText(url);
    setStatus("양식 다운로드 주소를 복사했습니다.", "success");
  } catch {
    showDownloadHelp();
    setStatus(url, "info");
  }
}

async function copyTemplatePath() {
  const path = els.templateLocalPath.textContent.trim();
  if (!path) {
    setStatus("복사할 파일 경로가 없습니다. 먼저 양식 다운로드를 눌러주세요.", "warning");
    return;
  }

  try {
    await navigator.clipboard.writeText(path);
    setStatus("양식 파일 경로를 복사했습니다.", "success");
  } catch {
    setStatus(path, "info");
  }
}

function showDownloadHelp(filePath) {
  const url = new URL("/api/shifts-template.xlsx", window.location.origin).href;
  els.templateDirectLink.href = url;
  els.downloadHelpText.textContent = filePath
    ? "브라우저 다운로드가 막혀도 아래 경로에 양식 파일을 생성했습니다."
    : "자동 다운로드가 보이지 않으면 아래 링크를 열어주세요.";
  els.templateLocalPath.textContent = filePath || "";
  els.templateLocalPath.hidden = !filePath;
  els.downloadHelp.hidden = false;
}

async function openUndoDialog(date) {
  await selectDate(date);
  if (!state.shift) {
    setStatus("되돌릴 근무표가 없습니다.", "warning");
    return;
  }

  els.undoDateText.textContent = `${formatKoreanDate(date)} 근무표를 직전 저장 상태로 되돌립니다.`;
  els.undoChangedByInput.value = els.undoChangedByInput.value || getStoredActor();
  els.undoReasonInput.value = "직전 변경 되돌리기";
  openDialog(els.undoDialog);
}

function closeUndoDialog() {
  els.undoDialog.close();
}

async function undoSchedule(event) {
  event.preventDefault();
  if (!state.shift) return;

  const payload = {
    changedBy: els.undoChangedByInput.value,
    reason: els.undoReasonInput.value,
    revision: state.shift.revision,
  };

  try {
    rememberActor(payload.changedBy);
    const data = await api(`/api/shifts/${encodeURIComponent(state.date)}/undo`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    state.shift = data.shift;
    state.history = sortHistory(data.history || []);
    closeUndoDialog();
    setStatus("직전 변경을 되돌렸습니다.", "success");
    await reloadAll();
  } catch (error) {
    handleApiError(error, "되돌리기에 실패했습니다.");
  }
}

function renderTodayShift() {
  els.todayDateText.textContent = formatKoreanDate(state.today);

  if (!state.todayShift) {
    els.todayShift.innerHTML = `<div class="empty-state compact">오늘 등록된 근무표가 없습니다.</div>`;
    return;
  }

  els.todayShift.innerHTML = `
    <div class="today-grid">
      ${renderWorkerGroup("세무서", state.todayShift.taxOfficeWorkers)}
      ${renderWorkerGroup("구청 신고창구", state.todayShift.districtOfficeWorkers)}
    </div>
    <p class="meta today-meta">최종 수정 ${escapeHtml(formatDateTime(state.todayShift.updatedAt))} · ${escapeHtml(
      state.todayShift.updatedBy
    )}</p>
  `;
}

function renderWorkerGroup(title, workers) {
  return `
    <div class="worker-group">
      <h3>${escapeHtml(title)}</h3>
      <div class="worker-stack">
        ${workers.map((worker) => `<span>${escapeHtml(worker || "비어 있음")}</span>`).join("")}
      </div>
    </div>
  `;
}

function renderShiftList() {
  els.listMeta.textContent = state.month ? `${state.month} 표시 중` : "전체 표시 중";

  if (!state.shifts.length) {
    els.shiftList.innerHTML = `<div class="empty-state">등록된 근무표가 없습니다. 양식을 다운로드해 xlsx 파일로 등록하세요.</div>`;
    return;
  }

  els.shiftList.innerHTML = `
    <div class="table-wrap">
      <table class="shift-table">
        <thead>
          <tr>
            <th>날짜</th>
            <th>세무서</th>
            <th>구청 신고창구</th>
            <th>관리</th>
          </tr>
        </thead>
        <tbody>
          ${state.shifts.map(renderShiftRow).join("")}
        </tbody>
      </table>
    </div>
  `;

  els.shiftList.querySelectorAll("[data-select-date]").forEach((button) => {
    button.addEventListener("click", () => selectDate(button.dataset.selectDate));
  });

  els.shiftList.querySelectorAll("[data-undo-date]").forEach((button) => {
    button.addEventListener("click", () => openUndoDialog(button.dataset.undoDate));
  });
}

function renderShiftRow(shift) {
  const selected = shift.date === state.date ? "is-selected" : "";
  const warnings = shift.warnings?.length
    ? `<p class="row-warning">${shift.warnings.map(escapeHtml).join("<br>")}</p>`
    : "";

  return `
    <tr class="${selected}">
      <td>
        <button class="date-button" type="button" data-select-date="${escapeHtml(shift.date)}">
          ${escapeHtml(formatKoreanDate(shift.date))}
        </button>
        <p class="meta">수정 ${escapeHtml(formatDateTime(shift.updatedAt))}</p>
        ${warnings}
      </td>
      <td>${renderWorkerNames(shift.taxOfficeWorkers)}</td>
      <td>${renderWorkerNames(shift.districtOfficeWorkers)}</td>
      <td>
        <div class="row-actions">
          <button class="danger-ghost-button small" type="button" data-undo-date="${escapeHtml(shift.date)}">되돌리기</button>
        </div>
      </td>
    </tr>
  `;
}

function renderWorkerNames(workers) {
  return `
    <div class="worker-stack">
      ${workers.map((worker) => `<span>${escapeHtml(worker || "비어 있음")}</span>`).join("")}
    </div>
  `;
}

function renderHistory() {
  els.selectedDateText.textContent = formatKoreanDate(state.date);

  if (!state.history.length) {
    els.historyList.innerHTML = `<div class="empty-state compact">선택한 날짜의 변경 이력이 없습니다.</div>`;
    return;
  }

  els.historyList.innerHTML = `
    <div class="history-list">
      ${state.history.map(renderHistoryItem).join("")}
    </div>
  `;
}

function renderHistoryItem(entry) {
  const actionLabel = {
    create: "등록",
    update: "수정",
    replace: "교체",
    swap: "맞바꾸기",
    undo: "되돌리기",
    "xlsx-create": "xlsx 등록",
    "xlsx-update": "xlsx 업데이트",
  }[entry.action] || "변경";

  return `
    <article class="history-item">
      <div class="history-main">
        <strong>${escapeHtml(actionLabel)} · ${escapeHtml(entry.location || "전체")}</strong>
        <span class="history-time">${escapeHtml(formatDateTime(entry.createdAt))}</span>
      </div>
      <div class="history-detail">
        변경자: ${escapeHtml(entry.changedBy || "-")}<br>
        변경 전: ${escapeHtml(formatWorkersForHistory(entry.beforeWorkers))}<br>
        변경 후: ${escapeHtml(formatWorkersForHistory(entry.afterWorkers))}
        ${entry.reason ? `<br>메모: ${escapeHtml(entry.reason)}` : ""}
      </div>
    </article>
  `;
}

function shareToKakao() {
  try {
    const shareUrl = `${getShareBaseUrl()}/shifts/${state.date}`;
    const text = buildShareText(shareUrl);

    if (!state.config.kakaoJsKey) {
      copyShareFallback(`${text}\n${shareUrl}`);
      return;
    }

    initKakao();
    if (!window.Kakao || !Kakao.isInitialized()) {
      copyShareFallback(`${text}\n${shareUrl}`);
      return;
    }

    Kakao.Share.sendDefault({
      objectType: "text",
      text,
      link: {
        mobileWebUrl: shareUrl,
        webUrl: shareUrl,
      },
      buttonTitle: "근무표 열기",
    });
  } catch (error) {
    setStatus(`카카오톡 공유에 실패했습니다. ${error.message || ""}`.trim(), "error");
  }
}

async function copyShareFallback(text) {
  if (navigator.share) {
    try {
      await navigator.share({ title: "근무표 안내", text });
      return;
    } catch (error) {
      if (error.name === "AbortError") return;
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    setStatus("카카오 앱 키가 없어 공유 내용을 복사했습니다. 카카오톡에 붙여넣어 보내주세요.", "warning");
  } catch {
    setStatus("카카오 앱 키가 없어 공식 카카오톡 공유를 사용할 수 없습니다.", "warning");
  }
}

function initKakao() {
  if (!state.config.kakaoJsKey) return;
  if (!window.Kakao) {
    setStatus("카카오 SDK를 불러오지 못했습니다.", "error");
    return;
  }
  if (!Kakao.isInitialized()) {
    Kakao.init(state.config.kakaoJsKey);
  }
}

function buildShareText() {
  const formatted = formatKoreanDate(state.date);
  const shift = state.shift || getShiftFromList(state.date);

  if (!shift) {
    return `[근무표 안내]\n${formatted}\n\n해당 날짜에 등록된 근무표가 없습니다.\n\n근무 변경/확인:\n앱 링크`;
  }

  return [
    "[근무표 안내]",
    formatted,
    "",
    `세무서: ${formatWorkerLine(shift.taxOfficeWorkers)}`,
    `구청 신고창구: ${formatWorkerLine(shift.districtOfficeWorkers)}`,
    "",
    "근무 변경/확인:",
    "앱 링크",
  ].join("\n");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "요청 처리에 실패했습니다.");
    error.status = response.status;
    error.details = data.details;
    throw error;
  }
  return data;
}

function handleApiError(error, fallback) {
  const message = error.message || fallback;
  setStatus(message, error.status === 409 ? "warning" : "error");
  if (error.status === 409) {
    reloadAll();
  }
}

function setStatus(message, type = "info") {
  if (!message) {
    els.statusArea.textContent = "";
    return;
  }
  els.statusArea.innerHTML = `<div class="status-message ${type}">${escapeHtml(message)}</div>`;
}

function openDialog(dialog) {
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "open");
  }
}

function rememberActor(value) {
  const actor = value.trim();
  if (!actor) return;
  localStorage.setItem("shiftScheduleActor", actor);
  els.importChangedByInput.value = actor;
  els.undoChangedByInput.value = actor;
}

function restoreActorNames() {
  const actor = getStoredActor();
  els.importChangedByInput.value = actor;
  els.undoChangedByInput.value = actor;
}

function getStoredActor() {
  return localStorage.getItem("shiftScheduleActor") || "";
}

function getShiftFromList(date) {
  return state.shifts.find((shift) => shift.date === date) || null;
}

function formatWorkerLine(workers) {
  const names = workers.filter(Boolean);
  return names.length ? names.join(", ") : "비어 있음";
}

function formatWorkersForHistory(value) {
  if (!value) return "없음";
  if (Array.isArray(value)) return value.map((item) => item || "비어 있음").join(", ");
  if (typeof value === "object") {
    const tax = value.taxOfficeWorkers ? `세무서 ${formatWorkerLine(value.taxOfficeWorkers)}` : "";
    const district = value.districtOfficeWorkers ? `구청 신고창구 ${formatWorkerLine(value.districtOfficeWorkers)}` : "";
    return [tax, district].filter(Boolean).join(" / ");
  }
  return String(value);
}

function sortHistory(history) {
  return [...history].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function getShareBaseUrl() {
  return (state.config.appBaseUrl || window.location.origin).replace(/\/+$/, "");
}

function fileToBase64(file) {
  return file.arrayBuffer().then((buffer) => arrayBufferToBase64(buffer));
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function formatKoreanDate(date) {
  const [year, month, day] = date.split("-").map(Number);
  return `${year}년 ${month}월 ${day}일`;
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getInitialDate() {
  const pathMatch = window.location.pathname.match(/^\/shifts\/(\d{4}-\d{2}-\d{2})$/);
  const params = new URLSearchParams(window.location.search);
  return pathMatch?.[1] || params.get("date") || todayString();
}

function todayString() {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
