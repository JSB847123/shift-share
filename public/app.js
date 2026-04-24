const state = {
  date: getInitialDate(),
  month: "",
  shifts: [],
  shift: null,
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
  dateInput: document.querySelector("#dateInput"),
  monthInput: document.querySelector("#monthInput"),
  clearMonthButton: document.querySelector("#clearMonthButton"),
  openEditButton: document.querySelector("#openEditButton"),
  listMeta: document.querySelector("#listMeta"),
  shiftList: document.querySelector("#shiftList"),
  selectedDateText: document.querySelector("#selectedDateText"),
  historyList: document.querySelector("#historyList"),
  editDialog: document.querySelector("#editDialog"),
  editForm: document.querySelector("#editForm"),
  editTitle: document.querySelector("#editTitle"),
  taxWorker1: document.querySelector("#taxWorker1"),
  taxWorker2: document.querySelector("#taxWorker2"),
  districtWorker1: document.querySelector("#districtWorker1"),
  districtWorker2: document.querySelector("#districtWorker2"),
  changedByInput: document.querySelector("#changedByInput"),
  editPinInput: document.querySelector("#editPinInput"),
  reasonInput: document.querySelector("#reasonInput"),
  saveButton: document.querySelector("#saveButton"),
  closeEditButton: document.querySelector("#closeEditButton"),
  cancelEditButton: document.querySelector("#cancelEditButton"),
  undoDialog: document.querySelector("#undoDialog"),
  undoForm: document.querySelector("#undoForm"),
  undoDateText: document.querySelector("#undoDateText"),
  undoChangedByInput: document.querySelector("#undoChangedByInput"),
  undoEditPinInput: document.querySelector("#undoEditPinInput"),
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
  els.openEditButton.addEventListener("click", () => openEditDialog(state.date));
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

  els.editForm.addEventListener("submit", saveSchedule);
  els.closeEditButton.addEventListener("click", closeEditDialog);
  els.cancelEditButton.addEventListener("click", closeEditDialog);

  els.undoForm.addEventListener("submit", undoSchedule);
  els.closeUndoButton.addEventListener("click", closeUndoDialog);
  els.cancelUndoButton.addEventListener("click", closeUndoDialog);
}

async function reloadAll() {
  await Promise.all([loadShifts(), loadShift(state.date)]);
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

function openEditDialog(date) {
  state.date = date;
  els.dateInput.value = date;
  const shift = getShiftFromList(date) || (state.shift?.date === date ? state.shift : null);
  state.shift = shift;

  els.editTitle.textContent = `${formatKoreanDate(date)} 근무자 변경`;
  els.saveButton.textContent = shift ? "저장" : "등록";
  els.taxWorker1.value = shift?.taxOfficeWorkers?.[0] || "";
  els.taxWorker2.value = shift?.taxOfficeWorkers?.[1] || "";
  els.districtWorker1.value = shift?.districtOfficeWorkers?.[0] || "";
  els.districtWorker2.value = shift?.districtOfficeWorkers?.[1] || "";
  els.reasonInput.value = "";
  els.changedByInput.value = els.changedByInput.value || getStoredActor();

  openDialog(els.editDialog);
}

function closeEditDialog() {
  els.editDialog.close();
}

async function saveSchedule(event) {
  event.preventDefault();
  const payload = {
    taxOfficeWorkers: [els.taxWorker1.value, els.taxWorker2.value],
    districtOfficeWorkers: [els.districtWorker1.value, els.districtWorker2.value],
    changedBy: els.changedByInput.value,
    editPin: els.editPinInput.value,
    reason: els.reasonInput.value,
    revision: state.shift ? state.shift.revision : undefined,
  };

  const localError = validateWorkerPayload(payload.taxOfficeWorkers, payload.districtOfficeWorkers);
  if (localError) {
    setStatus(localError, "error");
    return;
  }

  try {
    rememberActor(payload.changedBy);
    const data = await api(`/api/shifts/${encodeURIComponent(state.date)}`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    state.shift = data.shift;
    state.history = sortHistory(data.history || []);
    closeEditDialog();
    setStatus("근무표를 저장했습니다.", "success");
    await loadShifts();
    renderHistory();
  } catch (error) {
    handleApiError(error, "근무표 저장에 실패했습니다.");
  }
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
    editPin: els.undoEditPinInput.value,
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
    await loadShifts();
    renderHistory();
  } catch (error) {
    handleApiError(error, "되돌리기에 실패했습니다.");
  }
}

function renderShiftList() {
  els.listMeta.textContent = state.month ? `${state.month} 표시 중` : "전체 표시 중";

  if (!state.shifts.length) {
    els.shiftList.innerHTML = `<div class="empty-state">등록된 근무표가 없습니다. 날짜를 선택하고 근무자 변경을 눌러 등록하세요.</div>`;
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

  els.shiftList.querySelectorAll("[data-edit-date]").forEach((button) => {
    button.addEventListener("click", async () => {
      await selectDate(button.dataset.editDate);
      openEditDialog(button.dataset.editDate);
    });
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
          <button class="secondary-button small" type="button" data-edit-date="${escapeHtml(shift.date)}">근무자 변경</button>
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

function validateWorkerPayload(taxOfficeWorkers, districtOfficeWorkers) {
  if (taxOfficeWorkers.length !== 2 || districtOfficeWorkers.length !== 2) {
    return "근무지는 각각 2칸이어야 합니다.";
  }

  const seen = new Map();
  for (const name of [...taxOfficeWorkers, ...districtOfficeWorkers].map((value) => value.trim()).filter(Boolean)) {
    const key = name.toLocaleLowerCase("ko-KR");
    if (seen.has(key)) {
      return `같은 사람이 중복 배정되어 있습니다: ${name}`;
    }
    seen.set(key, name);
  }

  return "";
}

function shareToKakao() {
  try {
    if (!state.config.kakaoJsKey) {
      setStatus("카카오 JavaScript 키가 설정되지 않았습니다.", "error");
      return;
    }

    initKakao();
    if (!window.Kakao || !Kakao.isInitialized()) {
      setStatus("카카오 SDK가 초기화되지 않았습니다.", "error");
      return;
    }

    const shareUrl = `${getShareBaseUrl()}/shifts/${state.date}`;
    const text = buildShareText();

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
  els.changedByInput.value = actor;
  els.undoChangedByInput.value = actor;
}

function restoreActorNames() {
  const actor = getStoredActor();
  els.changedByInput.value = actor;
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
