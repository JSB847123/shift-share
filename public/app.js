const LOCATION_LABELS = {
  tax: "세무서",
  district: "구청 신고창구",
};

const LOCATION_FIELDS = {
  tax: "taxOfficeWorkers",
  district: "districtOfficeWorkers",
};

const state = {
  date: getInitialDate(),
  month: "",
  shift: null,
  history: [],
  monthShifts: new Map(),
  config: {
    kakaoJsKey: "",
    appBaseUrl: "",
  },
};

const els = {
  statusArea: document.querySelector("#statusArea"),
  refreshButton: document.querySelector("#refreshButton"),
  todayButton: document.querySelector("#todayButton"),
  dateInput: document.querySelector("#dateInput"),
  monthInput: document.querySelector("#monthInput"),
  calendarGrid: document.querySelector("#calendarGrid"),
  detailTitle: document.querySelector("#detailTitle"),
  shiftDetail: document.querySelector("#shiftDetail"),
  kakaoShareButton: document.querySelector("#kakaoShareButton"),
  formTitle: document.querySelector("#formTitle"),
  shiftForm: document.querySelector("#shiftForm"),
  taxWorker1: document.querySelector("#taxWorker1"),
  taxWorker2: document.querySelector("#taxWorker2"),
  districtWorker1: document.querySelector("#districtWorker1"),
  districtWorker2: document.querySelector("#districtWorker2"),
  changedByInput: document.querySelector("#changedByInput"),
  editPinInput: document.querySelector("#editPinInput"),
  reasonInput: document.querySelector("#reasonInput"),
  saveButton: document.querySelector("#saveButton"),
  openReplaceButton: document.querySelector("#openReplaceButton"),
  swapForm: document.querySelector("#swapForm"),
  swapASelect: document.querySelector("#swapASelect"),
  swapBSelect: document.querySelector("#swapBSelect"),
  swapChangedByInput: document.querySelector("#swapChangedByInput"),
  swapEditPinInput: document.querySelector("#swapEditPinInput"),
  swapReasonInput: document.querySelector("#swapReasonInput"),
  historyList: document.querySelector("#historyList"),
  replaceDialog: document.querySelector("#replaceDialog"),
  replaceForm: document.querySelector("#replaceForm"),
  replacePositionSelect: document.querySelector("#replacePositionSelect"),
  replaceWorkerInput: document.querySelector("#replaceWorkerInput"),
  replaceChangedByInput: document.querySelector("#replaceChangedByInput"),
  replaceEditPinInput: document.querySelector("#replaceEditPinInput"),
  replaceReasonInput: document.querySelector("#replaceReasonInput"),
  closeReplaceButton: document.querySelector("#closeReplaceButton"),
  cancelReplaceButton: document.querySelector("#cancelReplaceButton"),
};

init();

async function init() {
  state.month = state.date.slice(0, 7);
  els.dateInput.value = state.date;
  els.monthInput.value = state.month;
  restoreActorNames();
  bindEvents();

  await Promise.all([loadConfig(), loadMonthShifts(), loadShift()]);
  initKakao();
}

function bindEvents() {
  els.refreshButton.addEventListener("click", () => reloadAll());
  els.todayButton.addEventListener("click", () => setDate(todayString()));

  els.dateInput.addEventListener("change", () => {
    if (els.dateInput.value) {
      setDate(els.dateInput.value);
    }
  });

  els.monthInput.addEventListener("change", async () => {
    if (!els.monthInput.value) return;
    state.month = els.monthInput.value;
    await loadMonthShifts();
  });

  els.shiftForm.addEventListener("submit", saveSchedule);
  els.openReplaceButton.addEventListener("click", openReplaceDialog);
  els.replaceForm.addEventListener("submit", submitReplace);
  els.closeReplaceButton.addEventListener("click", closeReplaceDialog);
  els.cancelReplaceButton.addEventListener("click", closeReplaceDialog);
  els.swapForm.addEventListener("submit", submitSwap);
  els.kakaoShareButton.addEventListener("click", shareToKakao);
}

async function reloadAll() {
  await Promise.all([loadMonthShifts(), loadShift()]);
}

