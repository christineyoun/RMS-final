/** External-source cue drawn as geometry, never as a platform font glyph. */
export function SourceLinkArrow() {
  return (
    <svg
      data-rms-source-link-arrow
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'inline-block', verticalAlign: '-0.12em', flexShrink: 0 }}
    >
      <path d="M4 12 12 4M5.5 4H12v6.5" />
    </svg>
  );
}

/** The PDF capture serializes SVG independently of its parent link. Preserve
 * the link's resolved color in the export clone before that serialization. */
export function resolveSourceLinkArrowColorsForPdf(clonedPage: HTMLElement) {
  const view = clonedPage.ownerDocument.defaultView;
  if (!view) return;
  clonedPage.querySelectorAll<SVGSVGElement>('svg[data-rms-source-link-arrow]').forEach(arrow => {
    const color = view.getComputedStyle(arrow).color;
    if (color) arrow.setAttribute('stroke', color);
  });
}
