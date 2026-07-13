# Changelog

## 2.5.1 - 2026-07-13

- Added Share to the selected-item action bar so folders can be shared from the same Explorer-style workflow as files.

## 2.5.0 - 2026-07-13

- Added My Files, Shared with me, and Shared by me views.
- Added sharing from My Files to another Nebula user or everyone on the server using Nebula core sharing APIs.
- Added viewer-only shared-with-me browsing, including opening/downloading shared files and navigating shared folders.
- Added shared-by-me share listing with revoke actions.
- Added compatibility with Nebula core's `{ share, entry }` sharing response shape.
- Changed the default browser view to list view.
- Kept share enforcement delegated to Nebula core; the add-on only renders the sharing UI and calls core APIs.

## 0.2.0 - 2026-07-13

- Added in-app file previews for common file types, including images, PDFs, media, text, code, JSON, CSV, Markdown, XML, and YAML.
- Added Explorer-style file type icons and badges for common document, media, archive, code, and folder types.
- Added drag-and-drop upload support and preserved uploaded file contents in the local preview server.
- Added drag-and-drop moving for existing files and folders, including moving multiple selected items together.
- Added Explorer-style selection controls: single click, Ctrl-click, Shift-click range selection, and Ctrl+A select all.
- Added right-click context menus for files, folders, and empty folder space.
- Added open-in-tab and download actions from the preview dialog.