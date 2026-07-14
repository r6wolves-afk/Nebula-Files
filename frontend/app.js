const API_BASE = "/api/addons/files";
const ROOT_ID = null;
const VIEWS = {
  MY_FILES: "my-files",
  SHARED_WITH_ME: "shared-with-me",
  SHARED_BY_ME: "shared-by-me"
};

const state = {
  activeView: VIEWS.MY_FILES,
  currentFolderId: ROOT_ID,
  entries: [],
  allEntries: [],
  hasAllEntries: false,
  currentFolder: null,
  breadcrumbs: [{ id: ROOT_ID, name: "Files" }],
  navigationHistory: [{ id: ROOT_ID, breadcrumbs: [{ id: ROOT_ID, name: "Files" }] }],
  navigationIndex: 0,
  viewMode: localStorage.getItem("nebula-files-view") || "list",
  sortBy: localStorage.getItem("nebula-files-sort") || "name-asc",
  searchQuery: "",
  selectedIds: new Set(),
  lastSelectedId: null,
  activeEntry: null,
  pendingDeleteEntries: [],
  directoryUsers: [],
  previewObjectUrl: null,
  draggedEntryIds: [],
  dragDepth: 0
};

const elements = {
  backButton: document.querySelector("#backButton"),
  breadcrumbs: document.querySelector("#breadcrumbs"),
  createFolderDialog: document.querySelector("#createFolderDialog"),
  createFolderForm: document.querySelector("#createFolderForm"),
  createFolderSubmit: document.querySelector("#createFolderSubmit"),
  deleteDialog: document.querySelector("#deleteDialog"),
  deleteForm: document.querySelector("#deleteForm"),
  deleteMessage: document.querySelector("#deleteMessage"),
  deleteSubmit: document.querySelector("#deleteSubmit"),
  deleteTitle: document.querySelector("#deleteTitle"),
  deleteSelectedButton: document.querySelector("#deleteSelectedButton"),
  clearSelectionButton: document.querySelector("#clearSelectionButton"),
  contentPanel: document.querySelector(".content-panel"),
  contextMenu: document.createElement("div"),
  dropOverlay: document.querySelector("#dropOverlay"),
  dropOverlayTitle: document.querySelector("#dropOverlayTitle"),
  dropTargetLabel: document.querySelector("#dropTargetLabel"),
  emptyFileUploadInput: document.querySelector("#emptyFileUploadInput"),
  emptyMessage: document.querySelector("#emptyMessage"),
  emptyNewFolderButton: document.querySelector("#emptyNewFolderButton"),
  emptyState: document.querySelector("#emptyState"),
  emptyTitle: document.querySelector("#emptyTitle"),
  entries: document.querySelector("#entries"),
  errorMessage: document.querySelector("#errorMessage"),
  errorState: document.querySelector("#errorState"),
  fileUploadInput: document.querySelector("#fileUploadInput"),
  folderNameInput: document.querySelector("#folderNameInput"),
  folderSummary: document.querySelector("#folderSummary"),
  gridViewButton: document.querySelector("#gridViewButton"),
  listViewButton: document.querySelector("#listViewButton"),
  loadingState: document.querySelector("#loadingState"),
  moveDestination: document.querySelector("#moveDestination"),
  moveDialog: document.querySelector("#moveDialog"),
  moveForm: document.querySelector("#moveForm"),
  moveSubmit: document.querySelector("#moveSubmit"),
  moveSelectedButton: document.querySelector("#moveSelectedButton"),
  myFilesViewButton: document.querySelector("#myFilesViewButton"),
  newFolderButton: document.querySelector("#newFolderButton"),
  notice: document.querySelector("#notice"),
  openSelectedButton: document.querySelector("#openSelectedButton"),
  previewBody: document.querySelector("#previewBody"),
  previewCloseButton: document.querySelector("#previewCloseButton"),
  previewDialog: document.querySelector("#previewDialog"),
  previewDownloadButton: document.querySelector("#previewDownloadButton"),
  previewMeta: document.querySelector("#previewMeta"),
  previewOpenButton: document.querySelector("#previewOpenButton"),
  previewTitle: document.querySelector("#previewTitle"),
  renameDialog: document.querySelector("#renameDialog"),
  renameForm: document.querySelector("#renameForm"),
  renameInput: document.querySelector("#renameInput"),
  renameSubmit: document.querySelector("#renameSubmit"),
  renameSelectedButton: document.querySelector("#renameSelectedButton"),
  retryButton: document.querySelector("#retryButton"),
  searchInput: document.querySelector("#searchInput"),
  selectionBar: document.querySelector("#selectionBar"),
  selectionSummary: document.querySelector("#selectionSummary"),
  shareSelectedButton: document.querySelector("#shareSelectedButton"),
  shareDialog: document.querySelector("#shareDialog"),
  shareForm: document.querySelector("#shareForm"),
  sharePermissionInput: document.querySelector("#sharePermissionInput"),
  shareScopeServer: document.querySelector("#shareScopeServer"),
  shareScopeUser: document.querySelector("#shareScopeUser"),
  shareSubmit: document.querySelector("#shareSubmit"),
  shareTargetName: document.querySelector("#shareTargetName"),
  shareUserField: document.querySelector("#shareUserField"),
  shareUserSelect: document.querySelector("#shareUserSelect"),
  sharedByMeViewButton: document.querySelector("#sharedByMeViewButton"),
  sharedWithMeViewButton: document.querySelector("#sharedWithMeViewButton"),
  sortSelect: document.querySelector("#sortSelect")
};

function getEntryId(entry) {
  return entry.rowId || entry.id || entry._id;
}

function getContentEntryId(entry) {
  return entry.sharedContext?.entryId || entry.id || entry._id;
}

function getEntryName(entry) {
  return entry.name || entry.filename || "Untitled";
}

function normalizeParentId(parentId) {
  return parentId || ROOT_ID;
}

function isMyFilesView() {
  return state.activeView === VIEWS.MY_FILES;
}

function isSharedWithMeView() {
  return state.activeView === VIEWS.SHARED_WITH_ME;
}

function isSharedByMeView() {
  return state.activeView === VIEWS.SHARED_BY_ME;
}

function entryCanMutate(entry) {
  return isMyFilesView() && !entry.sharedContext;
}

function entryCanDownload(entry) {
  return entry?.type === "file";
}

function getShareId(share) {
  return share?.share?.id || share?.shareId || share?.id || share?._id;
}

function getShareRecord(share) {
  return share?.share || share;
}

function getSharedEntry(share) {
  return share?.entry || share?.file || share?.folder || share?.item || share?.resource || share?.target || share;
}

function getOwnerLabel(value) {
  const owner = value?.owner || value?.createdBy || value?.sharedBy || value?.user;
  const share = getShareRecord(value);
  return owner?.displayName || owner?.username || value?.ownerName || value?.sharedByName || share?.ownerUserId || "Owner";
}

function getTargetLabel(share) {
  const shareRecord = getShareRecord(share);
  if (shareRecord?.scope === "server") return "Everyone on this server";
  const target = share?.targetUser || share?.target || share?.user;
  return target?.displayName || target?.username || share?.targetUsername || shareRecord?.targetUserId || "User";
}

function cloneSharedEntry(entry, sharedContext) {
  return {
    ...entry,
    id: getEntryId(entry),
    name: getEntryName(entry),
    filename: entry.filename || getEntryName(entry),
    sharedContext
  };
}

function normalizeSharedWithMeShare(share) {
  const entry = getSharedEntry(share);
  const shareRecord = getShareRecord(share);
  const shareId = getShareId(share);
  return cloneSharedEntry(entry, {
    type: "with-me",
    shareId,
    ownerLabel: getOwnerLabel(share),
    scope: shareRecord?.scope || "user",
    permission: shareRecord?.permission || "viewer",
    rootEntryId: getEntryId(entry)
  });
}

function normalizeSharedFolderEntry(entry, shareId, ownerLabel) {
  return cloneSharedEntry(entry, {
    type: "with-me",
    shareId,
    ownerLabel,
    scope: "user",
    permission: "viewer"
  });
}

