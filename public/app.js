const INITIAL_TODAY = todayString();
const INITIAL_RANGE_END = formatDateValue(addDays(parseLocalDate(INITIAL_TODAY), 3));

const state = {
  date: getInitialDate(),
  today: INITIAL_TODAY,
  theme: getInitialTheme(),
  rangeStart: INITIAL_TODAY,
  rangeEnd: INITIAL_RANGE_END,
  rangeCalendarTarget: "start",
  rangeCalendarMonth: "2026-05",
  allShifts: [],
  shifts: [],
  shift: null,
  todayShift: null,
  calendarShifts: [],
  history: [],
  config: {
    kakaoJsKey: "",
    appBaseUrl: "",
  },
};

const periodRange = getPeriodRange(state.today);
const RANGE_CALENDAR_DEFAULT_MONTH = "2026-05";
const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

const els = {
  statusArea: document.querySelector("#statusArea"),
  themeToggleButton: document.querySelector("#themeToggleButton"),
  refreshButton: document.querySelector("#refreshButton"),
  kakaoShareButton: document.querySelector("#kakaoShareButton"),
  todayDateText: document.querySelector("#todayDateText"),
  todayShift: document.querySelector("#todayShift"),
  templateDownloadButton: document.querySelector("#templateDownloadButton"),
  importForm: document.querySelector("#importForm"),
  importChangedByInput: document.querySelector("#importChangedByInput"),
  importReasonInput: document.querySelector("#importReasonInput"),
  xlsxInput: document.querySelector("#xlsxInput"),
  rangeFilterForm: document.querySelector("#rangeFilterForm"),
  rangeStartInput: document.querySelector("#rangeStartInput"),
  rangeEndInput: document.querySelector("#rangeEndInput"),
  rangeStartCalendarButton: document.querySelector("#rangeStartCalendarButton"),
  rangeEndCalendarButton: document.querySelector("#rangeEndCalendarButton"),
  clearRangeButton: document.querySelector("#clearRangeButton"),
  rangeCalendarPopover: document.querySelector("#rangeCalendarPopover"),
  rangeCalendarMonthLabel: document.querySelector("#rangeCalendarMonthLabel"),
  rangeCalendarGrid: document.querySelector("#rangeCalendarGrid"),
  prevRangeMonthButton: document.querySelector("#prevRangeMonthButton"),
  nextRangeMonthButton: document.querySelector("#nextRangeMonthButton"),
  listMeta: document.querySelector("#listMeta"),
  shiftList: document.querySelector("#shiftList"),
  selectedDateText: document.querySelector("#selectedDateText"),
  undoSelectedButton: document.querySelector("#undoSelectedButton"),
  historyList: document.querySelector("#historyList"),
  periodCalendar: document.querySelector("#periodCalendar"),
  editDialog: document.querySelector("#editDialog"),
  editForm: document.querySelector("#editForm"),
  editTitle: document.querySelector("#editTitle"),
  closeEditButton: document.querySelector("#closeEditButton"),
  cancelEditButton: document.querySelector("#cancelEditButton"),
  saveButton: document.querySelector("#saveButton"),
  taxWorker1: document.querySelector("#taxWorker1"),
  taxWorker2: document.querySelector("#taxWorker2"),
  districtWorker1: document.querySelector("#districtWorker1"),
  districtWorker2: document.querySelector("#districtWorker2"),
  changedByInput: document.querySelector("#changedByInput"),
  reasonInput: document.querySelector("#reasonInput"),
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
  applyTheme(state.theme);
  restoreActorNames();
  bindEvents();

  els.rangeStartInput.value = state.rangeStart;
  els.rangeEndInput.value = state.rangeEnd;

  await Promise.all([loadConfig(), reloadAll()]);
  initKakao();
}