async function setDate(date) {
  state.date = date;
  state.month = date.slice(0, 7);
  els.dateInput.value = date;
  els.monthInput.value = state.month;
  window.history.replaceState(null, "", `/shifts/${date}`);
  await reloadAll();
}

async function loadConfig() {
  try {
    state.config = await api("/api/config");
  } catch (error) {
    setStatus(error.message || "설정 조회에 실패했습니다.", "error");
  }
}

async function loadMonthShifts() {
  try {
    const data = await api(`/api/shifts?month=${encodeURIComponent(state.month)}`);
    state.monthShifts = new Map((data.shifts || []).map((shift) => [shift.date, shift]));
    renderCalendar();
  } catch (error) {
    setStatus(error.message || "근무표 목록 조회에 실패했습니다.", "error");
  }
}

async function loadShift() {
  try {
    const data = await api(`/api/shifts/${encodeURIComponent(state.date)}`);
    state.shift = data.shift;
    state.history = data.history || [];
    renderShift();
    renderForm();
    renderPositionControls();
    renderHistory();
  } catch (error) {
    setStatus(error.message || "근무표 조회에 실패했습니다.", "error");
  }
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
    els.reasonInput.value = "";
    setStatus("근무표를 저장했습니다.", "success");
    await loadMonthShifts();
    renderShift();
    renderForm();
    renderPositionControls();
    renderHistory();
  } catch (error) {
    handleApiError(error, "근무표 저장에 실패했습니다.");
  }
}

function openReplaceDialog() {
  if (!state.shift) {
    setStatus("해당 날짜에 등록된 근무표가 없습니다.", "warning");
    return;
  }

  renderPositionControls();
  els.replaceWorkerInput.value = "";
  els.replaceReasonInput.value = "";
  els.replaceChangedByInput.value = els.changedByInput.value || getStoredActor();
  if (typeof els.replaceDialog.showModal === "function") {
    els.replaceDialog.showModal();
  } else {
    els.replaceDialog.setAttribute("open", "open");
  }
}

function closeReplaceDialog() {
  els.replaceDialog.close();
}

