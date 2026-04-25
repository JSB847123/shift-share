const http = require("http");
const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const zlib = require("zlib");

loadEnvFile();

const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DATA_DIR = path.join(ROOT_DIR, "data");
const DB_PATH = path.join(DATA_DIR, "shifts.json");
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_XLSX_BYTES = 5 * 1024 * 1024;

const LOCATION_LABELS = {
  tax: "세무서",
  district: "구청 신고창구",
};

const WORKER_FIELDS = {
  tax: "taxOfficeWorkers",
  district: "districtOfficeWorkers",
};

const CRC_TABLE = makeCrcTable();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

let writeQueue = Promise.resolve();

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (parsedUrl.pathname.startsWith("/api/")) {
      await handleApi(req, res, parsedUrl);
      return;
    }

    await serveStatic(req, res, parsedUrl.pathname);
  } catch (error) {
    handleUnexpectedError(res, error);
  }
});

server.listen(PORT, () => {
  console.log(`Shift schedule app running at http://localhost:${PORT}`);
});

async function handleApi(req, res, parsedUrl) {
  const pathname = parsedUrl.pathname;

  try {
    if (req.method === "GET" && pathname === "/api/health") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && pathname === "/api/config") {
      sendJson(res, 200, {
        kakaoJsKey: process.env.KAKAO_JS_KEY || process.env.NEXT_PUBLIC_KAKAO_JS_KEY || "",
        appBaseUrl: getAppBaseUrl(req),
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/shifts-template.xlsx") {
      sendXlsxTemplate(res);
      return;
    }

    if (req.method === "POST" && pathname === "/api/shifts/import-xlsx") {
      const body = await readRequestJson(req);
      await importShiftsFromXlsx(res, body);
      return;
    }

    if (req.method === "GET" && pathname === "/api/shifts") {
      await listShifts(res, parsedUrl.searchParams.get("month"));
      return;
    }

    const match = pathname.match(/^\/api\/shifts\/(\d{4}-\d{2}-\d{2})(?:\/(replace|swap|undo))?$/);
    if (!match) {
      throw new HttpError(404, "요청한 API를 찾을 수 없습니다.");
    }

    const [, date, action] = match;
    assertValidDate(date);

    if (req.method === "GET" && !action) {
      await getShift(res, date);
      return;
    }

    if (req.method === "POST" && !action) {
      const body = await readRequestJson(req);
      await saveShift(res, date, body);
      return;
    }

    if (req.method === "PATCH" && action === "replace") {
      const body = await readRequestJson(req);
      await replaceWorker(res, date, body);
      return;
    }

    if (req.method === "PATCH" && action === "swap") {
      const body = await readRequestJson(req);
      await swapWorkers(res, date, body);
      return;
    }

    if (req.method === "PATCH" && action === "undo") {
      const body = await readRequestJson(req);
      await undoShift(res, date, body);
      return;
    }

    throw new HttpError(405, "지원하지 않는 요청 방식입니다.");
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(res, error.status, {
        error: error.message,
        details: error.details || null,
      });
      return;
    }

    throw error;
  }
}

async function listShifts(res, month) {
  if (month && !/^\d{4}-\d{2}$/.test(month)) {
    throw new HttpError(400, "월 형식이 올바르지 않습니다. YYYY-MM 형식을 사용해주세요.");
  }

  const db = await readDb();
  const shifts = Object.values(db.shifts)
    .filter((shift) => !month || shift.date.startsWith(month))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(toPublicShift);

  sendJson(res, 200, { shifts });
}

async function getShift(res, date) {
  const db = await readDb();
  const shift = db.shifts[date] ? toPublicShift(db.shifts[date]) : null;
  const history = db.history
    .filter((entry) => entry.shiftDate === date)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  sendJson(res, 200, { shift, history });
}

