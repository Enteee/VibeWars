import { test } from "@playwright/test";

import { FLAT_MAP, learnTests } from "./helpers/tutorial.js";

test.describe("the first-time tutorial (#3218)", () => {
  learnTests(FLAT_MAP);
});
