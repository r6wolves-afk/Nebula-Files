const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 4175);
const ROOT = __dirname;
const API_BASE = "/api/addons/files";

const contentTypes = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json"
};

let nextId = 6;
const entries = [
  folder("folder-1", "Design", null, "2026-07-01T10:00:00Z", "2026-07-10T10:00:00Z"),
  folder("folder-2", "Archive", "folder-1", "2026-07-02T10:00:00Z", "2026-07-03T10:00:00Z"),
  folder("folder-3", "Invoices", null, "2026-07-02T10:00:00Z", "2026-07-11T10:00:00Z"),
  file("file-1", "Project brief.pdf", "application/pdf", 482901, null, "mock pdf bytes"),
  file("file-2", "cover.png", "image/png", 120943, null, "mock png bytes"),
  file("file-3", "palette.json", "application/json", 2048, "folder-1", '{"accent":"teal"}')
];

function folder(id, name, parentId, createdAt, updatedAt) {
  return { id, type: "folder", name, parentId, createdAt, updatedAt };
}

function file(id, name, mimeType, size, parentId, content) {
  const now = "2026-07-13T00:00:00Z";
  return { id, type: "file", name, filename: name, mimeType, size, parentId, createdAt: now, updatedAt: now, content };
}

function sendJson(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(data));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function parseMultipart(buffer, contentType) {
  const boundary = contentType.match(/boundary=(.+)$/)?.[1];
  if (!boundary) return { filename: "Upload.bin", parentId: null, mimeType: "application/octet-stream", size: buffer.length };

  const body = buffer.toString("binary");
  const parts = body.split(`--${boundary}`);
  let filename = "Upload.bin";
  let parentId = null;
  let mimeType = "application/octet-stream";
  let size = buffer.length;

  for (const part of parts) {
    if (!part.includes("Content-Disposition")) continue;
    const name = part.match(/name="([^"]+)"/)?.[1];
    const value = part.split("\r\n\r\n")[1]?.replace(/\r\n--$/, "").trim();

    if (name === "parentId") parentId = value || null;
    if (name === "file") {
      filename = part.match(/filename="([^"]+)"/)?.[1] || filename;
      mimeType = part.match(/Content-Type: ([^\r\n]+)/)?.[1] || mimeType;
      size = Buffer.byteLength(value || "", "binary");
    }
  }

  return { filename, parentId, mimeType, size };
}

function normalizeParentId(parentId) {
  return parentId || null;
}

function getEntryName(entry) {
  return entry.name || entry.filename || "Untitled";
}

function findEntry(entryId) {
  return entries.find((candidate) => candidate.id === entryId);
}

function hasDuplicateName(name, parentId, ignoredId = null) {
  const normalizedName = String(name || "").trim().toLowerCase();
  const normalizedParentId = normalizeParentId(parentId);

  return entries.some((entry) => (
    entry.id !== ignoredId &&
    normalizeParentId(entry.parentId) === normalizedParentId &&
    getEntryName(entry).toLowerCase() === normalizedName
  ));
}

function buildBreadcrumbs(folderId) {
  const breadcrumbs = [];
  let current = findEntry(folderId);

  while (current && current.type === "folder") {
    breadcrumbs.unshift(stripContent(current));
    current = current.parentId ? findEntry(current.parentId) : null;
  }

  return breadcrumbs;
}

function listResponse(parentId) {
  const normalizedParentId = normalizeParentId(parentId);
  const currentFolder = normalizedParentId ? findEntry(normalizedParentId) : null;
  const currentEntries = entries.filter((entry) => normalizeParentId(entry.parentId) === normalizedParentId).map(stripContent);

  return {
    entries: currentEntries,
    files: currentEntries.filter((entry) => entry.type === "file"),
    currentFolder: currentFolder ? stripContent(currentFolder) : null,
    breadcrumbs: buildBreadcrumbs(normalizedParentId),
    allEntries: entries.map(stripContent)
  };
}

function descendantsOf(folderId) {
  const directChildren = entries.filter((entry) => entry.parentId === folderId);
  return directChildren.flatMap((entry) => [entry.id, ...(entry.type === "folder" ? descendantsOf(entry.id) : [])]);
}