async function saveShift(res, date, body) {
  const result = await withDbLock(async () => {
    const db = await readDb();
    const existing = db.shifts[date] || null;
    const actor = requireActor(body.changedBy);
    const reason = normalizeOptionalText(body.reason);

    if (existing) {
      assertRevisionMatches(existing, body.revision);
    } else if (body.revision !== undefined && body.revision !== null && body.revision !== "") {
      throw new HttpError(409, "이미 등록된 날짜입니다. 최신 근무표를 불러온 뒤 수정해주세요.");
    }

    const taxOfficeWorkers = normalizeWorkerPair(body.taxOfficeWorkers, "세무서");
    const districtOfficeWorkers = normalizeWorkerPair(body.districtOfficeWorkers, "구청 신고창구");
    assertValidAssignments(taxOfficeWorkers, districtOfficeWorkers);

    const now = new Date().toISOString();
    const nextShift = {
      date,
      taxOfficeWorkers,
      districtOfficeWorkers,
      updatedAt: now,
      updatedBy: actor,
      revision: existing ? existing.revision + 1 : 1,
    };

    db.shifts[date] = nextShift;
    db.history.push({
      id: randomUUID(),
      shiftDate: date,
      action: existing ? "update" : "create",
      location: "전체",
      beforeWorkers: existing ? workerSnapshot(existing) : null,
      afterWorkers: workerSnapshot(nextShift),
      beforeSchedule: existing ? workerSnapshot(existing) : null,
      afterSchedule: workerSnapshot(nextShift),
      changedBy: actor,
      reason,
      createdAt: now,
    });

    await writeDb(db);
    return { shift: toPublicShift(nextShift), history: db.history.filter((entry) => entry.shiftDate === date) };
  });

  sendJson(res, 200, result);
}

async function undoShift(res, date, body) {
  const result = await withDbLock(async () => {
    const db = await readDb();
    const existing = db.shifts[date];
    if (!existing) {
      throw new HttpError(404, "되돌릴 근무표가 없습니다.");
    }

    assertRevisionMatches(existing, body.revision);

    const actor = requireActor(body.changedBy);
    const reason = normalizeOptionalText(body.reason) || "직전 변경 되돌리기";
    const latestEntry = [...db.history]
      .filter((entry) => entry.shiftDate === date)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];

    if (!latestEntry) {
      throw new HttpError(400, "되돌릴 변경 이력이 없습니다.");
    }

    const previousSchedule = latestEntry.beforeSchedule ?? latestEntry.beforeWorkers ?? null;
    const beforeShift = cloneShift(existing);
    const now = new Date().toISOString();
    let nextShift = null;

    if (previousSchedule) {
      nextShift = {
        date,
        taxOfficeWorkers: normalizeWorkerPair(previousSchedule.taxOfficeWorkers, "세무서"),
        districtOfficeWorkers: normalizeWorkerPair(previousSchedule.districtOfficeWorkers, "구청 신고창구"),
        updatedAt: now,
        updatedBy: actor,
        revision: existing.revision + 1,
      };
      assertValidAssignments(nextShift.taxOfficeWorkers, nextShift.districtOfficeWorkers);
      db.shifts[date] = nextShift;
    } else {
      delete db.shifts[date];
    }

    db.history.push({
      id: randomUUID(),
      shiftDate: date,
      action: "undo",
      location: "전체",
      beforeWorkers: workerSnapshot(beforeShift),
      afterWorkers: nextShift ? workerSnapshot(nextShift) : null,
      beforeSchedule: workerSnapshot(beforeShift),
      afterSchedule: nextShift ? workerSnapshot(nextShift) : null,
      changedBy: actor,
      reason,
      createdAt: now,
    });

    await writeDb(db);
    return {
      shift: nextShift ? toPublicShift(nextShift) : null,
      history: db.history.filter((entry) => entry.shiftDate === date),
    };
  });

  sendJson(res, 200, result);
}

