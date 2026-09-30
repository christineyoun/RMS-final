# RMS merged v2 fixes

This revision keeps the merged UI code and fixes functional regressions observed in AI Studio preview.

## Fixed
- USDA FAS PSD Wheat mapping restored:
  - Production: attributeId 28
  - Domestic Consumption: attributeId 125
  - Ending Stocks: attributeId 176
  - Exports: attributeId 88
  - Area Harvested: attributeId 4
  - Yield: attributeId 184
- Wheat AI recommendation no longer collapses to one item per factor group when Google Search grounding is unavailable.
  - It now supplements grounded results with verified U.S. Wheat + AMIS evidence, up to 3 items per group.
- Wheat Market Intelligence no longer becomes empty when `GEMINI_API_KEY` is unavailable.
  - It always builds verified cards from U.S. Wheat Associates, AMIS, and USDA FAS PSD.
  - When `GEMINI_API_KEY` is configured, current Google Search-grounded items are added and deduplicated, capped at 4.
- Origin Radar source footer deduplicates individual source names (prevents repeated `AMIS`).
- Month-only publication dates such as `2026-09` remain month precision in Market Intelligence.

## UI note
The main dashboard `OverviewTerminal.tsx` is byte-for-byte the same as the Youngin base version. In AI Studio, keeping the editor/file pane open narrows the Preview iframe and triggers the existing responsive breakpoints (3 columns -> 2 columns, side-by-side -> vertical). Use the full-width Preview / collapse the editor pane to compare the original layout at the same viewport width.

## Secrets
- `USDA_FAS_API_KEY`: required for live USDA PSD.
- `PORT_COST_USD_PER_MT`: required for the Wheat landed-cost port assumption.
- `GEMINI_API_KEY`: needed for Google Search grounding. Without it, Wheat AI / Market Intelligence now still render verified U.S. Wheat + AMIS + USDA items, but current web-search augmentation is unavailable.
