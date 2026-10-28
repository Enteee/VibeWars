/**
 * What the build tells the licences page (#1242): shared by the build plugin
 * (`apps/web/plugins/licences.ts`, Node) and the page, so it imports nothing.
 */

/**
 * An npm package whose code is in the built client (#1242), as the build
 * writes it to `LICENCES_FILE` (`apps/web/plugins/licences.ts`).
 */
export interface BundledLicence {
  readonly name: string;
  readonly version: string;
  /** SPDX identifier, as the package declares it. */
  readonly spdx: string;
  /** Its source: the repository, else its homepage, else its npm page. */
  readonly url: string;
  /** Its LICENSE and NOTICE files, verbatim. */
  readonly text: string;
}

/** The build's list of bundled packages, under the base URL. */
export const LICENCES_FILE = "licences.json";