async function replaceWorker(res, date, body) {
  const result = await withDbLock(async () => {
    const db = await readDb();
    const existing = db.shifts[date];
    if (!existing) {
      throw new HttpError(404, "해당 날짜에 등록된 근무표가 없습니다.");
    }

    assertRevisionMatches(existing, body.revision);

    const actor = requireActor(body.changedBy);
    const reason = normalizeOptionalText(body.reason);
    const position = parsePosition(body.position || body.from);
    const newWorker = normalizeWorkerName(body.newWorker);
    if (!newWorker) {
      throw new HttpError(400, "변경할 근무자 이름을 입력해주세요.");
    }

    const beforeShift = cloneShift(existing);
    const nextShift = cloneShift(existing);
    const field = WORKER_FIELDS[position.location];
    const beforeWorker = nextShift[field][position.index];

    nextShift[field][position.index] = newWorker;
    assertValidAssignments(nextShift.taxOfficeWorkers, nextShift.districtOfficeWorkers);

    const now = new Date().toISOString();
    nextShift.updatedAt = now;
    nextShift.updatedBy = actor;
    nextShift.revision = existing.revision + 1;

    db.shifts[date] = nextShift;
    db.history.push({
      id: randomUUID(),
      shiftDate: date,
      action: "replace",
      location: `${LOCATION_LABELS[position.location]} ${position.index + 1}`,
      beforeWorkers: [beforeWorker],
      afterWorkers: [newWorker],
      beforeSchedule: workerSnapshot(beforeShift),
      afterSchedule: workerSnapshot(nextShift),
      changedBy: actor,
      reason,
      createdAt: now,
    });

    await writeDb(db);
    return {
      shift: toPublicShift(nextShift),
      history: db.history.filter((entry) => entry.shiftDate === date),
    };
  });

  sendJson(res, 200, result);
}

async function swapWorkers(res, date, body) {
  const result = await withDbLock(async () => {
    const db = await readDb();
    const existing = db.shifts[date];
    if (!existing) {
      throw new HttpError(404, "해당 날짜에 등록된 근무표가 없습니다.");
    }

    assertRevisionMatches(existing, body.revision);

    const actor = requireActor(body.changedBy);
    const reason = normalizeOptionalText(body.reason);
    const a = parsePosition(body.a);
    const b = parsePosition(body.b);

    if (a.location === b.location && a.index === b.index) {
      throw new HttpError(400, "서로 다른 근무자 두 명을 선택해주세요.");
    }

    const beforeShift = cloneShift(existing);
    const nextShift = cloneShift(existing);
    const aField = WORKER_FIELDS[a.location];
    const bField = WORKER_FIELDS[b.location];
    const aWorker = nextShift[aField][a.index];
    const bWorker = nextShift[bField][b.index];

    nextShift[aField][a.index] = bWorker;
    nextShift[bField][b.index] = aWorker;
    assertValidAssignments(nextShift.taxOfficeWorkers, nextShift.districtOfficeWorkers);

    const now = new Date().toISOString();
    nextShift.updatedAt = now;
    nextShift.updatedBy = actor;
    nextShift.revision = existing.revision + 1;

    db.shifts[date] = nextShift;
    db.history.push({
      id: randomUUID(),
      shiftDate: date,
      action: "swap",
      location: `${formatPosition(a)} / ${formatPosition(b)}`,
      beforeWorkers: [aWorker, bWorker],
      afterWorkers: [bWorker, aWorker],
      beforeSchedule: workerSnapshot(beforeShift),
      afterSchedule: workerSnapshot(nextShift),
      changedBy: actor,
      reason,
      createdAt: now,
    });

    await writeDb(db);
    return {
      shift: toPublicShift(nextShift),
      history: db.history.filter((entry) => entry.shiftDate === date),
    };
  });

  sendJson(res, 200, result);
}

async function importShiftsFromXlsx(res, body) {
  const actor = normalizeWorkerName(body.changedBy) || "엑셀 업로드";
  const reason = normalizeOptionalText(body.reason) || "엑셀 파일 등록";
  const buffer = decodeBase64File(body.fileBase64);
  const rows = parseShiftRowsFromWorkbook(buffer);

  if (rows.length === 0) {
    throw new HttpError(400, "엑셀 파일에서 등록할 근무표를 찾지 못했습니다.");
  }

  const result = await withDbLock(async () => {
    const db = await readDb();
    const now = new Date().toISOString();
    const imported = [];

    for (const row of rows) {
      assertValidDate(row.date);
      const taxOfficeWorkers = normalizeWorkerPair(row.taxOfficeWorkers, "세무서");
      const districtOfficeWorkers = normalizeWorkerPair(row.districtOfficeWorkers, "구청 신고창구");
      assertValidAssignments(taxOfficeWorkers, districtOfficeWorkers);

      const existing = db.shifts[row.date] || null;
      const nextShift = {
        date: row.date,
        taxOfficeWorkers,
        districtOfficeWorkers,
        updatedAt: now,
        updatedBy: actor,
        revision: existing ? existing.revision + 1 : 1,
      };

      db.shifts[row.date] = nextShift;
      db.history.push({
        id: randomUUID(),
        shiftDate: row.date,
        action: existing ? "xlsx-update" : "xlsx-create",
        location: "전체",
        beforeWorkers: existing ? workerSnapshot(existing) : null,
        afterWorkers: workerSnapshot(nextShift),
        beforeSchedule: existing ? workerSnapshot(existing) : null,
        afterSchedule: workerSnapshot(nextShift),
        changedBy: actor,
        reason,
        createdAt: now,
      });
      imported.push(toPublicShift(nextShift));
    }

    await writeDb(db);
    return {
      imported,
      count: imported.length,
    };
  });

  sendJson(res, 200, result);
}

