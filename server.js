const http = require("http");
const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

loadEnvFile();

const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DATA_DIR = path.join(ROOT_DIR, "data");
const DB_PATH = path.join(DATA_DIR, "shifts.json");
const MAX_BODY_BYTES = 1024 * 1024;

const LOCATION_LABELS = {
  tax: "세무서",
  district: "구청 신고창구",
};

const WORKER_FIELDS = {
  tax: "taxOfficeWorkers",
  district: "districtOfficeWorkers",
};

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

    if (req.method === "GET" && pathname === "/api/shifts") {
      await listShifts(res, parsedUrl.searchParams.get("month"));
      return;
    }

    const match = pathname.match(/^\/api\/shifts\/(\d{4}-\d{2}-\d{2})(?:\/(replace|swap))?$/);
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

    requireEditPin(body.editPin);

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
      changedBy: actor,
      reason,
      createdAt: now,
    });

    await writeDb(db);
    return { shift: toPublicShift(nextShift), history: db.history.filter((entry) => entry.shiftDate === date) };
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

    requireEditPin(body.editPin);
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

    requireEditPin(body.editPin);
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

function requireEditPin(inputPin) {
  const configuredPin = process.env.SHIFT_EDIT_PIN;
  if (!configuredPin) {
    throw new HttpError(503, "서버 환경변수 SHIFT_EDIT_PIN이 설정되어 있지 않습니다.");
  }

  if (String(inputPin || "") !== configuredPin) {
    throw new HttpError(401, "편집 비밀번호가 일치하지 않습니다.");
  }
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

  const pair = value.map(normalizeWorkerName);
  if (pair.some((name) => !name)) {
    throw new HttpError(400, `${label} 근무자 이름을 모두 입력해주세요.`);
  }

  return pair;
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

  if (names.some((item) => !normalizeWorkerName(item.name))) {
    errors.push("빈 근무자 이름은 저장할 수 없습니다.");
  }

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