function normalizeSharedByMeShare(share) {
  const entry = getSharedEntry(share);
  const shareRecord = getShareRecord(share);
  const shareId = getShareId(share);
  return {
    ...cloneSharedEntry(entry, {
    type: "by-me",
    shareId,
    scope: shareRecord?.scope || "user",
    permission: shareRecord?.permission || "viewer",
    targetLabel: getTargetLabel(share),
    entryId: getEntryId(entry)
    }),
    rowId: `share-${shareId}`
  };
}

function arrayFromResponse(data) {
  if (Array.isArray(data)) return data;
  return data?.shares || data?.entries || data?.items || data?.files || data?.users || [];
}

function normalizeBreadcrumbs(data) {
  const rootCrumb = { id: ROOT_ID, name: "Files" };
  const coreBreadcrumbs = Array.isArray(data.breadcrumbs) ? data.breadcrumbs : [];
  const normalizedCoreBreadcrumbs = coreBreadcrumbs
    .map((crumb) => ({ id: getEntryId(crumb) || ROOT_ID, name: getEntryName(crumb) }))
    .filter((crumb) => crumb.id !== ROOT_ID && crumb.name !== "Files");

  if (data.currentFolder) {
    const currentFolderCrumb = { id: getEntryId(data.currentFolder), name: getEntryName(data.currentFolder) };
    if (normalizedCoreBreadcrumbs.at(-1)?.id !== currentFolderCrumb.id) normalizedCoreBreadcrumbs.push(currentFolderCrumb);
  }

  if (normalizedCoreBreadcrumbs.length > 0) return [rootCrumb, ...normalizedCoreBreadcrumbs];
  if (data.currentFolder) return [rootCrumb, { id: getEntryId(data.currentFolder), name: getEntryName(data.currentFolder) }];
  return [rootCrumb];
}

function getEntryExtension(entry) {
  const name = getEntryName(entry).toLowerCase();
  return name.includes(".") ? name.split(".").pop() : "";
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return "Unknown size";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(value) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function describeEntry(entry) {
  if (entry.sharedContext?.type === "with-me") {
    const base = entry.type === "folder" ? "Folder" : typeLabelFor(entry);
    return `${base} - Shared by ${entry.sharedContext.ownerLabel || "Owner"}`;
  }
  if (entry.sharedContext?.type === "by-me") {
    const base = entry.type === "folder" ? "Folder" : typeLabelFor(entry);
    return `${base} - Shared with ${entry.sharedContext.targetLabel || "User"}`;
  }
  if (entry.type === "folder") return `Folder - Updated ${formatDate(entry.updatedAt || entry.createdAt)}`;
  return `${typeLabelFor(entry)} - ${formatSize(entry.size)}`;
}

function typeLabelFor(entry) {
  if (entry.type === "folder") return "Folder";
  const mimeType = entry.mimeType || "";
  const extension = getEntryExtension(entry);

  if (mimeType === "application/pdf" || extension === "pdf") return "PDF document";
  if (mimeType.startsWith("image/")) return "Image";
  if (mimeType.startsWith("video/")) return "Video";
  if (mimeType.startsWith("audio/")) return "Audio";
  if (["doc", "docx", "rtf", "txt"].includes(extension)) return "Document";
  if (["xls", "xlsx", "csv"].includes(extension)) return "Spreadsheet";
  if (["ppt", "pptx"].includes(extension)) return "Presentation";
  if (["zip", "rar", "7z", "tar", "gz"].includes(extension)) return "Archive";
  if (["js", "ts", "tsx", "jsx", "html", "css", "json", "md", "py", "rb", "go", "rs"].includes(extension)) return "Code";
  return extension ? `${extension.toUpperCase()} file` : "File";
}

function iconClassFor(entry) {
  if (entry.type === "folder") return "folder";
  const mimeType = entry.mimeType || "";
  const extension = getEntryExtension(entry);

  if (mimeType === "application/pdf" || extension === "pdf") return "pdf";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (["doc", "docx", "rtf", "txt"].includes(extension)) return "document";
  if (["xls", "xlsx", "csv", "tsv"].includes(extension)) return "spreadsheet";
  if (["ppt", "pptx"].includes(extension)) return "presentation";
  if (mimeType.includes("zip") || ["zip", "rar", "7z", "tar", "gz"].includes(extension)) return "archive";
  if (["js", "ts", "tsx", "jsx", "html", "css", "json", "md", "py", "rb", "go", "rs"].includes(extension)) return "code";
  return "file";
}

function iconBadgeFor(entry) {
  if (entry.type === "folder") return "";
  const extension = getEntryExtension(entry);
  if (!extension) return "FILE";

  const normalizedBadges = new Map([
    ["docx", "DOC"],
    ["xlsx", "XLS"],
    ["pptx", "PPT"],
    ["jpeg", "JPG"],
    ["markdown", "MD"],
    ["yaml", "YML"],
    ["gzip", "GZ"]
  ]);

  return (normalizedBadges.get(extension) || extension).slice(0, 4).toUpperCase();
}

function createEntryIcon(entry) {
  const icon = document.createElement("span");
  icon.className = `entry-icon ${iconClassFor(entry)}`;
  icon.setAttribute("aria-hidden", "true");

  const glyph = document.createElement("span");
  glyph.className = "entry-icon-glyph";
  icon.append(glyph);

  const badge = iconBadgeFor(entry);
  if (badge) {
    const badgeElement = document.createElement("span");
    badgeElement.className = "entry-icon-badge";
    badgeElement.textContent = badge;
    icon.append(badgeElement);
  }

  return icon;
}

const textPreviewExtensions = new Set([
  "txt", "csv", "tsv", "json", "md", "markdown", "js", "ts", "tsx", "jsx", "html", "css", "xml", "yml", "yaml",
  "py", "rb", "go", "rs", "java", "c", "cpp", "h", "cs", "php", "sh", "sql", "log", "ini", "env"
]);

function previewKindFor(entry) {
  const mimeType = (entry.mimeType || "").toLowerCase();
  const extension = getEntryExtension(entry);

  if (mimeType.startsWith("image/") && extension !== "svg") return "image";
  if (mimeType === "application/pdf" || extension === "pdf") return "pdf";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("text/") || mimeType.includes("json") || mimeType.includes("xml") || textPreviewExtensions.has(extension)) return "text";
  return "download";
}

function showNotice(message, tone = "info") {
  elements.notice.textContent = message;
  elements.notice.dataset.tone = tone;
  elements.notice.classList.remove("hidden");
  window.clearTimeout(showNotice.timeoutId);
  showNotice.timeoutId = window.setTimeout(() => elements.notice.classList.add("hidden"), 3600);
}

function setBusy(button, isBusy, label) {
  if (!button) return;
  if (isBusy) {
    button.dataset.originalText = button.textContent;
    button.textContent = label;
    button.disabled = true;
    return;
  }
  button.textContent = button.dataset.originalText || button.textContent;
  button.disabled = false;
}