async function serveStatic(req, res, pathname) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendText(res, 405, "Method Not Allowed");
    return;
  }

  const publicRoot = path.resolve(PUBLIC_DIR);
  const hasExtension = Boolean(path.extname(pathname));
  const webPath = pathname === "/" || !hasExtension ? "/index.html" : pathname;
  const requestedPath = path.resolve(PUBLIC_DIR, `.${decodeURIComponent(webPath)}`);

  if (!requestedPath.startsWith(publicRoot)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const file = await fs.readFile(requestedPath);
    const type = MIME_TYPES[path.extname(requestedPath)] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": type.includes("html") ? "no-store" : "public, max-age=3600",
    });
    if (req.method !== "HEAD") {
      res.end(file);
    } else {
      res.end();
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      sendText(res, 404, "Not Found");
      return;
    }

    throw error;
  }
}

async function readRequestJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > MAX_BODY_BYTES) {
      throw new HttpError(413, "요청 본문이 너무 큽니다.");
    }
  }

  if (!raw.trim()) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "JSON 형식이 올바르지 않습니다.");
  }
}

async function readDb() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return {
      shifts: parsed.shifts && typeof parsed.shifts === "object" ? parsed.shifts : {},
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { shifts: {}, history: [] };
    }

    throw error;
  }
}

async function writeDb(db) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmpPath = `${DB_PATH}.${process.pid}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(db, null, 2)}\n`, "utf8");
  await fs.rename(tmpPath, DB_PATH);
}

function withDbLock(task) {
  const run = writeQueue.then(task, task);
  writeQueue = run.catch(() => {});
  return run;
}

function requireActor(value) {
  const actor = normalizeWorkerName(value);
  if (!actor) {
    throw new HttpError(400, "변경한 사람 이름을 입력해주세요.");
  }
  return actor;
}

function normalizeWorkerPair(value, label) {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new HttpError(400, `${label} 근무자는 정확히 2명 입력해야 합니다.`);
  }

  return value.map(normalizeWorkerName);
}

function normalizeWorkerName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeOptionalText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function assertValidAssignments(taxOfficeWorkers, districtOfficeWorkers) {
  const errors = [];

  if (!Array.isArray(taxOfficeWorkers) || taxOfficeWorkers.length !== 2) {
    errors.push("세무서 근무자는 정확히 2명이어야 합니다.");
  }

  if (!Array.isArray(districtOfficeWorkers) || districtOfficeWorkers.length !== 2) {
    errors.push("구청 신고창구 근무자는 정확히 2명이어야 합니다.");
  }

  const names = [
    ...(taxOfficeWorkers || []).map((name) => ({ name, location: "세무서" })),
    ...(districtOfficeWorkers || []).map((name) => ({ name, location: "구청 신고창구" })),
  ];

  const duplicateNames = findDuplicateNames(taxOfficeWorkers || [], districtOfficeWorkers || []);
  if (duplicateNames.length > 0) {
    errors.push(`같은 날짜에 같은 사람이 중복 배정되어 있습니다: ${duplicateNames.join(", ")}`);
  }

  if (errors.length > 0) {
    throw new HttpError(400, errors[0], { errors });
  }
}

