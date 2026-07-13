const API_BASE = "/api/addons/files";
const ROOT_ID = null;

const state = {
  currentFolderId: ROOT_ID,
  entries: [],
  allEntries: [],
  hasAllEntries: false,
  currentFolder: null,
  breadcrumbs: [{ id: ROOT_ID, name: "Files" }],
  navigationHistory: [{ id: ROOT_ID, breadcrumbs: [{ id: ROOT_ID, name: "Files" }] }],
  navigationIndex: 0,
  viewMode: localStorage.getItem("nebula-files-view") || "grid",
  sortBy: localStorage.getItem("nebula-files-sort") || "name-asc",
  searchQuery: "",
  selectedIds: new Set(),
  activeEntry: null,
  pendingDeleteEntries: [],
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
  dropOverlay: document.querySelector("#dropOverlay"),
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
  newFolderButton: document.querySelector("#newFolderButton"),
  notice: document.querySelector("#notice"),
  openSelectedButton: document.querySelector("#openSelectedButton"),
  renameDialog: document.querySelector("#renameDialog"),
  renameForm: document.querySelector("#renameForm"),
  renameInput: document.querySelector("#renameInput"),
  renameSubmit: document.querySelector("#renameSubmit"),
  renameSelectedButton: document.querySelector("#renameSelectedButton"),
  retryButton: document.querySelector("#retryButton"),
  searchInput: document.querySelector("#searchInput"),
  selectionBar: document.querySelector("#selectionBar"),
  selectionSummary: document.querySelector("#selectionSummary"),
  sortSelect: document.querySelector("#sortSelect")
};

function getEntryId(entry) {
  return entry.id || entry._id;
}

function getEntryName(entry) {
  return entry.name || entry.filename || "Untitled";
}