async function submitReplace(event) {
  event.preventDefault();
  if (!state.shift) return;

  const payload = {
    position: parsePositionValue(els.replacePositionSelect.value),
    newWorker: els.replaceWorkerInput.value,
    changedBy: els.replaceChangedByInput.value,
    editPin: els.replaceEditPinInput.value,
    reason: els.replaceReasonInput.value,
    revision: state.shift.revision,
  };

  if (!payload.newWorker.trim()) {
    setStatus("변경할 근무자 이름을 입력해주세요.", "error");
    return;
  }

  try {
    rememberActor(payload.changedBy);
    const data = await api(`/api/shifts/${encodeURIComponent(state.date)}/replace`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    state.shift = data.shift;
    state.history = sortHistory(data.history || []);
    closeReplaceDialog();
    setStatus("근무자를 교체했습니다.", "success");
    await loadMonthShifts();
    renderShift();
    renderForm();
    renderPositionControls();
    renderHistory();
  } catch (error) {
    handleApiError(error, "근무자 교체에 실패했습니다.");
  }
}

async function submitSwap(event) {
  event.preventDefault();
  if (!state.shift) {
    setStatus("해당 날짜에 등록된 근무표가 없습니다.", "warning");
    return;
  }

  const payload = {
    a: parsePositionValue(els.swapASelect.value),
    b: parsePositionValue(els.swapBSelect.value),
    changedBy: els.swapChangedByInput.value,
    editPin: els.swapEditPinInput.value,
    reason: els.swapReasonInput.value,
    revision: state.shift.revision,
  };

  if (els.swapASelect.value === els.swapBSelect.value) {
    setStatus("서로 다른 근무자 두 명을 선택해주세요.", "error");
    return;
  }

  try {
    rememberActor(payload.changedBy);
    const data = await api(`/api/shifts/${encodeURIComponent(state.date)}/swap`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    state.shift = data.shift;
    state.history = sortHistory(data.history || []);
    els.swapReasonInput.value = "";
    setStatus("근무자를 맞바꿨습니다.", "success");
    await loadMonthShifts();
    renderShift();
    renderForm();
    renderPositionControls();
    renderHistory();
  } catch (error) {
    handleApiError(error, "근무자 맞바꾸기에 실패했습니다.");
  }
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
    const text = buildShareText(shareUrl);

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
  if (!state.config.kakaoJsKey) {
    return;
  }

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

  if (!state.shift) {
    return `[근무표 안내]\n${formatted}\n\n해당 날짜에 등록된 근무표가 없습니다.\n\n근무 변경/확인:\n앱 링크`;
  }

  return [
    "[근무표 안내]",
    formatted,
    "",
    `세무서: ${state.shift.taxOfficeWorkers.join(", ")}`,
    `구청 신고창구: ${state.shift.districtOfficeWorkers.join(", ")}`,
    "",
    "근무 변경/확인:",
    "앱 링크",
  ].join("\n");
}

function renderCalendar() {
  els.calendarGrid.textContent = "";
  const [year, month] = state.month.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0).getDate();

  for (let index = 0; index < first.getDay(); index += 1) {
    const empty = document.createElement("div");
    empty.className = "calendar-day empty-cell";
    els.calendarGrid.append(empty);
  }

  for (let day = 1; day <= lastDay; day += 1) {
    const date = `${state.month}-${String(day).padStart(2, "0")}`;
    const shift = state.monthShifts.get(date);
    const button = document.createElement("button");
    button.type = "button";
    button.className = [
      "calendar-day",
      date === state.date ? "is-selected" : "",
      shift ? "has-shift" : "",
    ]
      .filter(Boolean)
      .join(" ");
    button.innerHTML = `
      <span class="day-number">${day}</span>
      <span class="day-summary">${shift ? escapeHtml(getCompactWorkers(shift)) : "미등록"}</span>
    `;
    button.addEventListener("click", () => setDate(date));
    els.calendarGrid.append(button);
  }
}

function renderShift() {
  els.detailTitle.textContent = "근무표";

  if (!state.shift) {
    els.shiftDetail.innerHTML = `
      <div class="schedule-title">
        <h3>${escapeHtml(formatKoreanDate(state.date))} 근무표</h3>
      </div>
      <div class="empty-state">해당 날짜에 등록된 근무표가 없습니다.</div>
    `;
    return;
  }

  const warnings = state.shift.warnings || [];
  const warningHtml = warnings.length
    ? `<div class="warning-box">${warnings.map(escapeHtml).join("<br>")}</div>`
    : "";

  els.shiftDetail.innerHTML = `
    <div class="schedule-title">
      <h3>${escapeHtml(formatKoreanDate(state.shift.date))} 근무표</h3>
      <p class="meta">최종 수정: ${escapeHtml(formatDateTime(state.shift.updatedAt))} · ${escapeHtml(
        state.shift.updatedBy
      )} · revision ${state.shift.revision}</p>
    </div>
    <div class="worker-groups">
      ${renderWorkerGroup("세무서", state.shift.taxOfficeWorkers)}
      ${renderWorkerGroup("구청 신고창구", state.shift.districtOfficeWorkers)}
    </div>
    ${warningHtml}
  `;
}

function renderWorkerGroup(title, workers) {
  return `
    <div class="worker-group">
      <h4>${escapeHtml(title)}</h4>
      <ul class="worker-list">
        ${workers.map((worker) => `<li>${escapeHtml(worker)}</li>`).join("")}
      </ul>
    </div>
  `;
}

function renderForm() {
  els.formTitle.textContent = state.shift ? "근무표 수정" : "근무표 등록";
  els.saveButton.textContent = state.shift ? "수정 저장" : "최초 등록";

  els.taxWorker1.value = state.shift?.taxOfficeWorkers?.[0] || "";
  els.taxWorker2.value = state.shift?.taxOfficeWorkers?.[1] || "";
  els.districtWorker1.value = state.shift?.districtOfficeWorkers?.[0] || "";
  els.districtWorker2.value = state.shift?.districtOfficeWorkers?.[1] || "";

  const actor = getStoredActor();
  if (!els.changedByInput.value) els.changedByInput.value = actor;
  if (!els.swapChangedByInput.value) els.swapChangedByInput.value = actor;
  if (!els.replaceChangedByInput.value) els.replaceChangedByInput.value = actor;
}

function renderPositionControls() {
  const options = getPositionOptions();
  fillSelect(els.replacePositionSelect, options);
  fillSelect(els.swapASelect, options);
  fillSelect(els.swapBSelect, options);

  if (options.length > 1) {
    els.swapBSelect.selectedIndex = 1;
  }

  const disabled = !state.shift;
  els.openReplaceButton.disabled = disabled;
  els.swapASelect.disabled = disabled;
  els.swapBSelect.disabled = disabled;
}

function renderHistory() {
  if (!state.history.length) {
    els.historyList.innerHTML = `<div class="empty-state">변경 이력이 없습니다.</div>`;
    return;
  }

  els.historyList.innerHTML = `
    <div class="history-list">
      ${sortHistory(state.history).map(renderHistoryItem).join("")}
    </div>
  `;
}

function renderHistoryItem(entry) {
  const actionLabel = {
    create: "등록",
    update: "수정",
    replace: "교체",
    swap: "맞바꾸기",
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

function getPositionOptions() {
  if (!state.shift) return [];

  return [
    makePositionOption("tax", 0),
    makePositionOption("tax", 1),
    makePositionOption("district", 0),
    makePositionOption("district", 1),
  ];
}

function makePositionOption(location, index) {
  const field = LOCATION_FIELDS[location];
  const worker = state.shift[field][index];
  return {
    value: `${location}:${index}`,
    label: `${LOCATION_LABELS[location]} ${index + 1} - ${worker}`,
  };
}

function fillSelect(select, options) {
  select.textContent = "";
  if (!options.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "미등록";
    select.append(option);
    return;
  }

  for (const item of options) {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    select.append(option);
  }
}

function validateWorkerPayload(taxOfficeWorkers, districtOfficeWorkers) {
  const allNames = [...taxOfficeWorkers, ...districtOfficeWorkers].map((name) => name.trim());
  if (taxOfficeWorkers.length !== 2 || districtOfficeWorkers.length !== 2) {
    return "근무지는 각각 정확히 2명이어야 합니다.";
  }

  if (allNames.some((name) => !name)) {
    return "빈 근무자 이름은 저장할 수 없습니다.";
  }

  const seen = new Map();
  for (const name of allNames) {
    const key = name.toLocaleLowerCase("ko-KR");
    if (seen.has(key)) {
      return `같은 사람이 중복 배정되어 있습니다: ${name}`;
    }
    seen.set(key, name);
  }

  return "";
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
    loadShift();
  }
}

function setStatus(message, type = "info") {
  if (!message) {
    els.statusArea.textContent = "";
    return;
  }

  els.statusArea.innerHTML = `<div class="status-message ${type}">${escapeHtml(message)}</div>`;
}

function rememberActor(value) {
  const actor = value.trim();
  if (!actor) return;
  localStorage.setItem("shiftScheduleActor", actor);
  els.changedByInput.value = actor;
  els.swapChangedByInput.value = actor;
  els.replaceChangedByInput.value = actor;
}

function restoreActorNames() {
  const actor = getStoredActor();
  els.changedByInput.value = actor;
  els.swapChangedByInput.value = actor;
  els.replaceChangedByInput.value = actor;
}

function getStoredActor() {
  return localStorage.getItem("shiftScheduleActor") || "";
}

function getCompactWorkers(shift) {
  return `${shift.taxOfficeWorkers.join(", ")} / ${shift.districtOfficeWorkers.join(", ")}`;
}

function formatWorkersForHistory(value) {
  if (!value) return "없음";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") {
    const tax = value.taxOfficeWorkers ? `세무서 ${value.taxOfficeWorkers.join(", ")}` : "";
    const district = value.districtOfficeWorkers ? `구청 신고창구 ${value.districtOfficeWorkers.join(", ")}` : "";
    return [tax, district].filter(Boolean).join(" / ");
  }
  return String(value);
}

function parsePositionValue(value) {
  const [location, rawIndex] = value.split(":");
  return {
    location,
    index: Number(rawIndex),
  };
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