function findDuplicateNames(taxOfficeWorkers, districtOfficeWorkers) {
  const seen = new Map();
  const duplicates = new Set();
  const allNames = [...taxOfficeWorkers, ...districtOfficeWorkers];

  for (const name of allNames) {
    const normalized = normalizeWorkerName(name);
    if (!normalized) continue;

    const key = normalized.toLocaleLowerCase("ko-KR");
    if (seen.has(key)) {
      duplicates.add(normalized);
    } else {
      seen.set(key, normalized);
    }
  }

  return [...duplicates];
}

function getWarnings(shift) {
  const warnings = [];
  const duplicates = findDuplicateNames(shift.taxOfficeWorkers || [], shift.districtOfficeWorkers || []);
  if (duplicates.length > 0) {
    warnings.push(`중복 배정 경고: ${duplicates.join(", ")}`);
  }
  return warnings;
}

function assertRevisionMatches(existing, revision) {
  const incomingRevision = Number(revision);
  if (!Number.isInteger(incomingRevision) || incomingRevision !== existing.revision) {
    throw new HttpError(
      409,
      "근무표가 다른 사람에 의해 변경되었습니다. 새로고침 후 다시 시도해주세요.",
      { currentRevision: existing.revision }
    );
  }
}

function parsePosition(value) {
  const location = value && typeof value === "object" ? value.location : null;
  const index = value && typeof value === "object" ? Number(value.index) : Number.NaN;

  if (!WORKER_FIELDS[location] || !Number.isInteger(index) || index < 0 || index > 1) {
    throw new HttpError(400, "근무자 위치 정보가 올바르지 않습니다.");
  }

  return { location, index };
}

function formatPosition(position) {
  return `${LOCATION_LABELS[position.location]} ${position.index + 1}`;
}

function cloneShift(shift) {
  return {
    date: shift.date,
    taxOfficeWorkers: [...shift.taxOfficeWorkers],
    districtOfficeWorkers: [...shift.districtOfficeWorkers],
    updatedAt: shift.updatedAt,
    updatedBy: shift.updatedBy,
    revision: shift.revision,
  };
}

function workerSnapshot(shift) {
  return {
    taxOfficeWorkers: [...shift.taxOfficeWorkers],
    districtOfficeWorkers: [...shift.districtOfficeWorkers],
  };
}

function toPublicShift(shift) {
  return {
    ...cloneShift(shift),
    warnings: getWarnings(shift),
  };
}

function assertValidDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HttpError(400, "날짜 형식이 올바르지 않습니다. YYYY-MM-DD 형식을 사용해주세요.");
  }

  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    throw new HttpError(400, "존재하지 않는 날짜입니다.");
  }
}

function getAppBaseUrl(req) {
  const configured = process.env.APP_BASE_URL;
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const proto = String(req.headers["x-forwarded-proto"] || "http").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || `localhost:${PORT}`)
    .split(",")[0]
    .trim();

  return `${proto}://${host}`;
}

function sendXlsxTemplate(res) {
  const buffer = createShiftTemplateWorkbook();
  res.writeHead(200, {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": 'attachment; filename="shift-template.xlsx"',
    "Content-Length": buffer.length,
    "Cache-Control": "no-store",
  });
  res.end(buffer);
}

function createShiftTemplateWorkbook() {
  const rows = [
    ["날짜", "세무서1", "세무서2", "구청 신고창구1", "구청 신고창구2"],
    ["2026-04-22", "A", "B", "C", "D"],
  ];

  const sheetRows = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) => {
          const cellRef = `${columnName(columnIndex + 1)}${rowIndex + 1}`;
          return `<c r="${cellRef}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");

  return createZip({
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="근무표" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
    "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols>
    <col min="1" max="1" width="14" customWidth="1"/>
    <col min="2" max="5" width="18" customWidth="1"/>
  </cols>
  <sheetData>${sheetRows}</sheetData>
</worksheet>`,
  });
}

