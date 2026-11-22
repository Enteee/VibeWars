/**
 * A Pixel 8a (#3775), as Playwright's "Pixel 7" describes it: the same
 * CSS size, touch only. Spread into `test.use`; not a `devices[...]`
 * entry, whose `defaultBrowserType` `test.use` refuses.
 */
const PIXEL_8A = { deviceScaleFactor: 2.625, isMobile: true, hasTouch: true } as const;

/** A Pixel 8a held upright. */
export const PIXEL_8A_PORTRAIT = { ...PIXEL_8A, viewport: { width: 412, height: 915 } } as const;

/** A Pixel 8a turned on its side. */
export const PIXEL_8A_LANDSCAPE = { ...PIXEL_8A, viewport: { width: 915, height: 412 } } as const;