function bindEvents() {
  els.themeToggleButton.addEventListener("click", toggleTheme);
  els.refreshButton.addEventListener("click", reloadAll);
  els.kakaoShareButton.addEventListener("click", shareToKakao);
  els.templateDownloadButton.addEventListener("click", downloadTemplate);
  els.importForm.addEventListener("submit", importXlsx);
  els.rangeFilterForm.addEventListener("submit", applyRangeFilter);
  els.clearRangeButton.addEventListener("click", clearRangeFilter);
  els.rangeStartCalendarButton.addEventListener("click", (event) => openRangeCalendar("start", event));
  els.rangeEndCalendarButton.addEventListener("click", (event) => openRangeCalendar("end", event));
  els.prevRangeMonthButton.addEventListener("click", () => moveRangeCalendarMonth(-1));
  els.nextRangeMonthButton.addEventListener("click", () => moveRangeCalendarMonth(1));
  document.addEventListener("click", closeRangeCalendarOnOutsideClick);
  document.addEventListener("keydown", closeRangeCalendarOnEscape);

  els.editForm.addEventListener("submit", saveSchedule);
  els.closeEditButton.addEventListener("click", closeEditDialog);
  els.cancelEditButton.addEventListener("click", closeEditDialog);
  els.undoSelectedButton.addEventListener("click", () => openUndoDialog(state.date));
  els.undoForm.addEventListener("submit", undoSchedule);
  els.closeUndoButton.addEventListener("click", closeUndoDialog);
  els.cancelUndoButton.addEventListener("click", closeUndoDialog);
}

async function reloadAll() {
  await Promise.all([loadShifts(), loadShift(state.date), loadTodayShift(), loadPeriodCalendar()]);
}

async function selectDate(date) {
  state.date = date;
  window.history.replaceState(null, "", `/shifts/${date}`);
  await loadShift(date);
  renderShiftList();
  renderPeriodCalendar();
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
    const data = await api("/api/shifts");
    state.allShifts = data.shifts || [];
    applyShiftFilters();
  } catch (error) {
    setStatus(error.message || "근무표 목록 조회에 실패했습니다.", "error");
  }
}

function applyRangeFilter(event) {
  event.preventDefault();

  const start = normalizeDateInput(els.rangeStartInput.value);
  const end = normalizeDateInput(els.rangeEndInput.value);

  if (els.rangeStartInput.value.trim() && !start) {
    setStatus("시작일은 YYYY-MM-DD 형식으로 입력해주세요.", "error");
    return;
  }

  if (els.rangeEndInput.value.trim() && !end) {
    setStatus("종료일은 YYYY-MM-DD 형식으로 입력해주세요.", "error");
    return;
  }

  if (start && end && start > end) {
    setStatus("시작일은 종료일보다 늦을 수 없습니다.", "error");
    return;
  }

  state.rangeStart = start;
  state.rangeEnd = end;
  els.rangeStartInput.value = start;
  els.rangeEndInput.value = end;
  applyShiftFilters();
  setStatus(getRangeStatusMessage(), "success");
}

function clearRangeFilter() {
  state.rangeStart = "";
  state.rangeEnd = "";
  els.rangeStartInput.value = "";
  els.rangeEndInput.value = "";
  closeRangeCalendar();
  applyShiftFilters();
  setStatus("전체 날짜별 근무자를 표시합니다.", "info");
}

function applyShiftFilters() {
  state.shifts = state.allShifts.filter((shift) => {
    if (state.rangeStart && shift.date < state.rangeStart) return false;
    if (state.rangeEnd && shift.date > state.rangeEnd) return false;
    return true;
  });
  renderShiftList();
}

function openRangeCalendar(target, event) {
  event.stopPropagation();
  state.rangeCalendarTarget = target;

  const inputDate = normalizeDateInput(getRangeInput(target).value);
  state.rangeCalendarMonth = inputDate ? inputDate.slice(0, 7) : RANGE_CALENDAR_DEFAULT_MONTH;
  renderRangeCalendar();
  els.rangeCalendarPopover.hidden = false;
}

function closeRangeCalendar() {
  els.rangeCalendarPopover.hidden = true;
}

function closeRangeCalendarOnOutsideClick(event) {
  if (els.rangeCalendarPopover.hidden) return;
  if (els.rangeCalendarPopover.contains(event.target)) return;
  if (els.rangeStartCalendarButton.contains(event.target)) return;
  if (els.rangeEndCalendarButton.contains(event.target)) return;
  closeRangeCalendar();
}

function closeRangeCalendarOnEscape(event) {
  if (event.key === "Escape") {
    closeRangeCalendar();
  }
}

function moveRangeCalendarMonth(offset) {
  const [year, month] = state.rangeCalendarMonth.split("-").map(Number);
  const next = new Date(year, month - 1 + offset, 1);
  state.rangeCalendarMonth = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
  renderRangeCalendar();
}

