// @ts-check

/**
 * Player-facing text goes through `t()` (#2648, ADR-0050). Reports a
 * string or template literal with a letter in it where the page shows
 * it: `h()`'s text, `button()`'s label, an assignment to `textContent`,
 * `innerText`, `title`, `placeholder` or `alt`, `setAttribute` of
 * `aria-label`, `title` or `placeholder`, and an exported `const` in
 * `ui/` named like text (`*_LINE`, `*_HINT`...). It looks through `?:`,
 * `||`, `??` and template literals. Text with no letter (`"×"`, `"3"`)
 * passes.
 */

/** @typedef {import("eslint").Rule.Node} Node */

const MESSAGE = "Player-facing text goes through t() and i18n/en.ts";
const SHOWN_PROPERTIES = new Set(["textContent", "innerText", "title", "placeholder", "alt"]);
const SHOWN_ATTRIBUTES = new Set(["aria-label", "title", "placeholder"]);
const TEXT_CONSTANT = /_(LINE|HINT|MESSAGE|LABEL|NOTE|TEXT|GOAL)$/;
const LETTER = /\p{L}/u;

/**
 * The literals with a letter in them that `node` evaluates to.
 * @param {Node | null | undefined} node
 * @returns {Node[]}
 */
function rawText(node) {
  if (node == null) {
    return [];
  }
  switch (node.type) {
    case "Literal":
      return typeof node.value === "string" && LETTER.test(node.value) ? [node] : [];
    case "TemplateLiteral":
      return node.quasis.some((quasi) => LETTER.test(quasi.value.cooked ?? quasi.value.raw))
        ? [node]
        : node.expressions.flatMap((expression) => rawText(expression));
    case "ConditionalExpression":
      return [...rawText(node.consequent), ...rawText(node.alternate)];
    case "LogicalExpression":
      return [...rawText(node.left), ...rawText(node.right)];
    default:
      return [];
  }
}

/**
 * The name `node` is known by, if it is an identifier or a plain property.
 * @param {Node} node
 * @returns {string | undefined}
 */
function nameOf(node) {
  if (node.type === "Identifier") {
    return node.name;
  }
  if (node.type === "MemberExpression" && !node.computed && node.property.type === "Identifier") {
    return node.property.name;
  }
  return undefined;
}

/** @type {import("eslint").Rule.RuleModule} */
export const noRawUiText = {
  meta: {
    type: "problem",
    docs: { description: "Player-facing text goes through t()" },
    schema: [],
    messages: { raw: MESSAGE },
  },
  create(context) {
    const inUi = context.filename.replaceAll("\\", "/").includes("/ui/");
    /** @param {Node | null | undefined} node */
    const report = (node) => {
      for (const found of rawText(node)) {
        context.report({ node: found, messageId: "raw" });
      }
    };
    return {
      CallExpression(node) {
        const callee = nameOf(node.callee);
        const [first, second, third] = node.arguments;
        if (node.callee.type === "Identifier" && callee === "h") {
          report(third);
        } else if (node.callee.type === "Identifier" && callee === "button") {
          report(first);
        } else if (
          callee === "setAttribute" &&
          first?.type === "Literal" &&
          typeof first.value === "string" &&
          SHOWN_ATTRIBUTES.has(first.value)
        ) {
          report(second);
        }
      },
      AssignmentExpression(node) {
        const property = nameOf(node.left);
        if (
          node.left.type === "MemberExpression" &&
          property !== undefined &&
          SHOWN_PROPERTIES.has(property)
        ) {
          report(node.right);
        }
      },
      ExportNamedDeclaration(node) {
        const declaration = node.declaration;
        if (!inUi || declaration?.type !== "VariableDeclaration" || declaration.kind !== "const") {
          return;
        }
        for (const declarator of declaration.declarations) {
          if (declarator.id.type === "Identifier" && TEXT_CONSTANT.test(declarator.id.name)) {
            report(declarator.init);
          }
        }
      },
    };
  },
};

export default { rules: { "no-raw-ui-text": noRawUiText } };
