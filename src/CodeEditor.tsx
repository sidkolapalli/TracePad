import { useEffect, useRef } from "react";
import * as monaco from "monaco-editor/editor/editor.api.js";
import "monaco-editor/languages/definitions/python/register.js";
import "monaco-editor/editor/contrib/find/browser/findController.js";
import "monaco-editor/editor/contrib/clipboard/browser/clipboard.js";
import "monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching.js";
import "monaco-editor/editor/contrib/folding/browser/folding.js";
import "monaco-editor/editor/contrib/contextmenu/browser/contextmenu.js";
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";

(
  self as typeof self & { MonacoEnvironment: monaco.Environment }
).MonacoEnvironment = { getWorker: () => new EditorWorker() };
monaco.editor.defineTheme("localpad", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "929BAA" },
    { token: "keyword", foreground: "C2ACF0" },
    { token: "string", foreground: "BCD9A4" },
    { token: "number", foreground: "E6BD8B" },
    { token: "identifier", foreground: "DCE2EC" },
  ],
  colors: {
    "editor.background": "#171B22",
    "editor.foreground": "#DCE2EC",
    "editorLineNumber.foreground": "#7B8596",
    "editorLineNumber.activeForeground": "#C9D3E1",
    "editor.lineHighlightBackground": "#1C222C",
    "editor.selectionBackground": "#35485F",
    "editorCursor.foreground": "#BCE9B7",
    "editorIndentGuide.background1": "#2A303B",
    "editorWidget.background": "#222833",
    "editorWidget.border": "#3A4353",
    "editor.inactiveSelectionBackground": "#303A49",
  },
});
monaco.editor.defineTheme("localpad-light", {
  base: "vs",
  inherit: true,
  rules: [
    { token: "comment", foreground: "637082" },
    { token: "keyword", foreground: "7142A0" },
    { token: "string", foreground: "326637" },
    { token: "number", foreground: "805300" },
    { token: "identifier", foreground: "273442" },
  ],
  colors: {
    "editor.background": "#FFFFFF",
    "editor.foreground": "#273442",
    "editorLineNumber.foreground": "#657387",
    "editorLineNumber.activeForeground": "#273442",
    "editor.lineHighlightBackground": "#F0F4F7",
    "editor.selectionBackground": "#CCE4D5",
    "editorCursor.foreground": "#287044",
    "editorIndentGuide.background1": "#E0E6ED",
    "editorWidget.background": "#F5F7F9",
    "editorWidget.border": "#A9B5C3",
    "editor.inactiveSelectionBackground": "#E4EBF0",
  },
});

export default function CodeEditor({
  source,
  fontSize,
  theme,
  onChange,
  onRun,
  readOnly = false,
  documentId = "main.py",
  documentIds,
}: {
  source: string;
  fontSize: number;
  theme: "dark" | "light";
  onChange: (value: string) => void;
  onRun: () => void;
  readOnly?: boolean;
  /** Stable exercise/file identity; keep this component mounted across file tabs. */
  documentId?: string;
  /** Live file identities; removed or renamed files lose their editor models. */
  documentIds?: string[];
}) {
  const element = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const documents = useRef(new Map<string, {
    model: monaco.editor.ITextModel;
    viewState: monaco.editor.ICodeEditorViewState | null;
  }>());
  const activeDocument = useRef<string | null>(null);
  const synchronizing = useRef(false);
  const documentIdsKey = documentIds === undefined ? undefined : JSON.stringify(documentIds);
  const callbacks = useRef({ onChange, onRun, documentId });
  callbacks.current = { onChange, onRun, documentId };
  useEffect(() => {
    const instance = monaco.editor.create(element.current!, {
      model: null,
      theme: theme === "light" ? "localpad-light" : "localpad",
      automaticLayout: true,
      minimap: { enabled: false },
      fontFamily: 'Consolas, "Cascadia Code", "SFMono-Regular", monospace',
      fontSize,
      lineHeight: 24,
      padding: { top: 20, bottom: 20 },
      scrollBeyondLastLine: false,
      tabSize: 4,
      insertSpaces: true,
      detectIndentation: false,
      wordWrap: "off",
      renderLineHighlight: "line",
      lineNumbersMinChars: 3,
      glyphMargin: false,
      folding: true,
      contextmenu: true,
      ariaLabel: "Python code editor",
      quickSuggestions: false,
      wordBasedSuggestions: "off",
      suggestOnTriggerCharacters: false,
      bracketPairColorization: { enabled: true },
    });
    editor.current = instance;
    const listener = instance.onDidChangeModelContent(() => {
      if (!synchronizing.current && activeDocument.current === callbacks.current.documentId) {
        callbacks.current.onChange(instance.getValue());
      }
    });
    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () =>
      callbacks.current.onRun(),
    );
    return () => {
      listener.dispose();
      instance.dispose();
      for (const document of documents.current.values()) document.model.dispose();
      documents.current.clear();
      activeDocument.current = null;
      editor.current = null;
    };
  }, []);
  useEffect(() => {
    const instance = editor.current;
    if (!instance) return;
    synchronizing.current = true;
    try {
      if (documentIdsKey !== undefined) {
        const liveIds = new Set<string>(JSON.parse(documentIdsKey));
        for (const [id, document] of documents.current) {
          if (liveIds.has(id)) continue;
          // Detach before disposal when the selected file was just removed.
          // A recreated path receives a fresh model and an empty undo stack.
          if (instance.getModel() === document.model) instance.setModel(null);
          if (activeDocument.current === id) activeDocument.current = null;
          document.model.dispose();
          documents.current.delete(id);
        }
      }
      if (activeDocument.current !== documentId) {
        if (activeDocument.current !== null) {
          const previous = documents.current.get(activeDocument.current);
          if (previous) previous.viewState = instance.saveViewState();
        }
        let document = documents.current.get(documentId);
        if (!document) {
          document = { model: monaco.editor.createModel(source, "python"), viewState: null };
          documents.current.set(documentId, document);
        }
        activeDocument.current = documentId;
        instance.setModel(document.model);
        if (document.viewState) instance.restoreViewState(document.viewState);
      }
      // External resets intentionally replace the file. A normal tab switch has
      // matching source, so its model, undo stack, cursor and scroll are retained.
      if (instance.getValue() !== source) instance.setValue(source);
    } finally {
      synchronizing.current = false;
    }
  }, [source, documentId, documentIdsKey]);
  useEffect(() => {
    editor.current?.updateOptions({ fontSize });
  }, [fontSize]);
  useEffect(() => {
    editor.current?.updateOptions({ readOnly });
  }, [readOnly]);
  useEffect(() => {
    monaco.editor.setTheme(theme === "light" ? "localpad-light" : "localpad");
  }, [theme]);
  return <div className="code-editor" ref={element} />;
}
