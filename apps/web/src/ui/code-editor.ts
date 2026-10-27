import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState, Prec, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  WidgetType,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  type DecorationSet,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";

/**
 * The beat editor's text area (#373): a minimal CodeMirror 6 with line
 * numbers, loaded as its own chunk the first time the editor opens
 * (ADR-0028). It only edits text; the music host evaluates it.
 */

export interface CodeEditorKeys {
  /** Ctrl+Enter. */
  readonly evaluate: () => void;
  /** Ctrl+. */
  readonly stop: () => void;
  /** Esc. */
  readonly close: () => void;
}

export interface CodeEditor {
  readonly element: HTMLElement;
  text(): string;
  /** Replace the whole text, as one undoable change. */
  setText(text: string): void;
  /** Show `message` under `line`, 1-based, or above the code with no line. */
  showError(message: string, line: number | undefined): void;
  clearError(): void;
  focus(): void;
  destroy(): void;
}

interface ShownError {
  readonly message: string;
  readonly line: number | undefined;
}

class ErrorWidget extends WidgetType {
  readonly message: string;

  constructor(message: string) {
    super();
    this.message = message;
  }

  override eq(other: ErrorWidget): boolean {
    return other.message === this.message;
  }

  toDOM(): HTMLElement {
    const node = document.createElement("div");
    node.className = "beat-editor-error";
    node.setAttribute("role", "alert");
    node.textContent = this.message;
    return node;
  }
}

/** Syntax colours on the dark panel, from the skill-type palette. */
const beatHighlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.operatorKeyword], color: "#d2a8ff" },
  { tag: [tags.string, tags.special(tags.string)], color: "#c3e88d" },
  { tag: [tags.number, tags.bool, tags.null], color: "#e3b341" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: "#59c2ff" },
  { tag: tags.propertyName, color: "#56d4dd" },
  { tag: [tags.lineComment, tags.blockComment], color: "#7d8899", fontStyle: "italic" },
  { tag: tags.invalid, color: "#ff7b72" },
]);

const setError = StateEffect.define<ShownError | null>();

/** The error shown, as a block under its line; any edit clears it. */
const errorField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(shown, transaction) {
    let next = transaction.docChanged ? Decoration.none : shown;
    for (const effect of transaction.effects) {
      if (!effect.is(setError)) {
        continue;
      }
      if (effect.value === null) {
        next = Decoration.none;
        continue;
      }
      const { doc } = transaction.state;
      const { message, line } = effect.value;
      const widget = new ErrorWidget(message);
      next = Decoration.set(
        line === undefined
          ? [Decoration.widget({ widget, block: true, side: -1 }).range(0)]
          : [
              Decoration.widget({ widget, block: true, side: 1 }).range(
                doc.line(Math.min(Math.max(line, 1), doc.lines)).to,
              ),
            ],
      );
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function createCodeEditor(doc: string, keys: CodeEditorKeys): CodeEditor {
  const run = (action: () => void) => (): boolean => {
    action();
    return true;
  };
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        drawSelection(),
        history(),
        javascript(),
        syntaxHighlighting(beatHighlight),
        errorField,
        // Ahead of the default keymap, whose Mod-Enter inserts a line.
        Prec.highest(
          keymap.of([
            { key: "Mod-Enter", run: run(keys.evaluate) },
            { key: "Mod-.", run: run(keys.stop) },
            { key: "Escape", run: run(keys.close) },
          ]),
        ),
        // No Tab binding: Tab leaves the editor, as everywhere else.
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.contentAttributes.of({ "aria-label": "Beat source" }),
      ],
    }),
  });
  return {
    element: view.dom,
    text: () => view.state.doc.toString(),
    setText(text) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    },
    showError(message, line) {
      view.dispatch({ effects: setError.of({ message, line }) });
    },
    clearError() {
      view.dispatch({ effects: setError.of(null) });
    },
    focus() {
      view.focus();
    },
    destroy() {
      view.destroy();
    },
  };
}