async function request(path, options = {}) {
  const url = path.startsWith("/api/") ? path : `${API_BASE}${path}`;
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: options.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    ...options
  });

  if (!response.ok) {
    let message = `Request failed with ${response.status}`;
    const errorText = await response.text();
    try {
      const data = JSON.parse(errorText);
      message = data.message || data.error || message;
    } catch {
      message = errorText || message;
    }
    throw new Error(message);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function loadEntries(parentId = state.currentFolderId) {
  state.activeView = VIEWS.MY_FILES;
  elements.loadingState.classList.remove("hidden");
  elements.emptyState.classList.add("hidden");
  elements.errorState.classList.add("hidden");
  elements.entries.classList.add("hidden");

  try {
    const query = parentId ? `?parentId=${encodeURIComponent(parentId)}` : "";
    const data = await request(`/user-files${query}`);
    state.currentFolderId = normalizeParentId(parentId);
    state.currentFolder = data.currentFolder || null;
    state.entries = Array.isArray(data.entries) ? data.entries : (Array.isArray(data.files) ? data.files : []);
    state.hasAllEntries = Array.isArray(data.allEntries);
    state.allEntries = state.hasAllEntries ? data.allEntries : [];
    state.breadcrumbs = normalizeBreadcrumbs(data);
    state.selectedIds.clear();
    state.lastSelectedId = null;
    render();
    return true;
  } catch (error) {
    elements.errorMessage.textContent = error.message;
    elements.errorState.classList.remove("hidden");
    return false;
  } finally {
    elements.loadingState.classList.add("hidden");
  }
}

async function loadSharedWithMe() {
  state.activeView = VIEWS.SHARED_WITH_ME;
  elements.loadingState.classList.remove("hidden");
  elements.emptyState.classList.add("hidden");
  elements.errorState.classList.add("hidden");
  elements.entries.classList.add("hidden");

  try {
    const data = await request("/shared-with-me");
    state.currentFolderId = ROOT_ID;
    state.currentFolder = null;
    state.entries = arrayFromResponse(data).map(normalizeSharedWithMeShare).filter((entry) => getEntryId(entry));
    state.hasAllEntries = false;
    state.allEntries = [];
    state.breadcrumbs = [{ id: ROOT_ID, name: "Shared with me", view: VIEWS.SHARED_WITH_ME }];
    state.selectedIds.clear();
    state.lastSelectedId = null;
    render();
    return true;
  } catch (error) {
    elements.errorMessage.textContent = error.message;
    elements.errorState.classList.remove("hidden");
    return false;
  } finally {
    elements.loadingState.classList.add("hidden");
  }
}

async function loadSharedFolder(shareId, parentId = ROOT_ID, label = "Shared folder", breadcrumbs = null) {
  state.activeView = VIEWS.SHARED_WITH_ME;
  elements.loadingState.classList.remove("hidden");
  elements.emptyState.classList.add("hidden");
  elements.errorState.classList.add("hidden");
  elements.entries.classList.add("hidden");

  try {
    const query = parentId ? `?parentId=${encodeURIComponent(parentId)}` : "";
    const data = await request(`/shared-with-me/${encodeURIComponent(shareId)}/files${query}`);
    const ownerLabel = data?.ownerLabel || data?.owner?.displayName || data?.owner?.username || "Owner";
    state.currentFolderId = normalizeParentId(parentId);
    state.currentFolder = data.currentFolder || null;
    state.entries = arrayFromResponse(data).map((entry) => normalizeSharedFolderEntry(entry, shareId, ownerLabel));
    state.hasAllEntries = false;
    state.allEntries = [];
    state.breadcrumbs = breadcrumbs || [
      { id: ROOT_ID, name: "Shared with me", view: VIEWS.SHARED_WITH_ME },
      { id: parentId || shareId, name: label, view: VIEWS.SHARED_WITH_ME, shareId, parentId: parentId || ROOT_ID }
    ];
    state.selectedIds.clear();
    state.lastSelectedId = null;
    render();
    return true;
  } catch (error) {
    elements.errorMessage.textContent = error.message;
    elements.errorState.classList.remove("hidden");
    return false;
  } finally {
    elements.loadingState.classList.add("hidden");
  }
}

async function loadSharedByMe() {
  state.activeView = VIEWS.SHARED_BY_ME;
  elements.loadingState.classList.remove("hidden");
  elements.emptyState.classList.add("hidden");
  elements.errorState.classList.add("hidden");
  elements.entries.classList.add("hidden");

  try {
    const data = await request("/shared-by-me");
    state.currentFolderId = ROOT_ID;
    state.currentFolder = null;
    state.entries = arrayFromResponse(data).map(normalizeSharedByMeShare).filter((entry) => entry.sharedContext.shareId && entry.sharedContext.entryId);
    state.hasAllEntries = false;
    state.allEntries = [];
    state.breadcrumbs = [{ id: ROOT_ID, name: "Shared by me", view: VIEWS.SHARED_BY_ME }];
    state.selectedIds.clear();
    state.lastSelectedId = null;
    render();
    return true;
  } catch (error) {
    elements.errorMessage.textContent = error.message;
    elements.errorState.classList.remove("hidden");
    return false;
  } finally {
    elements.loadingState.classList.add("hidden");
  }
}

async function reloadCurrentView() {
  if (isSharedWithMeView()) {
    const crumb = state.breadcrumbs.at(-1);
    if (crumb?.shareId) return loadSharedFolder(crumb.shareId, crumb.parentId || ROOT_ID, crumb.name, state.breadcrumbs);
    return loadSharedWithMe();
  }
  if (isSharedByMeView()) return loadSharedByMe();
  return loadEntries();
}

function render() {
  renderViewTabs();
  renderBreadcrumbs();
  renderEntries();
  renderViewMode();
  renderSelectionBar();
  renderNavigationControls();

  const folderName = state.breadcrumbs.at(-1)?.name || "Files";
  const folderCount = state.entries.filter((entry) => entry.type === "folder").length;
  const fileCount = state.entries.length - folderCount;
  const visibleCount = getVisibleEntries().length;
  const filtered = state.searchQuery ? `, ${visibleCount} shown` : "";
  const itemLabel = isSharedByMeView() ? "share" : "file";
  elements.folderSummary.textContent = `${folderName} - ${folderCount} folder${folderCount === 1 ? "" : "s"}, ${fileCount} ${itemLabel}${fileCount === 1 ? "" : "s"}${filtered}`;
  elements.dropTargetLabel.textContent = folderName;
  elements.newFolderButton.disabled = !isMyFilesView();
  elements.emptyNewFolderButton.disabled = !isMyFilesView();
  elements.fileUploadInput.disabled = !isMyFilesView();
  elements.emptyFileUploadInput.disabled = !isMyFilesView();
  document.querySelectorAll('label[for="fileUploadInput"], label[for="emptyFileUploadInput"]').forEach((label) => label.classList.toggle("disabled", !isMyFilesView()));
}

function renderViewTabs() {
  elements.myFilesViewButton.classList.toggle("active", isMyFilesView());
  elements.sharedWithMeViewButton.classList.toggle("active", isSharedWithMeView());
  elements.sharedByMeViewButton.classList.toggle("active", isSharedByMeView());
}

function renderBreadcrumbs() {
  elements.breadcrumbs.replaceChildren();

  state.breadcrumbs.forEach((crumb, index) => {
    if (index > 0) {
      const separator = document.createElement("span");
      separator.className = "breadcrumb-separator";
      separator.textContent = "/";
      elements.breadcrumbs.append(separator);
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "breadcrumb-button";
    button.textContent = crumb.name;
    if (index === state.breadcrumbs.length - 1) button.classList.add("breadcrumb-current");
    button.addEventListener("click", () => navigateToBreadcrumb(index));
    if (isMyFilesView()) {
      button.addEventListener("dragover", (event) => handleFolderDragOver(event, crumb.id, button));
      button.addEventListener("dragleave", () => button.classList.remove("is-drop-target"));
      button.addEventListener("drop", (event) => handleFolderDrop(event, crumb.id, button));
    }
    elements.breadcrumbs.append(button);
  });
}

function renderNavigationControls() {
  elements.backButton.disabled = isMyFilesView() ? state.navigationIndex === 0 : state.breadcrumbs.length <= 1;
}

function rememberLocation() {
  const snapshot = {
    id: state.currentFolderId,
    breadcrumbs: state.breadcrumbs.map((crumb) => ({ ...crumb }))
  };
  const current = state.navigationHistory[state.navigationIndex];

  if (current?.id === snapshot.id) {
    state.navigationHistory[state.navigationIndex] = snapshot;
  } else {
    state.navigationHistory = state.navigationHistory.slice(0, state.navigationIndex + 1);
    state.navigationHistory.push(snapshot);
    state.navigationIndex = state.navigationHistory.length - 1;
  }

  renderNavigationControls();
}

async function goBack() {
  if (!isMyFilesView()) {
    if (state.breadcrumbs.length <= 1) return;
    navigateToBreadcrumb(state.breadcrumbs.length - 2);
    return;
  }

  if (state.navigationIndex === 0) return;

  const previousIndex = state.navigationIndex;
  state.navigationIndex -= 1;
  const snapshot = state.navigationHistory[state.navigationIndex];
  state.breadcrumbs = snapshot.breadcrumbs.map((crumb) => ({ ...crumb }));

  const loaded = await loadEntries(snapshot.id);
  if (!loaded) {
    state.navigationIndex = previousIndex;
    const current = state.navigationHistory[state.navigationIndex];
    state.breadcrumbs = current.breadcrumbs.map((crumb) => ({ ...crumb }));
    renderBreadcrumbs();
    renderNavigationControls();
  }
}

function renderEntries() {
  elements.entries.replaceChildren();

  if (state.entries.length === 0) {
    if (isSharedWithMeView()) {
      elements.emptyTitle.textContent = state.breadcrumbs.length > 1 ? "This shared folder is empty" : "Nothing shared with you";
      elements.emptyMessage.textContent = state.breadcrumbs.length > 1 ? "Shared folders are viewer-only." : "Files and folders shared with you will appear here.";
    } else if (isSharedByMeView()) {
      elements.emptyTitle.textContent = "No active shares";
      elements.emptyMessage.textContent = "Shares you create from My Files will appear here.";
    } else {
      elements.emptyTitle.textContent = "This folder is empty";
      elements.emptyMessage.textContent = "Create a folder or upload files to get started.";
    }
    elements.emptyState.classList.remove("hidden");
    elements.entries.classList.add("hidden");
    return;
  }

  const visibleEntries = getVisibleEntries();

  if (visibleEntries.length === 0) {
    elements.emptyTitle.textContent = "No matches found";
    elements.emptyMessage.textContent = `Nothing in this folder matches "${state.searchQuery}".`;
    elements.emptyState.classList.remove("hidden");
    elements.entries.classList.add("hidden");
    return;
  }

  elements.emptyState.classList.add("hidden");
  elements.entries.classList.remove("hidden");
  visibleEntries.forEach((entry) => elements.entries.append(createEntryCard(entry)));
}

function getVisibleEntries() {
  const query = state.searchQuery.trim().toLowerCase();
  const filteredEntries = query
    ? state.entries.filter((entry) => [getEntryName(entry), entry.mimeType, typeLabelFor(entry)].filter(Boolean).some((value) => value.toLowerCase().includes(query)))
    : [...state.entries];

  return filteredEntries.sort(compareEntries);
}

function compareEntries(left, right) {
  if (left.type !== right.type) return left.type === "folder" ? -1 : 1;

  const direction = state.sortBy.endsWith("desc") ? -1 : 1;
  if (state.sortBy.startsWith("updated")) return direction * (new Date(left.updatedAt || left.createdAt || 0) - new Date(right.updatedAt || right.createdAt || 0));
  if (state.sortBy.startsWith("size")) return direction * ((left.size || 0) - (right.size || 0));
  if (state.sortBy.startsWith("type")) return typeLabelFor(left).localeCompare(typeLabelFor(right), undefined, { sensitivity: "base" }) || getEntryName(left).localeCompare(getEntryName(right), undefined, { sensitivity: "base" });
  return direction * getEntryName(left).localeCompare(getEntryName(right), undefined, { sensitivity: "base" });
}

function renderViewMode() {
  const isGrid = state.viewMode === "grid";
  elements.entries.classList.toggle("grid-view", isGrid);
  elements.entries.classList.toggle("list-view", !isGrid);
  elements.gridViewButton.classList.toggle("active", isGrid);
  elements.listViewButton.classList.toggle("active", !isGrid);
}

function createEntryCard(entry) {
  const entryId = getEntryId(entry);
  const card = document.createElement("article");
  card.className = "entry-card";
  card.dataset.entryId = entryId;
  card.classList.toggle("selected", state.selectedIds.has(entryId));
  card.tabIndex = 0;
  card.draggable = entryCanMutate(entry);

  const selectLabel = document.createElement("label");
  selectLabel.className = "entry-select";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = state.selectedIds.has(entryId);
  checkbox.setAttribute("aria-label", `Select ${getEntryName(entry)}`);
  checkbox.addEventListener("click", (event) => event.stopPropagation());
  checkbox.addEventListener("change", () => toggleSelection(entryId, checkbox.checked));
  selectLabel.append(checkbox);

  const icon = createEntryIcon(entry);

  const main = document.createElement("div");
  main.className = "entry-main";

  const title = document.createElement("button");
  title.type = "button";
  title.className = "entry-title";
  title.textContent = getEntryName(entry);
  title.addEventListener("click", () => openEntry(entry));

  const subtitle = document.createElement("p");
  subtitle.className = "entry-subtitle";
  subtitle.textContent = describeEntry(entry);

  const details = document.createElement("div");
  details.className = "entry-details";
  details.append(detailChip(entry.type === "folder" ? "Folder" : typeLabelFor(entry)));
  if (entry.type === "file") details.append(detailChip(formatSize(entry.size)));
  if (entry.sharedContext?.type === "with-me") {
    details.append(detailChip(entry.sharedContext.scope === "server" ? "Server share" : "User share"));
    details.append(detailChip("Viewer"));
  } else if (entry.sharedContext?.type === "by-me") {
    details.append(detailChip(entry.sharedContext.scope === "server" ? "Everyone" : entry.sharedContext.targetLabel));
    details.append(detailChip("Viewer"));
  } else {
    details.append(detailChip(`Modified ${formatDate(entry.updatedAt || entry.createdAt)}`));
  }

  main.append(title, subtitle, details);

  const actions = document.createElement("div");
  actions.className = "entry-actions";
  actions.append(actionButton("Open", () => openEntry(entry)));
  if (entryCanDownload(entry)) actions.append(actionButton("Download", () => downloadFile(entry)));
  if (entryCanMutate(entry)) {
    actions.append(
      actionButton("Share", () => showShareDialog(entry)),
      actionButton("Rename", () => showRenameDialog(entry)),
      actionButton("Move", () => showMoveDialog(entry)),
      actionButton("Delete", () => showDeleteDialog(entry), "danger")
    );
  } else if (entry.sharedContext?.type === "by-me") {
    actions.append(actionButton("Revoke", () => revokeShare(entry), "danger"));
  }

  card.addEventListener("click", (event) => {
    if (event.target.closest("button") || event.target.closest("input") || event.target.closest("label")) return;
    selectEntryFromPointer(entryId, event);
  });
  card.addEventListener("contextmenu", (event) => showEntryContextMenu(event, entry));
  card.addEventListener("dblclick", (event) => {
    if (event.target.closest("button") || event.target.closest("input") || event.target.closest("label")) return;
    openEntry(entry);
  });
  card.addEventListener("keydown", (event) => {
    if (event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      toggleSelection(entryId);
    }
  });
  card.addEventListener("dragstart", (event) => {
    if (!entryCanMutate(entry)) {
      event.preventDefault();
      return;
    }
    if (event.target.closest("button") || event.target.closest("input") || event.target.closest("label")) {
      event.preventDefault();
      return;
    }

    if (!state.selectedIds.has(entryId)) {
      state.selectedIds.clear();
      state.selectedIds.add(entryId);
      state.lastSelectedId = entryId;
      renderSelectionBar();
      card.classList.add("selected");
    }

    state.draggedEntryIds = [...state.selectedIds];
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-nebula-entry-id", state.draggedEntryIds.join(","));
    event.dataTransfer.setData("text/plain", state.draggedEntryIds.length === 1 ? getEntryName(entry) : `${state.draggedEntryIds.length} items`);
    window.requestAnimationFrame(() => {
      state.draggedEntryIds.forEach((id) => elements.entries.querySelector(`[data-entry-id="${CSS.escape(id)}"]`)?.classList.add("is-drag-source"));
    });
  });
  card.addEventListener("dragend", clearEntryDragState);

  if (entry.type === "folder" && isMyFilesView()) {
    card.addEventListener("dragover", (event) => handleFolderDragOver(event, entryId, card));
    card.addEventListener("dragleave", () => card.classList.remove("is-drop-target"));
    card.addEventListener("drop", (event) => handleFolderDrop(event, entryId, card));
  }

  card.append(selectLabel, icon, main, actions);
  return card;
}

function detailChip(text) {
  const chip = document.createElement("span");
  chip.textContent = text;
  return chip;
}

function actionButton(label, handler, tone = "secondary") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = tone === "danger" ? "danger-button" : "secondary-button";
  button.textContent = label;
  button.addEventListener("click", handler);
  return button;
}

function getEntryById(entryId) {
  return state.entries.find((entry) => getEntryId(entry) === entryId);
}

function getEntryByAnyId(entryId) {
  return getEntryById(entryId) || state.allEntries.find((entry) => getEntryId(entry) === entryId);
}

function getSelectedEntries() {
  return [...state.selectedIds].map(getEntryById).filter(Boolean);
}

function getVisibleEntryIds() {
  return getVisibleEntries().map(getEntryId);
}

function selectOnlyEntry(entryId, rerender = true) {
  state.selectedIds.clear();
  state.selectedIds.add(entryId);
  state.lastSelectedId = entryId;
  if (rerender) {
    renderEntries();
    renderSelectionBar();
  }
}

function selectRangeTo(entryId, additive = false) {
  const visibleEntryIds = getVisibleEntryIds();
  const anchorId = state.lastSelectedId && visibleEntryIds.includes(state.lastSelectedId) ? state.lastSelectedId : entryId;
  const anchorIndex = visibleEntryIds.indexOf(anchorId);
  const targetIndex = visibleEntryIds.indexOf(entryId);
  if (anchorIndex === -1 || targetIndex === -1) return;

  if (!additive) state.selectedIds.clear();
  const [startIndex, endIndex] = [anchorIndex, targetIndex].sort((left, right) => left - right);
  visibleEntryIds.slice(startIndex, endIndex + 1).forEach((id) => state.selectedIds.add(id));
  renderEntries();
  renderSelectionBar();
}

function selectEntryFromPointer(entryId, event) {
  if (event.shiftKey) {
    selectRangeTo(entryId, event.ctrlKey || event.metaKey);
    return;
  }

  if (event.ctrlKey || event.metaKey) {
    toggleSelection(entryId);
    return;
  }

  selectOnlyEntry(entryId);
}

function selectAllEntries() {
  getVisibleEntryIds().forEach((entryId) => state.selectedIds.add(entryId));
  state.lastSelectedId = getVisibleEntryIds().at(-1) || state.lastSelectedId;
  renderEntries();
  renderSelectionBar();
}

function toggleSelection(entryId, selected = !state.selectedIds.has(entryId)) {
  if (selected) {
    state.selectedIds.add(entryId);
    state.lastSelectedId = entryId;
  } else {
    state.selectedIds.delete(entryId);
  }
  renderEntries();
  renderSelectionBar();
}

function clearSelection() {
  state.selectedIds.clear();
  state.lastSelectedId = null;
  renderEntries();
  renderSelectionBar();
}

function renderSelectionBar() {
  const selectedEntries = getSelectedEntries();
  const selectedCount = selectedEntries.length;

  elements.selectionBar.classList.toggle("hidden", selectedCount === 0);
  if (selectedCount === 0) return;

  const folderCount = selectedEntries.filter((entry) => entry.type === "folder").length;
  const fileCount = selectedCount - folderCount;
  elements.selectionSummary.textContent = `${selectedCount} selected - ${folderCount} folder${folderCount === 1 ? "" : "s"}, ${fileCount} file${fileCount === 1 ? "" : "s"}`;
  elements.openSelectedButton.disabled = selectedCount !== 1;
  elements.shareSelectedButton.disabled = selectedCount !== 1 || !isMyFilesView();
  elements.renameSelectedButton.disabled = selectedCount !== 1 || !isMyFilesView();
  elements.moveSelectedButton.disabled = selectedCount !== 1 || !isMyFilesView();
  elements.deleteSelectedButton.disabled = selectedCount === 0 || !isMyFilesView();
}

function withSingleSelected(action) {
  const [entry] = getSelectedEntries();
  if (!entry || state.selectedIds.size !== 1) return;
  action(entry);
}

async function openEntry(entry) {
  if (entry.type === "folder") {
    if (entry.sharedContext?.type === "with-me") {
      const shareId = entry.sharedContext.shareId;
      const isShareRoot = state.breadcrumbs.length === 1 && entry.sharedContext.rootEntryId === getEntryId(entry);
      const requestParentId = isShareRoot ? getContentEntryId(entry) : getEntryId(entry);
      const breadcrumbs = [
        ...state.breadcrumbs,
        { id: getEntryId(entry), name: getEntryName(entry), view: VIEWS.SHARED_WITH_ME, shareId, parentId: requestParentId }
      ];
      await loadSharedFolder(shareId, requestParentId, getEntryName(entry), breadcrumbs);
      return;
    }

    if (entry.sharedContext?.type === "by-me") {
      await loadEntries(entry.sharedContext.entryId || getEntryId(entry));
      return;
    }

    const previousBreadcrumbs = [...state.breadcrumbs];
    state.breadcrumbs.push({ id: getEntryId(entry), name: getEntryName(entry) });
    const loaded = await loadEntries(getEntryId(entry));
    if (!loaded) {
      state.breadcrumbs = previousBreadcrumbs;
      renderBreadcrumbs();
    } else {
      rememberLocation();
    }
    return;
  }

  await previewFile(entry);
}

function clearPreviewUrl() {
  if (!state.previewObjectUrl) return;
  URL.revokeObjectURL(state.previewObjectUrl);
  state.previewObjectUrl = null;
}

function renderPreviewMessage(message, tone = "info") {
  const messageElement = document.createElement("p");
  messageElement.className = `preview-message ${tone}`;
  messageElement.textContent = message;
  elements.previewBody.replaceChildren(messageElement);
}

async function previewFile(entry) {
  state.activeEntry = entry;
  clearPreviewUrl();
  elements.previewTitle.textContent = getEntryName(entry);
  elements.previewMeta.textContent = `${typeLabelFor(entry)} - ${formatSize(entry.size)} - Modified ${formatDate(entry.updatedAt || entry.createdAt)}`;
  elements.previewOpenButton.onclick = () => openFile(entry);
  elements.previewDownloadButton.onclick = () => downloadFile(entry);
  renderPreviewMessage("Loading preview");
  elements.previewDialog.showModal();

  try {
    const response = await fetch(`${API_BASE}/user-files/${encodeURIComponent(getContentEntryId(entry))}`, { credentials: "same-origin" });
    if (!response.ok) throw new Error(`Could not preview ${getEntryName(entry)}`);
    await renderFilePreview(entry, await response.blob());
  } catch (error) {
    renderPreviewMessage(error.message, "error");
  }
}

async function renderFilePreview(entry, blob) {
  const kind = previewKindFor(entry);

  if (kind === "text") {
    const maxPreviewBytes = 1_200_000;
    if ((entry.size || blob.size) > maxPreviewBytes) {
      renderPreviewMessage("This text file is too large to preview inline.");
      return;
    }

    let text = await blob.text();
    if ((entry.mimeType || "").includes("json") || getEntryExtension(entry) === "json") {
      try {
        text = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        // Keep the original text when it is not valid JSON.
      }
    }

    const pre = document.createElement("pre");
    pre.className = "preview-text";
    pre.textContent = text || "(empty file)";
    elements.previewBody.replaceChildren(pre);
    return;
  }

  if (kind === "download") {
    renderPreviewMessage("No inline preview is available for this file type.");
    return;
  }

  state.previewObjectUrl = URL.createObjectURL(blob);
  let previewElement;

  if (kind === "image") {
    previewElement = document.createElement("img");
    previewElement.alt = getEntryName(entry);
  } else if (kind === "pdf") {
    previewElement = document.createElement("iframe");
    previewElement.title = getEntryName(entry);
  } else if (kind === "video") {
    previewElement = document.createElement("video");
    previewElement.controls = true;
  } else if (kind === "audio") {
    previewElement = document.createElement("audio");
    previewElement.controls = true;
  }

  previewElement.className = `preview-media ${kind}`;
  previewElement.src = state.previewObjectUrl;
  elements.previewBody.replaceChildren(previewElement);
}

async function openFile(entry) {
  try {
    const response = await fetch(`${API_BASE}/user-files/${encodeURIComponent(getContentEntryId(entry))}`, { credentials: "same-origin" });
    if (!response.ok) throw new Error(`Could not open ${getEntryName(entry)}`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    showNotice(error.message, "error");
  }
}

async function downloadFile(entry) {
  try {
    const response = await fetch(`${API_BASE}/user-files/${encodeURIComponent(getContentEntryId(entry))}`, { credentials: "same-origin" });
    if (!response.ok) throw new Error(`Could not download ${getEntryName(entry)}`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = entry.filename || getEntryName(entry);
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    showNotice(error.message, "error");
  }
}

function navigateToBreadcrumb(index) {
  const crumb = state.breadcrumbs[index];

  if (crumb?.view === VIEWS.SHARED_WITH_ME || isSharedWithMeView()) {
    if (index === 0) {
      loadSharedWithMe();
      return;
    }

    const breadcrumbs = state.breadcrumbs.slice(0, index + 1);
    loadSharedFolder(crumb.shareId, crumb.parentId || ROOT_ID, crumb.name, breadcrumbs);
    return;
  }

  if (crumb?.view === VIEWS.SHARED_BY_ME || isSharedByMeView()) {
    loadSharedByMe();
    return;
  }

  const previousBreadcrumbs = [...state.breadcrumbs];
  state.breadcrumbs = state.breadcrumbs.slice(0, index + 1);
  loadEntries(crumb.id).then((loaded) => {
    if (!loaded) {
      state.breadcrumbs = previousBreadcrumbs;
      renderBreadcrumbs();
      return;
    }
    rememberLocation();
  });
}

function showCreateFolderDialog() {
  elements.folderNameInput.value = "";
  elements.createFolderDialog.showModal();
  elements.folderNameInput.focus();
}

async function createFolder(name) {
  await request("/user-folders", {
    method: "POST",
    body: JSON.stringify({ name, parentId: state.currentFolderId })
  });
  showNotice("Folder created");
  await loadEntries();
}

async function uploadFiles(fileList) {
  if (!isMyFilesView()) return;
  const files = [...fileList];
  if (files.length === 0) return;

  try {
    await Promise.all(files.map((file) => {
      const formData = new FormData();
      formData.append("file", file);
      if (state.currentFolderId) formData.append("parentId", state.currentFolderId);
      return request("/user-files", { method: "POST", body: formData });
    }));
    showNotice(`${files.length} file${files.length === 1 ? "" : "s"} uploaded`);
    await loadEntries();
  } catch (error) {
    showNotice(error.message, "error");
  } finally {
    elements.fileUploadInput.value = "";
    elements.emptyFileUploadInput.value = "";
  }
}

async function loadDirectoryUsers() {
  const data = await request("/api/users/directory");
  state.directoryUsers = arrayFromResponse(data);
  return state.directoryUsers;
}

function renderDirectoryUsers(users) {
  if (!Array.isArray(users) || users.length === 0) {
    elements.shareUserSelect.replaceChildren(new Option("No other users found", ""));
    elements.shareUserSelect.disabled = true;
    return;
  }

  elements.shareUserSelect.replaceChildren(...users.map((user) => {
    const label = user.displayName ? `${user.displayName} (${user.username})` : user.username;
    return new Option(label || user.id, user.id);
  }));
  elements.shareUserSelect.disabled = false;
}

function updateShareScopeFields() {
  const isUserScope = elements.shareScopeUser.checked;
  elements.shareUserField.classList.toggle("hidden", !isUserScope);
  elements.shareUserSelect.required = isUserScope;
}

async function showShareDialog(entry) {
  state.activeEntry = entry;
  elements.shareTargetName.textContent = getEntryName(entry);
  elements.shareScopeUser.checked = true;
  elements.shareScopeServer.checked = false;
  elements.shareUserSelect.replaceChildren(new Option("Loading users...", ""));
  elements.shareUserSelect.disabled = true;
  updateShareScopeFields();
  elements.shareDialog.showModal();

  try {
    renderDirectoryUsers(await loadDirectoryUsers());
  } catch (error) {
    elements.shareUserSelect.replaceChildren(new Option(error.message, ""));
    elements.shareUserSelect.disabled = true;
  }
}

async function createShare(entry, scope, targetUserId = null) {
  const body = scope === "server"
    ? { scope: "server", permission: "viewer" }
    : { scope: "user", targetUserId, permission: "viewer" };

  await request(`/user-files/${encodeURIComponent(getEntryId(entry))}/shares`, {
    method: "POST",
    body: JSON.stringify(body)
  });
  showNotice(scope === "server" ? "Shared with everyone" : "Shared with user");
}

async function revokeShare(entry) {
  const shareId = entry.sharedContext?.shareId;
  const entryId = entry.sharedContext?.entryId || getEntryId(entry);
  if (!shareId || !entryId) return;

  await request(`/user-files/${encodeURIComponent(entryId)}/shares/${encodeURIComponent(shareId)}`, { method: "DELETE" });
  showNotice("Share revoked");
  await loadSharedByMe();
}

function showRenameDialog(entry) {
  state.activeEntry = entry;
  elements.renameInput.value = getEntryName(entry);
  elements.renameDialog.showModal();
  elements.renameInput.select();
}

async function renameEntry(entry, name) {
  await request(`/user-files/${encodeURIComponent(getEntryId(entry))}`, {
    method: "PATCH",
    body: JSON.stringify({ name, parentId: entry.parentId ?? null })
  });
  showNotice("Renamed");
  await loadEntries();
}

async function showMoveDialog(entry) {
  state.activeEntry = entry;
  elements.moveDestination.replaceChildren(new Option("Loading folders...", ""));
  elements.moveDestination.disabled = true;
  elements.moveSubmit.disabled = true;
  elements.moveDialog.showModal();

  try {
    const folders = await loadFolderOptions(entry);
    elements.moveDestination.replaceChildren(...folders.map((folder) => new Option(folder.label, folder.id || "")));
    elements.moveDestination.disabled = false;
    elements.moveSubmit.disabled = folders.length === 0;
  } catch (error) {
    elements.moveDestination.replaceChildren(new Option(error.message, ""));
  }
}

async function loadFolderOptions(entryToMove) {
  const currentParentId = normalizeParentId(entryToMove.parentId);
  const excludedIds = new Set();
  const entryId = getEntryId(entryToMove);

  if (entryToMove.type === "folder") {
    excludedIds.add(entryId);
    getDescendantFolderIds(entryId, state.allEntries).forEach((id) => excludedIds.add(id));
  }

  const folders = [];
  if (currentParentId !== ROOT_ID) folders.push({ id: ROOT_ID, label: "Files" });

  if (state.hasAllEntries) {
    addFolderOptionsFromEntries(folders, state.allEntries, ROOT_ID, 1, currentParentId, excludedIds);
    return folders;
  }

  async function visit(parentId, depth) {
    const query = parentId ? `?parentId=${encodeURIComponent(parentId)}` : "";
    const data = await request(`/user-files${query}`);
    const childFolders = (Array.isArray(data.entries) ? data.entries : [])
      .filter((entry) => entry.type === "folder" && !excludedIds.has(getEntryId(entry)) && normalizeParentId(getEntryId(entry)) !== currentParentId)
      .sort((left, right) => getEntryName(left).localeCompare(getEntryName(right), undefined, { sensitivity: "base" }));

    for (const folder of childFolders) {
      const folderId = getEntryId(folder);
      if (folderId !== currentParentId) folders.push({ id: folderId, label: `${"  ".repeat(depth)}${getEntryName(folder)}` });
      await visit(folderId, depth + 1);
    }
  }

  await visit(ROOT_ID, 1);
  return folders;
}

function addFolderOptionsFromEntries(folders, allEntries, parentId, depth, currentParentId, excludedIds) {
  allEntries
    .filter((entry) => entry.type === "folder" && normalizeParentId(entry.parentId) === normalizeParentId(parentId))
    .filter((entry) => !excludedIds.has(getEntryId(entry)) && getEntryId(entry) !== currentParentId)
    .sort((left, right) => getEntryName(left).localeCompare(getEntryName(right), undefined, { sensitivity: "base" }))
    .forEach((folder) => {
      const folderId = getEntryId(folder);
      folders.push({ id: folderId, label: `${"  ".repeat(depth)}${getEntryName(folder)}` });
      addFolderOptionsFromEntries(folders, allEntries, folderId, depth + 1, currentParentId, excludedIds);
    });
}

function getDescendantFolderIds(folderId, allEntries) {
  const childFolders = (Array.isArray(allEntries) ? allEntries : [])
    .filter((entry) => entry.type === "folder" && normalizeParentId(entry.parentId) === folderId);

  return childFolders.flatMap((folder) => {
    const childId = getEntryId(folder);
    return [childId, ...getDescendantFolderIds(childId, allEntries)];
  });
}

async function moveEntry(entry, parentId) {
  await moveEntries([entry], parentId);
}

async function moveEntries(entriesToMove, parentId) {
  const entries = entriesToMove.filter(Boolean);
  if (entries.length === 0) return;

  await Promise.all(entries.map((entry) => request(`/user-files/${encodeURIComponent(getEntryId(entry))}`, {
    method: "PATCH",
    body: JSON.stringify({ name: getEntryName(entry), parentId: parentId || null })
  })));
  showNotice(entries.length === 1 ? "Moved" : `${entries.length} items moved`);
  clearSelection();
  await loadEntries();
}

function showDeleteDialog(entriesToDelete) {
  const entries = Array.isArray(entriesToDelete) ? entriesToDelete : [entriesToDelete];
  state.pendingDeleteEntries = entries.filter(Boolean);
  const folderCount = state.pendingDeleteEntries.filter((entry) => entry.type === "folder").length;
  const fileCount = state.pendingDeleteEntries.length - folderCount;

  if (state.pendingDeleteEntries.length === 1) {
    const entry = state.pendingDeleteEntries[0];
    const name = getEntryName(entry);
    const isFolder = entry.type === "folder";
    elements.deleteTitle.textContent = isFolder ? "Delete folder" : "Delete file";
    elements.deleteMessage.textContent = isFolder
      ? `Delete "${name}" and everything inside it? This cannot be undone.`
      : `Delete "${name}"? This cannot be undone.`;
  } else {
    elements.deleteTitle.textContent = "Delete selected items";
    const folderWarning = folderCount > 0 ? " Folder contents will also be deleted." : "";
    elements.deleteMessage.textContent = `Delete ${state.pendingDeleteEntries.length} selected items (${folderCount} folder${folderCount === 1 ? "" : "s"}, ${fileCount} file${fileCount === 1 ? "" : "s"})?${folderWarning}`;
  }

  elements.deleteDialog.showModal();
}

async function deleteEntries(entriesToDelete) {
  const entries = entriesToDelete.filter(Boolean);
  for (const entry of entries) {
    await request(`/user-files/${encodeURIComponent(getContentEntryId(entry))}`, { method: "DELETE" });
  }
  clearSelection();
  showNotice(entries.length === 1 ? `${entries[0].type === "folder" ? "Folder" : "File"} deleted` : `${entries.length} items deleted`);
  await loadEntries();
}

function setViewMode(viewMode) {
  state.viewMode = viewMode;
  localStorage.setItem("nebula-files-view", viewMode);
  renderViewMode();
}

function handleDialogSubmit(event, handler, busyButton, busyLabel) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") {
    event.currentTarget.closest("dialog").close();
    return;
  }
  handler(busyButton, busyLabel);
}

function setupContextMenu() {
  elements.contextMenu.className = "context-menu hidden";
  elements.contextMenu.setAttribute("role", "menu");
  document.body.append(elements.contextMenu);
}

function hideContextMenu() {
  elements.contextMenu.classList.add("hidden");
  elements.contextMenu.replaceChildren();
}

function contextMenuButton(label, handler, options = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.role = "menuitem";
  button.textContent = label;
  button.disabled = Boolean(options.disabled);
  if (options.danger) button.classList.add("danger");
  button.addEventListener("click", () => {
    if (button.disabled) return;
    hideContextMenu();
    handler();
  });
  return button;
}

function contextMenuSeparator() {
  const separator = document.createElement("span");
  separator.className = "context-menu-separator";
  return separator;
}

function positionContextMenu(event) {
  elements.contextMenu.classList.remove("hidden");
  const { innerWidth, innerHeight } = window;
  const rect = elements.contextMenu.getBoundingClientRect();
  const left = Math.min(event.clientX, innerWidth - rect.width - 8);
  const top = Math.min(event.clientY, innerHeight - rect.height - 8);
  elements.contextMenu.style.left = `${Math.max(8, left)}px`;
  elements.contextMenu.style.top = `${Math.max(8, top)}px`;
}

function showEntryContextMenu(event, entry) {
  event.preventDefault();
  event.stopPropagation();

  const entryId = getEntryId(entry);
  if (!state.selectedIds.has(entryId)) selectOnlyEntry(entryId);

  const selectedEntries = getSelectedEntries();
  const singleEntry = selectedEntries.length === 1 ? selectedEntries[0] : null;
  const singleFile = singleEntry?.type === "file" ? singleEntry : null;
  const canMutateSingle = Boolean(singleEntry && entryCanMutate(singleEntry));
  const canRevokeSingle = Boolean(singleEntry?.sharedContext?.type === "by-me");

  const menuItems = [
    contextMenuButton("Open", () => openEntry(singleEntry), { disabled: !singleEntry }),
    contextMenuButton("Download", () => downloadFile(singleFile), { disabled: !singleFile }),
    contextMenuSeparator()
  ];

  if (isMyFilesView()) {
    menuItems.push(
      contextMenuButton("Share", () => showShareDialog(singleEntry), { disabled: !canMutateSingle }),
      contextMenuButton("Rename", () => showRenameDialog(singleEntry), { disabled: !canMutateSingle }),
      contextMenuButton("Move", () => showMoveDialog(singleEntry), { disabled: !canMutateSingle }),
      contextMenuButton("Delete", () => showDeleteDialog(selectedEntries), { danger: true, disabled: selectedEntries.length === 0 })
    );
  } else if (isSharedByMeView()) {
    menuItems.push(contextMenuButton("Revoke", () => revokeShare(singleEntry), { danger: true, disabled: !canRevokeSingle }));
  }

  menuItems.push(contextMenuSeparator(), contextMenuButton("Select all", selectAllEntries));
  elements.contextMenu.replaceChildren(...menuItems);
  positionContextMenu(event);
}

function showBackgroundContextMenu(event) {
  if (event.target.closest("article") || event.target.closest("button") || event.target.closest("input") || event.target.closest("select")) return;
  event.preventDefault();

  const menuItems = [];
  if (isMyFilesView()) {
    menuItems.push(
      contextMenuButton("New folder", showCreateFolderDialog),
      contextMenuButton("Upload", () => elements.fileUploadInput.click()),
      contextMenuSeparator()
    );
  }

  menuItems.push(
    contextMenuButton("Select all", selectAllEntries, { disabled: getVisibleEntries().length === 0 }),
    contextMenuButton("Refresh", () => reloadCurrentView())
  );
  elements.contextMenu.replaceChildren(...menuItems);
  positionContextMenu(event);
}

function hasExternalFiles(dataTransfer) {
  return Array.from(dataTransfer?.types || []).includes("Files");
}

function hasInternalEntry(dataTransfer) {
  return state.draggedEntryIds.length > 0 || Array.from(dataTransfer?.types || []).includes("application/x-nebula-entry-id");
}

function getDraggedEntries() {
  return state.draggedEntryIds.map(getEntryByAnyId).filter(Boolean);
}

function canMoveEntryTo(entry, parentId) {
  if (!entry) return false;
  const nextParentId = normalizeParentId(parentId);
  if (normalizeParentId(entry.parentId) === nextParentId) return false;

  if (entry.type === "folder") {
    const entryId = getEntryId(entry);
    if (nextParentId === entryId) return false;
    if (getDescendantFolderIds(entryId, state.allEntries).includes(nextParentId)) return false;
  }

  return true;
}

function canMoveEntriesTo(entries, parentId) {
  return entries.length > 0 && entries.every((entry) => canMoveEntryTo(entry, parentId));
}

function clearDropTargets() {
  document.querySelectorAll(".is-drop-target").forEach((target) => target.classList.remove("is-drop-target"));
  elements.contentPanel.classList.remove("is-moving");
}

function clearEntryDragState() {
  state.draggedEntryIds = [];
  clearDropTargets();
  document.querySelectorAll(".is-drag-source").forEach((target) => target.classList.remove("is-drag-source"));
}

function handleFolderDragOver(event, parentId, targetElement) {
  if (!hasInternalEntry(event.dataTransfer)) return;
  event.preventDefault();
  event.stopPropagation();

  const entries = getDraggedEntries();
  if (!canMoveEntriesTo(entries, parentId)) {
    event.dataTransfer.dropEffect = "none";
    targetElement.classList.remove("is-drop-target");
    return;
  }

  event.dataTransfer.dropEffect = "move";
  targetElement.classList.add("is-drop-target");
}

async function handleFolderDrop(event, parentId, targetElement) {
  if (!hasInternalEntry(event.dataTransfer)) return;
  event.preventDefault();
  event.stopPropagation();

  const entries = getDraggedEntries();
  if (!canMoveEntriesTo(entries, parentId)) {
    targetElement.classList.remove("is-drop-target");
    clearEntryDragState();
    return;
  }

  targetElement.classList.remove("is-drop-target");

  try {
    await moveEntries(entries, parentId);
  } catch (error) {
    showNotice(error.message, "error");
  } finally {
    clearEntryDragState();
  }
}

setupContextMenu();
elements.newFolderButton.addEventListener("click", showCreateFolderDialog);
elements.backButton.addEventListener("click", goBack);
elements.emptyNewFolderButton.addEventListener("click", showCreateFolderDialog);
elements.myFilesViewButton.addEventListener("click", () => loadEntries(ROOT_ID));
elements.sharedWithMeViewButton.addEventListener("click", loadSharedWithMe);
elements.sharedByMeViewButton.addEventListener("click", loadSharedByMe);
elements.retryButton.addEventListener("click", reloadCurrentView);
elements.fileUploadInput.addEventListener("change", (event) => uploadFiles(event.target.files));
elements.emptyFileUploadInput.addEventListener("change", (event) => uploadFiles(event.target.files));
elements.gridViewButton.addEventListener("click", () => setViewMode("grid"));
elements.listViewButton.addEventListener("click", () => setViewMode("list"));
elements.sortSelect.value = state.sortBy;
elements.sortSelect.addEventListener("change", (event) => {
  state.sortBy = event.target.value;
  localStorage.setItem("nebula-files-sort", state.sortBy);
  renderEntries();
});
elements.searchInput.addEventListener("input", (event) => {
  state.searchQuery = event.target.value;
  render();
});
elements.openSelectedButton.addEventListener("click", () => withSingleSelected(openEntry));
elements.shareSelectedButton.addEventListener("click", () => withSingleSelected(showShareDialog));
elements.renameSelectedButton.addEventListener("click", () => withSingleSelected(showRenameDialog));
elements.moveSelectedButton.addEventListener("click", () => withSingleSelected(showMoveDialog));
elements.deleteSelectedButton.addEventListener("click", () => showDeleteDialog(getSelectedEntries()));
elements.clearSelectionButton.addEventListener("click", clearSelection);
elements.previewCloseButton.addEventListener("click", () => elements.previewDialog.close());
elements.previewDialog.addEventListener("close", () => {
  clearPreviewUrl();
  elements.previewBody.replaceChildren();
});
elements.deleteDialog.addEventListener("close", () => {
  state.pendingDeleteEntries = [];
});
elements.shareScopeUser.addEventListener("change", updateShareScopeFields);
elements.shareScopeServer.addEventListener("change", updateShareScopeFields);
elements.contentPanel.addEventListener("contextmenu", showBackgroundContextMenu);

elements.contentPanel.addEventListener("dragenter", (event) => {
  if (hasInternalEntry(event.dataTransfer)) {
    elements.contentPanel.classList.add("is-moving");
    return;
  }

  if (!hasExternalFiles(event.dataTransfer)) return;
  event.preventDefault();
  state.dragDepth += 1;
  elements.dropOverlayTitle.textContent = "Drop files to upload";
  elements.contentPanel.classList.add("is-dragging");
});
elements.contentPanel.addEventListener("dragover", (event) => {
  if (hasInternalEntry(event.dataTransfer)) {
    event.preventDefault();
    const entries = getDraggedEntries();
    if (!canMoveEntriesTo(entries, state.currentFolderId)) {
      event.dataTransfer.dropEffect = "none";
      return;
    }

    event.dataTransfer.dropEffect = "move";
    elements.contentPanel.classList.add("is-moving");
    return;
  }

  if (!hasExternalFiles(event.dataTransfer)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
});
elements.contentPanel.addEventListener("dragleave", (event) => {
  if (hasInternalEntry(event.dataTransfer)) {
    if (!elements.contentPanel.contains(event.relatedTarget)) elements.contentPanel.classList.remove("is-moving");
    return;
  }

  if (!hasExternalFiles(event.dataTransfer)) return;
  state.dragDepth = Math.max(0, state.dragDepth - 1);
  if (state.dragDepth === 0) elements.contentPanel.classList.remove("is-dragging");
});
elements.contentPanel.addEventListener("drop", async (event) => {
  if (hasInternalEntry(event.dataTransfer)) {
    event.preventDefault();
    const entries = getDraggedEntries();
    if (!canMoveEntriesTo(entries, state.currentFolderId)) {
      clearEntryDragState();
      return;
    }

    try {
      await moveEntries(entries, state.currentFolderId);
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      clearEntryDragState();
    }
    return;
  }

  if (!event.dataTransfer?.files.length) return;
  event.preventDefault();
  state.dragDepth = 0;
  elements.contentPanel.classList.remove("is-dragging");
  uploadFiles(event.dataTransfer.files);
});

document.addEventListener("drop", () => {
  if (state.draggedEntryIds.length > 0) clearEntryDragState();
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".context-menu")) hideContextMenu();
});
document.addEventListener("scroll", hideContextMenu, true);
window.addEventListener("resize", hideContextMenu);

