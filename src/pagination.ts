// Standard screenplay page geometry: US Letter, 12pt Courier at 6 lines/inch.
// With 1" top and bottom margins the text area is 9", i.e. 54 lines per page.
// Both panes key off this so their page boundaries stay in step — the editor
// draws a dashed guide every LINES_PER_PAGE lines of source, and the preview
// fills each rendered sheet up to LINES_PER_PAGE lines before spilling over.
export const LINES_PER_PAGE = 54