function parseShiftRowsFromWorkbook(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new HttpError(400, "업로드할 xlsx 파일을 선택해주세요.");
  }

  if (buffer.length > MAX_XLSX_BYTES) {
    throw new HttpError(400, "xlsx 파일 크기는 5MB 이하만 업로드할 수 있습니다.");
  }

  const files = readZipFiles(buffer);
  const workbookPath = "xl/workbook.xml";
  const workbookRelsPath = "xl/_rels/workbook.xml.rels";
  const workbookXml = bufferToUtf8(files.get(workbookPath));
  const workbookRelsXml = bufferToUtf8(files.get(workbookRelsPath));
  const sheetRelId = getFirstSheetRelId(workbookXml);
  const sheetTarget = getRelationshipTarget(workbookRelsXml, sheetRelId) || "worksheets/sheet1.xml";
  const sheetPath = resolveWorkbookTarget(sheetTarget);
  const sharedStrings = parseSharedStrings(bufferToUtf8(files.get("xl/sharedStrings.xml")));
  const sheetXml = bufferToUtf8(files.get(sheetPath));

  if (!sheetXml) {
    throw new HttpError(400, "xlsx 파일에서 첫 번째 시트를 읽을 수 없습니다.");
  }

  const rows = parseSheetXml(sheetXml, sharedStrings);
  if (rows.length < 2) {
    return [];
  }

  const headerMap = buildHeaderMap(rows[0]);
  const required = ["date", "tax1", "tax2", "district1", "district2"];
  const missing = required.filter((key) => headerMap[key] === undefined);
  if (missing.length > 0) {
    throw new HttpError(
      400,
      "xlsx 양식의 헤더가 올바르지 않습니다. 양식을 다운로드 받아 사용해주세요."
    );
  }

  return rows
    .slice(1)
    .map((row, index) => {
      const date = normalizeDateCell(row[headerMap.date]);
      const taxOfficeWorkers = [row[headerMap.tax1] || "", row[headerMap.tax2] || ""];
      const districtOfficeWorkers = [row[headerMap.district1] || "", row[headerMap.district2] || ""];
      const hasAnyValue = [date, ...taxOfficeWorkers, ...districtOfficeWorkers].some((value) =>
        normalizeWorkerName(value)
      );

      if (!hasAnyValue) {
        return null;
      }

      if (!date) {
        throw new HttpError(400, `${index + 2}행의 날짜가 비어 있거나 올바르지 않습니다.`);
      }

      return {
        date,
        taxOfficeWorkers,
        districtOfficeWorkers,
      };
    })
    .filter(Boolean);
}

function decodeBase64File(value) {
  const raw = String(value || "").replace(/^data:.*?;base64,/, "");
  if (!raw) {
    throw new HttpError(400, "업로드할 xlsx 파일을 선택해주세요.");
  }
  return Buffer.from(raw, "base64");
}

function readZipFiles(buffer) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const files = new Map();
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new HttpError(400, "xlsx 파일 구조가 올바르지 않습니다.");
    }

    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileName = buffer
      .subarray(offset + 46, offset + 46 + fileNameLength)
      .toString("utf8");

    const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataOffset = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
    const compressedData = buffer.subarray(dataOffset, dataOffset + compressedSize);
    let content;

    if (method === 0) {
      content = Buffer.from(compressedData);
    } else if (method === 8) {
      content = zlib.inflateRawSync(compressedData);
    } else {
      throw new HttpError(400, "지원하지 않는 xlsx 압축 방식입니다.");
    }

    if (content.length !== uncompressedSize) {
      throw new HttpError(400, "xlsx 파일을 읽는 중 오류가 발생했습니다.");
    }

    files.set(normalizeZipPath(fileName), content);
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return files;
}

function findEndOfCentralDirectory(buffer) {
  const minOffset = Math.max(0, buffer.length - 65557);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  throw new HttpError(400, "xlsx 파일 구조가 올바르지 않습니다.");
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) =>
    extractTextFromXml(match[1])
  );
}

function parseSheetXml(xml, sharedStrings) {
  const rows = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cellMatch[1];
      const body = cellMatch[2];
      const ref = getXmlAttribute(attrs, "r") || "";
      const columnIndex = columnNameToIndex(ref.replace(/\d+/g, "")) - 1;
      const type = getXmlAttribute(attrs, "t");
      row[columnIndex] = getCellValue(type, body, sharedStrings);
    }
    rows.push(row);
  }
  return rows;
}

function getCellValue(type, body, sharedStrings) {
  if (type === "s") {
    const index = Number(extractValue(body));
    return sharedStrings[index] || "";
  }

  if (type === "inlineStr") {
    return extractTextFromXml(body);
  }

  return extractValue(body);
}