function normalizeParentId(parentId) {
  return parentId || ROOT_ID;
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

function iconLabelFor(entry) {
  if (entry.type === "folder") return "DIR";
  const name = getEntryName(entry);
  const extension = getEntryExtension(entry).slice(0, 4) || (name.includes(".") ? name.split(".").pop().slice(0, 4) : "FILE");
  return extension || "FILE";
}

function iconClassFor(entry) {
  if (entry.type === "folder") return "folder";
  const mimeType = entry.mimeType || "";
  const extension = getEntryExtension(entry);

  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.includes("zip") || ["zip", "rar", "7z", "tar", "gz"].includes(extension)) return "archive";
  if (["js", "ts", "tsx", "jsx", "html", "css", "json", "md", "py", "rb", "go", "rs"].includes(extension)) return "code";
  return "file";
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
  const response = await fetch(`${API_BASE}${path}`, {
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

function render() {
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
  elements.folderSummary.textContent = `${folderName} - ${folderCount} folder${folderCount === 1 ? "" : "s"}, ${fileCount} file${fileCount === 1 ? "" : "s"}${filtered}`;
  elements.dropTargetLabel.textContent = folderName;
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
    elements.breadcrumbs.append(button);
  });
}

function renderNavigationControls() {
  elements.backButton.disabled = state.navigationIndex === 0;
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
    elements.emptyTitle.textContent = "This folder is empty";
    elements.emptyMessage.textContent = "Create a folder or upload files to get started.";
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

  const selectLabel = document.createElement("label");
  selectLabel.className = "entry-select";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = state.selectedIds.has(entryId);
  checkbox.setAttribute("aria-label", `Select ${getEntryName(entry)}`);
  checkbox.addEventListener("click", (event) => event.stopPropagation());
  checkbox.addEventListener("change", () => toggleSelection(entryId, checkbox.checked));
  selectLabel.append(checkbox);

  const icon = document.createElement("span");
  icon.className = `entry-icon ${iconClassFor(entry)}`;
  icon.textContent = iconLabelFor(entry);

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
  details.append(detailChip(`Modified ${formatDate(entry.updatedAt || entry.createdAt)}`));

  main.append(title, subtitle, details);

  const actions = document.createElement("div");
  actions.className = "entry-actions";
  actions.append(actionButton("Open", () => openEntry(entry)));
  if (entry.type === "file") actions.append(actionButton("Download", () => downloadFile(entry)));
  actions.append(
    actionButton("Rename", () => showRenameDialog(entry)),
    actionButton("Move", () => showMoveDialog(entry)),
    actionButton("Delete", () => showDeleteDialog(entry), "danger")
  );

  card.addEventListener("click", (event) => {
    if (event.target.closest("button") || event.target.closest("input") || event.target.closest("label")) return;
    toggleSelection(entryId);
  });
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

function getSelectedEntries() {
  return [...state.selectedIds].map(getEntryById).filter(Boolean);
}

function toggleSelection(entryId, selected = !state.selectedIds.has(entryId)) {
  if (selected) {
    state.selectedIds.add(entryId);
  } else {
    state.selectedIds.delete(entryId);
  }
  renderEntries();
  renderSelectionBar();
}

function clearSelection() {
  state.selectedIds.clear();
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
  elements.renameSelectedButton.disabled = selectedCount !== 1;
  elements.moveSelectedButton.disabled = selectedCount !== 1;
}

function withSingleSelected(action) {
  const [entry] = getSelectedEntries();
  if (!entry || state.selectedIds.size !== 1) return;
  action(entry);
}

async function openEntry(entry) {
  if (entry.type === "folder") {
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

  await openFile(entry);
}

async function openFile(entry) {
  try {
    const response = await fetch(`${API_BASE}/user-files/${encodeURIComponent(getEntryId(entry))}`, { credentials: "same-origin" });
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
    const response = await fetch(`${API_BASE}/user-files/${encodeURIComponent(getEntryId(entry))}`, { credentials: "same-origin" });
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
  await request(`/user-files/${encodeURIComponent(getEntryId(entry))}`, {
    method: "PATCH",
    body: JSON.stringify({ name: getEntryName(entry), parentId: parentId || null })
  });
  showNotice("Moved");
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
    await request(`/user-files/${encodeURIComponent(getEntryId(entry))}`, { method: "DELETE" });
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

elements.newFolderButton.addEventListener("click", showCreateFolderDialog);
elements.backButton.addEventListener("click", goBack);
elements.emptyNewFolderButton.addEventListener("click", showCreateFolderDialog);
elements.retryButton.addEventListener("click", () => loadEntries());
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
elements.renameSelectedButton.addEventListener("click", () => withSingleSelected(showRenameDialog));
elements.moveSelectedButton.addEventListener("click", () => withSingleSelected(showMoveDialog));
elements.deleteSelectedButton.addEventListener("click", () => showDeleteDialog(getSelectedEntries()));
elements.clearSelectionButton.addEventListener("click", clearSelection);

elements.contentPanel.addEventListener("dragenter", (event) => {
  if (!event.dataTransfer?.types.includes("Files")) return;
  event.preventDefault();
  state.dragDepth += 1;
  elements.contentPanel.classList.add("is-dragging");
});
elements.contentPanel.addEventListener("dragover", (event) => {
  if (!event.dataTransfer?.types.includes("Files")) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
});
elements.contentPanel.addEventListener("dragleave", (event) => {
  if (!event.dataTransfer?.types.includes("Files")) return;
  state.dragDepth = Math.max(0, state.dragDepth - 1);
  if (state.dragDepth === 0) elements.contentPanel.classList.remove("is-dragging");
});
elements.contentPanel.addEventListener("drop", (event) => {
  if (!event.dataTransfer?.files.length) return;
  event.preventDefault();
  state.dragDepth = 0;
  elements.contentPanel.classList.remove("is-dragging");
  uploadFiles(event.dataTransfer.files);
});

document.addEventListener("keydown", (event) => {
  if (document.querySelector("dialog[open]") || event.target.matches("input, select, textarea")) return;

  if (event.key === "Escape" && state.selectedIds.size > 0) {
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

elements.deleteForm.addEventListener("submit", (event) => handleDialogSubmit(event, async (button, label) => {
  if (state.pendingDeleteEntries.length === 0) return;
  setBusy(button, true, label);
  try {
    await deleteEntries(state.pendingDeleteEntries);
    elements.deleteDialog.close();
  } catch (error) {
    showNotice(error.message, "error");
  } finally {
    state.pendingDeleteEntries = [];
    setBusy(button, false);
  }
}, elements.deleteSubmit, "Deleting"));

loadEntries();