document.addEventListener("keydown", (event) => {
  if (document.querySelector("dialog[open]") || event.target.matches("input, select, textarea")) return;

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
    event.preventDefault();
    selectAllEntries();
    return;
  }

  if (event.key === "Escape" && state.selectedIds.size > 0) {
    hideContextMenu();
    clearSelection();
  }

  if (event.key === "Delete" && state.selectedIds.size > 0) {
    event.preventDefault();
    showDeleteDialog(getSelectedEntries());
  }

  if (event.key === "Enter" && state.selectedIds.size === 1) {
    event.preventDefault();
    withSingleSelected(openEntry);
  }
});

elements.createFolderForm.addEventListener("submit", (event) => handleDialogSubmit(event, async (button, label) => {
  const name = elements.folderNameInput.value.trim();
  if (!name) return;
  setBusy(button, true, label);
  try {
    await createFolder(name);
    elements.createFolderDialog.close();
  } catch (error) {
    showNotice(error.message, "error");
  } finally {
    setBusy(button, false);
  }
}, elements.createFolderSubmit, "Creating"));

elements.renameForm.addEventListener("submit", (event) => handleDialogSubmit(event, async (button, label) => {
  const name = elements.renameInput.value.trim();
  if (!name || !state.activeEntry) return;
  setBusy(button, true, label);
  try {
    await renameEntry(state.activeEntry, name);
    elements.renameDialog.close();
  } catch (error) {
    showNotice(error.message, "error");
  } finally {
    setBusy(button, false);
  }
}, elements.renameSubmit, "Saving"));