function renderRangeCalendar() {
  const [year, month] = state.rangeCalendarMonth.split("-").map(Number);
  const monthStart = formatDateValue(new Date(year, month - 1, 1));
  const monthEnd = formatDateValue(new Date(year, month, 0));
  const leadingBlankCount = parseLocalDate(monthStart).getDay();
  const dates = enumerateDates(monthStart, monthEnd);
  const selectedDate = normalizeDateInput(getRangeInput(state.rangeCalendarTarget).value);

  els.rangeCalendarMonthLabel.textContent = `${year}년 ${month}월`;
  els.rangeCalendarGrid.innerHTML = `
    ${WEEKDAY_LABELS.map((label) => `<div class="range-calendar-weekday">${escapeHtml(label)}</div>`).join("")}
    ${Array.from({ length: leadingBlankCount }, () => `<div class="range-calendar-blank" aria-hidden="true"></div>`).join("")}
    ${dates.map((date) => renderRangeCalendarDay(date, selectedDate)).join("")}
  `;

  els.rangeCalendarGrid.querySelectorAll("[data-range-calendar-date]").forEach((button) => {
    button.addEventListener("click", () => selectRangeCalendarDate(button.dataset.rangeCalendarDate));
  });
}

function renderRangeCalendarDay(date, selectedDate) {
  const [, , day] = date.split("-").map(Number);
  const selectedClass = date === selectedDate ? " is-selected" : "";

  return `
    <button class="range-calendar-day${selectedClass}" type="button" data-range-calendar-date="${escapeHtml(date)}">
      ${day}
    </button>
  `;
}

function selectRangeCalendarDate(date) {
  const input = getRangeInput(state.rangeCalendarTarget);
  input.value = date;
  input.focus();
  closeRangeCalendar();
}