function buildHeaderMap(headerRow) {
  const aliases = {
    date: ["날짜", "일자", "date", "shiftdate"],
    tax1: ["세무서1", "세무서근무자1", "taxoffice1", "taxofficeworker1"],
    tax2: ["세무서2", "세무서근무자2", "taxoffice2", "taxofficeworker2"],
    district1: ["구청신고창구1", "구청1", "구청근무자1", "districtoffice1", "district1"],
    district2: ["구청신고창구2", "구청2", "구청근무자2", "districtoffice2", "district2"],
  };
  const map = {};

  headerRow.forEach((value, index) => {
    const key = normalizeHeader(value);
    for (const [field, names] of Object.entries(aliases)) {
      if (names.includes(key)) {
        map[field] = index;
      }
    }
  });

  return map;
}

function normalizeHeader(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/[()_\-]/g, "")
    .toLocaleLowerCase("ko-KR");
}

function normalizeDateCell(value) {
  const raw = normalizeWorkerName(value);
  if (!raw) return "";

  const isoMatch = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
  }

  const koreanMatch = raw.match(/^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일$/);
  if (koreanMatch) {
    return `${koreanMatch[1]}-${koreanMatch[2].padStart(2, "0")}-${koreanMatch[3].padStart(2, "0")}`;
  }

  if (/^\d+(\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  }

  return "";
}

function getFirstSheetRelId(xml) {
  const sheetMatch = xml.match(/<sheet\b([^>]*)\/?>/);
  return sheetMatch ? getXmlAttribute(sheetMatch[1], "r:id") : "";
}

function getRelationshipTarget(xml, id) {
  if (!xml || !id) return "";
  for (const match of xml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    if (getXmlAttribute(match[1], "Id") === id) {
      return getXmlAttribute(match[1], "Target");
    }
  }
  return "";
}

function getXmlAttribute(attrs, name) {
  const escaped = name.replace(":", "\\:");
  const match = attrs.match(new RegExp(`${escaped}="([^"]*)"`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function extractValue(xml) {
  const match = xml.match(/<v[^>]*>([\s\S]*?)<\/v>/);
  return match ? decodeXml(match[1]) : "";
}

function extractTextFromXml(xml) {
  return [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
    .map((match) => decodeXml(match[1]))
    .join("");
}

function bufferToUtf8(buffer) {
  return buffer ? buffer.toString("utf8") : "";
}

function normalizeZipPath(value) {
  return String(value || "").replace(/^\/+/, "").replace(/\\/g, "/");
}

function resolveWorkbookTarget(target) {
  const normalized = normalizeZipPath(target);
  return normalized.startsWith("xl/")
    ? normalized
    : normalizeZipPath(path.posix.join("xl", normalized));
}

function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const [fileName, content] of Object.entries(files)) {
    const nameBuffer = Buffer.from(fileName, "utf8");
    const contentBuffer = Buffer.from(content, "utf8");
    const crc = crc32(contentBuffer);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt32LE(0, 10);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(contentBuffer.length, 18);
    localHeader.writeUInt32LE(contentBuffer.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, nameBuffer, contentBuffer);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt32LE(0, 12);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(contentBuffer.length, 20);
    centralHeader.writeUInt32LE(contentBuffer.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + contentBuffer.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeCrcTable() {
  const table = [];
  for (let index = 0; index < 256; index += 1) {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[index] = crc >>> 0;
  }
  return table;
}

function columnName(index) {
  let name = "";
  while (index > 0) {
    const remainder = (index - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    index = Math.floor((index - 1) / 26);
  }
  return name;
}

function columnNameToIndex(name) {
  return String(name || "")
    .toUpperCase()
    .split("")
    .reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0);
}

function xmlEscape(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function decodeXml(value) {
  return String(value || "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
  });
  res.end(text);
}

function handleUnexpectedError(res, error) {
  console.error(error);
  if (!res.headersSent) {
    sendJson(res, 500, { error: "서버 오류가 발생했습니다." });
  } else {
    res.end();
  }
}

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!fsSync.existsSync(envPath)) return;

  const lines = fsSync.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