elements.moveForm.addEventListener("submit", (event) => handleDialogSubmit(event, async (button, label) => {
  if (!state.activeEntry) return;
  setBusy(button, true, label);
  try {
    await moveEntry(state.activeEntry, elements.moveDestination.value || null);
    elements.moveDialog.close();
  } catch (error) {
    showNotice(error.message, "error");
  } finally {
    setBusy(button, false);
  }
}, elements.moveSubmit, "Moving"));

elements.shareForm.addEventListener("submit", (event) => handleDialogSubmit(event, async (button, label) => {
  if (!state.activeEntry) return;
  const scope = elements.shareScopeServer.checked ? "server" : "user";
  const targetUserId = elements.shareUserSelect.value;
  if (scope === "user" && !targetUserId) {
    showNotice("Choose a user to share with", "error");
    return;
  }

  setBusy(button, true, label);
  try {
    await createShare(state.activeEntry, scope, targetUserId);
    elements.shareDialog.close();
  } catch (error) {
    showNotice(error.message, "error");
  } finally {
    setBusy(button, false);
  }
}, elements.shareSubmit, "Sharing"));

elements.deleteForm.addEventListener("submit", (event) => handleDialogSubmit(event, async (button, label) => {
  if (state.pendingDeleteEntries.length === 0) return;
  setBusy(button, true, label);
  try {
    await deleteEntries(state.pendingDeleteEntries);
    elements.deleteDialog.close();
  } catch (error) {
    showNotice(error.message, "error");
  } finally {
    setBusy(button, false);
  }
}, elements.deleteSubmit, "Deleting"));

loadEntries();