function getRangeInput(target) {
  return target === "end" ? els.rangeEndInput : els.rangeStartInput;
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

async function loadPeriodCalendar() {
  try {
    const months = [...new Set([periodRange.start.slice(0, 7), periodRange.end.slice(0, 7)])];
    const responses = await Promise.all(
      months.map((month) => api(`/api/shifts?month=${encodeURIComponent(month)}`))
    );
    const byDate = new Map();
    responses
      .flatMap((data) => data.shifts || [])
      .filter((shift) => shift.date >= periodRange.start && shift.date <= periodRange.end)
      .forEach((shift) => byDate.set(shift.date, shift));

    state.calendarShifts = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    renderPeriodCalendar();
  } catch (error) {
    setStatus(error.message || "근무 달력 조회에 실패했습니다.", "error");
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
    const url = new URL("/api/shifts-template.xlsx", window.location.origin).href;
    const link = document.createElement("a");
    link.href = url;
    link.download = "shift-template.xlsx";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setStatus("양식 파일을 다운로드했습니다.", "success");
  } catch (error) {
    setStatus(error.message || "양식 파일 다운로드에 실패했습니다.", "error");
  }
}

async function openEditDialog(date) {
  await selectDate(date);

  const shift = state.shift;
  const taxOfficeWorkers = shift?.taxOfficeWorkers || ["", ""];
  const districtOfficeWorkers = shift?.districtOfficeWorkers || ["", ""];

  els.editTitle.textContent = `${formatKoreanDate(date)} 근무표 ${shift ? "수정" : "등록"}`;
  els.taxWorker1.value = taxOfficeWorkers[0] || "";
  els.taxWorker2.value = taxOfficeWorkers[1] || "";
  els.districtWorker1.value = districtOfficeWorkers[0] || "";
  els.districtWorker2.value = districtOfficeWorkers[1] || "";
  els.changedByInput.value = els.changedByInput.value || getStoredActor();
  els.reasonInput.value = "";
  els.saveButton.textContent = shift ? "저장" : "등록";
  openDialog(els.editDialog);
}

function closeEditDialog() {
  els.editDialog.close();
}

async function saveSchedule(event) {
  event.preventDefault();

  const payload = {
    taxOfficeWorkers: [els.taxWorker1.value, els.taxWorker2.value].map(normalizeInputName),
    districtOfficeWorkers: [els.districtWorker1.value, els.districtWorker2.value].map(normalizeInputName),
    changedBy: els.changedByInput.value,
    reason: els.reasonInput.value,
    revision: state.shift?.revision ?? null,
  };

  const validationError = getAssignmentValidationError(payload.taxOfficeWorkers, payload.districtOfficeWorkers);
  if (validationError) {
    setStatus(validationError, "error");
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
    setStatus(`${formatKoreanDate(state.date)} 근무표를 저장했습니다.`, "success");
    await reloadAll();
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
      ${renderWorkerGroup("동작세무서", state.todayShift.taxOfficeWorkers)}
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
  els.listMeta.textContent = getRangeLabel();

  if (!state.shifts.length) {
    const message =
      state.rangeStart || state.rangeEnd
        ? "선택한 기간에 등록된 근무표가 없습니다."
        : "등록된 근무표가 없습니다. 달력에서 날짜를 눌러 등록하세요.";
    els.shiftList.innerHTML = `<div class="empty-state">${message}</div>`;
    return;
  }

  els.shiftList.innerHTML = `
    <div class="table-wrap">
      <table class="shift-table">
        <thead>
          <tr>
            <th>날짜</th>
            <th>동작세무서</th>
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
    button.addEventListener("click", () => openEditDialog(button.dataset.editDate));
  });
}

function renderShiftRow(shift) {
  const selected = shift.date === state.date ? "is-selected" : "";
  const warnings = shift.warnings?.length
    ? `<p class="row-warning">${shift.warnings.map(escapeHtml).join("<br>")}</p>`
    : "";

  return `
    <tr class="${selected}">
      <td data-label="날짜">
        <button class="date-button" type="button" data-select-date="${escapeHtml(shift.date)}">
          ${escapeHtml(formatKoreanDate(shift.date))}
        </button>
        <p class="meta">수정 ${escapeHtml(formatDateTime(shift.updatedAt))}</p>
        ${warnings}
      </td>
      <td data-label="동작세무서">${renderWorkerNames(shift.taxOfficeWorkers)}</td>
      <td data-label="구청 신고창구">${renderWorkerNames(shift.districtOfficeWorkers)}</td>
      <td data-label="관리">
        <div class="row-actions">
          <button class="primary-button small" type="button" data-edit-date="${escapeHtml(shift.date)}">수정</button>
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
  els.undoSelectedButton.disabled = !state.shift;

  if (!state.history.length) {
    els.historyList.innerHTML = `<div class="empty-state compact">선택한 날짜의 최신 변경 이력이 없습니다.</div>`;
    return;
  }

  const latestHistory = state.history.slice(0, 2);
  els.historyList.innerHTML = `
    <div class="history-list">
      ${latestHistory.map(renderHistoryItem).join("")}
    </div>
  `;
}

function renderPeriodCalendar() {
  const byDate = new Map(state.calendarShifts.map((shift) => [shift.date, shift]));
  const days = enumerateDates(periodRange.start, periodRange.end);
  const leadingBlankCount = parseLocalDate(periodRange.start).getDay();
  const weekdayHeaders = WEEKDAY_LABELS.map(renderWeekdayHeader).join("");
  const leadingBlanks = Array.from({ length: leadingBlankCount }, (_, index) => renderPeriodBlank(index)).join("");

  els.periodCalendar.innerHTML = `
    <div class="period-calendar-grid" role="grid" aria-label="5월 1일부터 6월 1일까지 근무 달력">
      ${weekdayHeaders}
      ${leadingBlanks}
      ${days.map((date) => renderPeriodDay(date, byDate.get(date))).join("")}
    </div>
  `;

  els.periodCalendar.querySelectorAll("[data-calendar-date]").forEach((button) => {
    button.addEventListener("click", () => openEditDialog(button.dataset.calendarDate));
  });
}

function renderWeekdayHeader(label) {
  return `<div class="period-weekday" role="columnheader">${escapeHtml(label)}</div>`;
}

function renderPeriodBlank(index) {
  return `<div class="period-blank" aria-hidden="true" data-blank-index="${index}"></div>`;
}

function renderPeriodDay(date, shift) {
  const selected = date === state.date ? " is-selected" : "";
  const dayLabel = formatShortDate(date);
  const workerSummary = shift
    ? `${formatWorkerLine(shift.taxOfficeWorkers)} / ${formatWorkerLine(shift.districtOfficeWorkers)}`
    : "미등록";

  return `
    <button class="period-day${selected}" type="button" data-calendar-date="${escapeHtml(date)}">
      <span class="period-date">${escapeHtml(dayLabel)}</span>
      <span class="period-workers">${escapeHtml(workerSummary)}</span>
    </button>
  `;
}

function toggleTheme() {
  setTheme(state.theme === "dark" ? "light" : "dark");
}

function setTheme(theme) {
  state.theme = theme;
  localStorage.setItem("shiftScheduleTheme", theme);
  applyTheme(theme);
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  els.themeToggleButton.textContent = theme === "dark" ? "라이트모드" : "다크모드";
  els.themeToggleButton.setAttribute("aria-pressed", String(theme === "dark"));
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
      link: { mobileWebUrl: shareUrl, webUrl: shareUrl },
      buttonTitle: "근무표 공유",
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
    return `[근무표 안내]\n${formatted}\n\n해당 날짜에 등록된 근무표가 없습니다.`;
  }

  return [
    "[근무표 안내]",
    formatted,
    "",
    `동작세무서: ${formatWorkerLine(shift.taxOfficeWorkers)}`,
    "",
    `구청 신고창구: ${formatWorkerLine(shift.districtOfficeWorkers)}`,
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
  const actor = String(value || "").trim();
  if (!actor) return;
  localStorage.setItem("shiftScheduleActor", actor);
  els.importChangedByInput.value = actor;
  els.changedByInput.value = actor;
  els.undoChangedByInput.value = actor;
}

function restoreActorNames() {
  const actor = getStoredActor();
  els.importChangedByInput.value = actor;
  els.changedByInput.value = actor;
  els.undoChangedByInput.value = actor;
}

function getStoredActor() {
  return localStorage.getItem("shiftScheduleActor") || "";
}

function getShiftFromList(date) {
  return state.allShifts.find((shift) => shift.date === date) || null;
}

function getRangeLabel() {
  if (state.rangeStart && state.rangeEnd) {
    return `${state.rangeStart}부터 ${state.rangeEnd}까지`;
  }
  if (state.rangeStart) {
    return `${state.rangeStart}부터`;
  }
  if (state.rangeEnd) {
    return `${state.rangeEnd}까지`;
  }
  return "전체 표시 중";
}

function getRangeStatusMessage() {
  if (!state.rangeStart && !state.rangeEnd) {
    return "전체 날짜별 근무자를 표시합니다.";
  }
  return `${getRangeLabel()} 날짜별 근무자를 표시합니다.`;
}

function normalizeDateInput(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return "";

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(year, month - 1, day);

  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
    return "";
  }

  return `${yearText}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeInputName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function getAssignmentValidationError(taxOfficeWorkers, districtOfficeWorkers) {
  const duplicateNames = findDuplicateNames(taxOfficeWorkers, districtOfficeWorkers);
  if (duplicateNames.length) {
    return `같은 날짜에 같은 사람이 중복 배정되어 있습니다: ${duplicateNames.join(", ")}`;
  }
  return "";
}

function findDuplicateNames(taxOfficeWorkers, districtOfficeWorkers) {
  const seen = new Map();
  const duplicates = new Set();

  [...taxOfficeWorkers, ...districtOfficeWorkers].forEach((name) => {
    const normalized = normalizeInputName(name);
    if (!normalized) return;

    const key = normalized.toLocaleLowerCase("ko-KR");
    if (seen.has(key)) {
      duplicates.add(normalized);
    } else {
      seen.set(key, normalized);
    }
  });

  return [...duplicates];
}

function formatWorkerLine(workers) {
  const names = workers.filter(Boolean);
  return names.length ? names.join(", ") : "비어 있음";
}

function formatWorkersForHistory(value) {
  if (!value) return "없음";
  if (Array.isArray(value)) return value.map((item) => item || "비어 있음").join(", ");
  if (typeof value === "object") {
    const tax = value.taxOfficeWorkers ? `동작세무서 ${formatWorkerLine(value.taxOfficeWorkers)}` : "";
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

function formatShortDate(date) {
  const [, month, day] = date.split("-").map(Number);
  return `${month}/${day}`;
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

function getInitialTheme() {
  return localStorage.getItem("shiftScheduleTheme") === "light" ? "light" : "dark";
}

function getPeriodRange(referenceDate) {
  const year = referenceDate.slice(0, 4);
  return {
    start: `${year}-05-01`,
    end: `${year}-06-01`,
  };
}

function enumerateDates(start, end) {
  const dates = [];
  let cursor = parseLocalDate(start);
  const last = parseLocalDate(end);

  while (cursor <= last) {
    dates.push(formatDateValue(cursor));
    cursor = addDays(cursor, 1);
  }

  return dates;
}

function parseLocalDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