async function handleApi(request, response, url) {
  const pathname = url.pathname;

  if (request.method === "GET" && pathname === `${API_BASE}/user-files`) {
    const parentId = url.searchParams.get("parentId") || null;
    sendJson(response, 200, listResponse(parentId));
    return true;
  }

  if (request.method === "POST" && pathname === `${API_BASE}/user-folders`) {
    const body = JSON.parse((await readBody(request)).toString() || "{}");
    const name = String(body.name || "New folder").trim();
    const parentId = normalizeParentId(body.parentId);
    if (hasDuplicateName(name, parentId)) {
      sendJson(response, 409, { error: "An item with that name already exists in this folder" });
      return true;
    }

    const now = new Date().toISOString();
    const entry = folder(`folder-${nextId++}`, name, parentId, now, now);
    entries.push(entry);
    sendJson(response, 201, { entry: stripContent(entry) });
    return true;
  }

  if (request.method === "POST" && pathname === `${API_BASE}/user-files`) {
    const body = await readBody(request);
    const upload = parseMultipart(body, request.headers["content-type"] || "");
    const parentId = normalizeParentId(upload.parentId);
    if (hasDuplicateName(upload.filename, parentId)) {
      sendJson(response, 409, { error: "An item with that name already exists in this folder" });
      return true;
    }

    const entry = file(`file-${nextId++}`, upload.filename, upload.mimeType, upload.size, parentId, "uploaded mock bytes");
    entries.push(entry);
    sendJson(response, 201, { entry: stripContent(entry) });
    return true;
  }

  const entryMatch = pathname.match(new RegExp(`^${API_BASE}/user-files/([^/]+)$`));
  if (!entryMatch) return false;

  const entryId = decodeURIComponent(entryMatch[1]);
  const entry = entries.find((candidate) => candidate.id === entryId);
  if (!entry) {
    sendJson(response, 404, { error: "Entry not found" });
    return true;
  }

  if (request.method === "GET") {
    response.writeHead(200, {
      "Content-Type": entry.mimeType || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(entry.content || "mock file bytes");
    return true;
  }

  if (request.method === "PATCH") {
    const body = JSON.parse((await readBody(request)).toString() || "{}");
    const nextName = String(body.name || entry.name).trim();
    const nextParentId = normalizeParentId(body.parentId);

    if (entry.type === "folder") {
      const invalidFolderIds = new Set([entry.id, ...descendantsOf(entry.id)]);
      if (nextParentId && invalidFolderIds.has(nextParentId)) {
        sendJson(response, 400, { error: "Cannot move a folder into itself or one of its descendants" });
        return true;
      }
    }

    if (hasDuplicateName(nextName, nextParentId, entry.id)) {
      sendJson(response, 409, { error: "An item with that name already exists in this folder" });
      return true;
    }

    entry.name = nextName;
    if (entry.type === "file") entry.filename = entry.name;
    entry.parentId = nextParentId;
    entry.updatedAt = new Date().toISOString();
    sendJson(response, 200, { entry: stripContent(entry) });
    return true;
  }

  if (request.method === "DELETE") {
    const idsToDelete = new Set([entryId, ...(entry.type === "folder" ? descendantsOf(entryId) : [])]);
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      if (idsToDelete.has(entries[index].id)) entries.splice(index, 1);
    }
    response.writeHead(204, { "Cache-Control": "no-store" });
    response.end();
    return true;
  }

  return false;
}

function stripContent(entry) {
  const { content, ...publicEntry } = entry;
  return publicEntry;
}

function serveStatic(request, response, url) {
  let filePath = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!filePath.startsWith(ROOT)) {
    response.writeHead(403);
    response.end();
    return;
  }

  fs.stat(filePath, (statError, stat) => {
    if (statError) {
      response.writeHead(404, { "Cache-Control": "no-store" });
      response.end("not found");
      return;
    }

    if (stat.isDirectory()) filePath = path.join(filePath, "index.html");

    fs.readFile(filePath, (readError, body) => {
      if (readError) {
        response.writeHead(404, { "Cache-Control": "no-store" });
        response.end("not found");
        return;
      }

      response.writeHead(200, {
        "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
        "Cache-Control": "no-store"
      });
      response.end(body);
    });
  });
}

http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://localhost:${PORT}`);
  if (url.pathname.startsWith(API_BASE) && await handleApi(request, response, url)) return;
  serveStatic(request, response, url);
}).listen(PORT, () => {
  console.log(`Nebula Files preview: http://localhost:${PORT}/frontend/index.html`);
});