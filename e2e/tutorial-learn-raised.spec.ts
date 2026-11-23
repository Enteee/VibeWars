import { test } from "@playwright/test";

import { RAISED_MAP, learnTests } from "./helpers/tutorial.js";

test.describe("the first-time tutorial (#3218)", () => {
  learnTests(RAISED_MAP);
});
