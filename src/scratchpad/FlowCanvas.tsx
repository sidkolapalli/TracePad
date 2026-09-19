import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  ArrowRight,
  Circle,
  Diamond,
  Download,
  Link2,
  Maximize2,
  Pencil,
  Plus,
  Square,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { FlowDiagram, FlowEdge, FlowNode } from "./model";
import "./flow.css";

type Props = {
  value: FlowDiagram;
  onChange: (next: FlowDiagram) => void;
  disabled?: boolean;
};
type Selection = { kind: "node" | "edge"; id: string } | null;
type NodeDrag = {
  id: string;
  pointer: number;
  clientX: number;
  clientY: number;
  x: number;
  y: number;
};
const nodeTypes = ["start", "process", "decision", "end"] as const;
const names = {
  start: "Start",
  process: "Step",
  decision: "Decision",
  end: "End",
};
const initialLabels = {
  start: "Start",
  process: "Describe a step",
  decision: "Condition?",
  end: "End",
};
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const size = (node: FlowNode) =>
  node.type === "decision"
    ? { w: 184, h: 104 }
    : { w: 164, h: node.type === "process" ? 68 : 48 };

function lines(label: string, length = 22, maximum = 3): string[] {
  const words = label
    .trim()
    .split(/\s+/)
    .flatMap((word) => word.match(new RegExp(`.{1,${length}}`, "g")) ?? []);
  const result: string[] = [];
  for (const word of words) {
    if (
      !result.length ||
      result[result.length - 1].length + word.length + 1 > length
    )
      result.push(word);
    else result[result.length - 1] += ` ${word}`;
  }
  if (result.length > maximum)
    return [
      ...result.slice(0, maximum - 1),
      `${result[maximum - 1].slice(0, length - 1)}…`,
    ];
  return result.length ? result : ["Untitled"];
}

function connection(source: FlowNode, target: FlowNode) {
  const a = size(source),
    b = size(target);
  const sx = source.x + a.w / 2,
    sy = source.y + a.h / 2;
  const tx = target.x + b.w / 2,
    ty = target.y + b.h / 2;
  if (Math.abs(tx - sx) > Math.abs(ty - sy) * 1.35) {
    const direction = tx >= sx ? 1 : -1;
    const x1 = sx + (direction * a.w) / 2,
      x2 = tx - direction * (b.w / 2 + 5);
    const bend = Math.max(36, Math.abs(x2 - x1) / 2);
    return {
      d: `M ${x1} ${sy} C ${x1 + direction * bend} ${sy}, ${x2 - direction * bend} ${ty}, ${x2} ${ty}`,
      x: (x1 + x2) / 2,
      y: (sy + ty) / 2,
    };
  }
  const direction = ty >= sy ? 1 : -1;
  const y1 = sy + (direction * a.h) / 2,
    y2 = ty - direction * (b.h / 2 + 5);
  const bend = Math.max(36, Math.abs(y2 - y1) / 2);
  return {
    d: `M ${sx} ${y1} C ${sx} ${y1 + direction * bend}, ${tx} ${y2 - direction * bend}, ${tx} ${y2}`,
    x: (sx + tx) / 2,
    y: (y1 + y2) / 2,
  };
}

function Shape({ node }: { node: FlowNode }) {
  const { w, h } = size(node);
  return node.type === "decision" ? (
    <polygon
      className="flow-node-shape"
      points={`${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`}
    />
  ) : (
    <rect
      className="flow-node-shape"
      width={w}
      height={h}
      rx={node.type === "process" ? 7 : h / 2}
    />
  );
}

export function FlowCanvas({ value, onChange, disabled = false }: Props) {
  const uid = useId().replace(/:/g, "");
  const viewport = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<NodeDrag | null>(null);
  const draggedPosition = useRef<{ x: number; y: number } | null>(null);
  const pan = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
    moved: boolean;
  } | null>(null);
  const labelInput = useRef<HTMLInputElement>(null);
  const pendingEdit = useRef<{
    id: string;
    selectAll: boolean;
    scroll?: { left: number; top: number };
  } | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [preview, setPreview] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [edgeLabel, setEdgeLabel] = useState("");
  const [notice, setNotice] = useState("");
  const selectedNode =
    selection?.kind === "node"
      ? value.nodes.find((node) => node.id === selection.id)
      : undefined;
  const selectedEdge =
    selection?.kind === "edge"
      ? value.edges.find((edge) => edge.id === selection.id)
      : undefined;
  const drawnNodes = value.nodes.map((node) =>
    node.id === preview?.id ? { ...node, x: preview.x, y: preview.y } : node,
  );
  const width = Math.max(
    1000,
    ...drawnNodes.map((node) => node.x + size(node).w + 200),
  );
  const height = Math.max(
    620,
    ...drawnNodes.map((node) => node.y + size(node).h + 200),
  );
  const nodeById = new Map(drawnNodes.map((node) => [node.id, node]));
  const currentSelection = selectedNode
    ? `node:${selectedNode.id}`
    : selectedEdge
      ? `edge:${selectedEdge.id}`
      : "";

  // Apply focus immediately after the selected field is committed. Deferring
  // this to an animation frame can steal focus after a user moves to X or Y,
  // causing their coordinate input to overwrite the step label instead.
  useLayoutEffect(() => {
    const edit = pendingEdit.current;
    if (!edit || !inspectorOpen || selectedNode?.id !== edit.id) return;
    pendingEdit.current = null;
    labelInput.current?.focus();
    if (edit.selectAll) labelInput.current?.select();
    if (edit.scroll && viewport.current) {
      viewport.current.scrollLeft = edit.scroll.left;
      viewport.current.scrollTop = edit.scroll.top;
    }
  }, [selection, selectedNode?.id, inspectorOpen]);

  function choose(next: Selection, edit = false) {
    pendingEdit.current =
      edit && next?.kind === "node" ? { id: next.id, selectAll: false } : null;
    setSelection(next);
    setTargetId("");
    if (edit) {
      setInspectorOpen(true);
    }
  }

  function addNode(type: FlowNode["type"]) {
    if (disabled || value.nodes.length >= 60) return;
    const visibleX = (viewport.current?.scrollLeft ?? 0) / zoom + 70;
    const visibleY = (viewport.current?.scrollTop ?? 0) / zoom + 65;
    let x = selectedNode ? selectedNode.x : visibleX;
    let y = selectedNode
      ? selectedNode.y + size(selectedNode).h + 72
      : visibleY;
    while (
      value.nodes.some(
        (node) => Math.abs(node.x - x) < 36 && Math.abs(node.y - y) < 36,
      )
    ) {
      x += 40;
      y += 40;
    }
    const node: FlowNode = {
      id: crypto.randomUUID(),
      type,
      label: initialLabels[type],
      x: clamp(x, 0, 4000),
      y: clamp(y, 0, 4000),
    };
    onChange({ ...value, nodes: [...value.nodes, node] });
    choose({ kind: "node", id: node.id }, true);
    pendingEdit.current = {
      id: node.id,
      selectAll: true,
      scroll: {
        left: Math.max(0, (node.x - 70) * zoom),
        top: Math.max(0, (node.y - 60) * zoom),
      },
    };
    setNotice(
      `${names[type]} added. Edit its label below or drag it on the canvas.`,
    );
  }

  function updateNode(id: string, patch: Partial<FlowNode>) {
    if (!disabled)
      onChange({
        ...value,
        nodes: value.nodes.map((node) =>
          node.id === id ? { ...node, ...patch } : node,
        ),
      });
  }

  function updateEdge(id: string, patch: Partial<FlowEdge>) {
    if (!disabled)
      onChange({
        ...value,
        edges: value.edges.map((edge) =>
          edge.id === id ? { ...edge, ...patch } : edge,
        ),
      });
  }

  function removeSelected() {
    if (disabled || !selection) return;
    if (selection.kind === "node")
      onChange({
        nodes: value.nodes.filter((node) => node.id !== selection.id),
        edges: value.edges.filter(
          (edge) =>
            edge.source !== selection.id && edge.target !== selection.id,
        ),
      });
    else
      onChange({
        ...value,
        edges: value.edges.filter((edge) => edge.id !== selection.id),
      });
    setSelection(null);
    setConnecting(null);
    setNotice(
      selection.kind === "node"
        ? "Step and its connections deleted."
        : "Connection deleted.",
    );
  }

  function connect(source: string, target: string, label = edgeLabel) {
    if (
      disabled ||
      source === target ||
      !value.nodes.some((node) => node.id === target) ||
      value.edges.length >= 120
    )
      return;
    if (
      value.edges.some(
        (edge) =>
          edge.source === source &&
          edge.target === target &&
          edge.label === label,
      )
    ) {
      setNotice(
        "That connection already exists. Select it in the outline to edit its label.",
      );
      return;
    }
    const edge: FlowEdge = {
      id: crypto.randomUUID(),
      source,
      target,
      label: label.slice(0, 80),
    };
    onChange({ ...value, edges: [...value.edges, edge] });
    choose({ kind: "edge", id: edge.id });
    setInspectorOpen(true);
    setConnecting(null);
    setEdgeLabel("");
    setNotice(
      "Connection added. Give a decision branch a Yes or No label below.",
    );
  }

  function selectNode(node: FlowNode) {
    if (connecting && connecting !== node.id) connect(connecting, node.id);
    else choose({ kind: "node", id: node.id });
  }

  function startDrag(event: PointerEvent<SVGGElement>, node: FlowNode) {
    if (event.button !== 0 || disabled) return;
    event.stopPropagation();
    event.currentTarget.focus();
    if (connecting) {
      selectNode(node);
      return;
    }
    choose({ kind: "node", id: node.id });
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      id: node.id,
      pointer: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      x: node.x,
      y: node.y,
    };
    draggedPosition.current = { x: node.x, y: node.y };
  }

  function moveDrag(event: PointerEvent<SVGGElement>) {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    const next = {
      x: clamp(
        Math.round(current.x + (event.clientX - current.clientX) / zoom),
        0,
        4000,
      ),
      y: clamp(
        Math.round(current.y + (event.clientY - current.clientY) / zoom),
        0,
        4000,
      ),
    };
    draggedPosition.current = next;
    setPreview({ id: current.id, ...next });
  }

  function finishDrag(event: PointerEvent<SVGGElement>, cancelled = false) {
    const current = drag.current,
      position = draggedPosition.current;
    if (!current || current.pointer !== event.pointerId) return;
    drag.current = null;
    draggedPosition.current = null;
    setPreview(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (
      !cancelled &&
      position &&
      (position.x !== current.x || position.y !== current.y)
    )
      updateNode(current.id, position);
  }

  function nodeKey(event: KeyboardEvent<SVGGElement>, node: FlowNode) {
    if (event.key === "Escape") {
      setConnecting(null);
      choose(null);
      return;
    }
    if (disabled) return;
    const distance = event.shiftKey ? 1 : 10;
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-distance, 0],
      ArrowRight: [distance, 0],
      ArrowUp: [0, -distance],
      ArrowDown: [0, distance],
    };
    if (directions[event.key]) {
      event.preventDefault();
      event.stopPropagation();
      const [dx, dy] = directions[event.key];
      updateNode(node.id, {
        x: clamp(node.x + dx, 0, 4000),
        y: clamp(node.y + dy, 0, 4000),
      });
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      event.stopPropagation();
      removeSelected();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (connecting) selectNode(node);
      else choose({ kind: "node", id: node.id }, true);
    }
  }

  function changeZoom(next: number) {
    next = clamp(next, 0.25, 2);
    const area = viewport.current;
    const centerX = area ? (area.scrollLeft + area.clientWidth / 2) / zoom : 0;
    const centerY = area ? (area.scrollTop + area.clientHeight / 2) / zoom : 0;
    setZoom(next);
    requestAnimationFrame(() => {
      if (!area) return;
      area.scrollLeft = centerX * next - area.clientWidth / 2;
      area.scrollTop = centerY * next - area.clientHeight / 2;
    });
  }

  function fit() {
    const area = viewport.current;
    if (!area) return;
    if (!value.nodes.length) {
      setZoom(1);
      area.scrollTo(0, 0);
      return;
    }
    const minX = Math.min(...value.nodes.map((node) => node.x)),
      minY = Math.min(...value.nodes.map((node) => node.y));
    const maxX = Math.max(...value.nodes.map((node) => node.x + size(node).w)),
      maxY = Math.max(...value.nodes.map((node) => node.y + size(node).h));
    const next = clamp(
      Math.min(
        area.clientWidth / (maxX - minX + 100),
        area.clientHeight / (maxY - minY + 100),
      ),
      0.1,
      1.4,
    );
    setZoom(next);
    requestAnimationFrame(() => {
      area.scrollLeft = Math.max(0, (minX - 50) * next);
      area.scrollTop = Math.max(0, (minY - 50) * next);
    });
  }

  function exportSvg() {
    if (!svg.current || !value.nodes.length) return;
    const clone = svg.current.cloneNode(true) as SVGSVGElement;
    clone
      .querySelectorAll(".flow-grid, .flow-edge-hit")
      .forEach((element) => element.remove());
    clone
      .querySelectorAll(
        "[tabindex], [role], [aria-pressed], [aria-label], [aria-describedby]",
      )
      .forEach((element) => {
        for (const attr of [
          "tabindex",
          "role",
          "aria-pressed",
          "aria-label",
          "aria-describedby",
        ])
          element.removeAttribute(attr);
      });
    const minX = Math.max(
        0,
        Math.min(...value.nodes.map((node) => node.x)) - 45,
      ),
      minY = Math.max(0, Math.min(...value.nodes.map((node) => node.y)) - 45);
    const exportWidth =
      Math.max(...value.nodes.map((node) => node.x + size(node).w)) - minX + 45;
    const exportHeight =
      Math.max(...value.nodes.map((node) => node.y + size(node).h)) - minY + 45;
    clone.setAttribute(
      "viewBox",
      `${minX} ${minY} ${exportWidth} ${exportHeight}`,
    );
    clone.setAttribute("width", String(exportWidth));
    clone.setAttribute("height", String(exportHeight));
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute(
      "style",
      "background:#ffffff;color:#202d3f;font-family:Segoe UI,Arial,sans-serif",
    );
    const style = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "style",
    );
    style.textContent =
      ".flow-node-shape{fill:#f8fafc;stroke:#64748b;stroke-width:1.5}.flow-node-label{fill:#202d3f;font-size:13px;font-weight:500}.flow-edge-line{fill:none;stroke:#64748b;stroke-width:1.7}.flow-arrow{fill:#64748b}.flow-edge-label-bg{fill:#fff}.flow-edge-label{fill:#334155;font-size:12px}";
    clone.prepend(style);
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = "tracepad-flowchart.svg";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Flowchart exported as SVG.");
  }

  return (
    <div
      className="flow-workspace"
      onKeyDown={(event) => {
        if (event.key === "Escape" && connecting) {
          event.stopPropagation();
          setConnecting(null);
          setNotice("Connection cancelled.");
        }
      }}
    >
      <div className="flow-tools" aria-label="Flowchart tools">
        <div className="flow-shape-tools" aria-label="Add a shape">
          {nodeTypes.map((type) => {
            const Icon =
              type === "decision"
                ? Diamond
                : type === "process"
                  ? Square
                  : Circle;
            return (
              <button
                key={type}
                type="button"
                onClick={() => addNode(type)}
                disabled={disabled || value.nodes.length >= 60}
                aria-label={`Add ${names[type].toLowerCase()}`}
                title={`Add ${names[type].toLowerCase()}`}
              >
                <Icon size={15} aria-hidden="true" />
                <span>{names[type]}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="flow-connect-button"
          aria-pressed={Boolean(connecting)}
          disabled={
            disabled ||
            (!connecting &&
              (!selectedNode ||
                value.nodes.length < 2 ||
                value.edges.length >= 120))
          }
          onClick={() => {
            setConnecting(connecting ? null : (selectedNode?.id ?? null));
            setNotice(
              connecting
                ? "Connection cancelled."
                : "Choose the step this arrow should point to. Escape cancels.",
            );
          }}
        >
          <Link2 size={15} aria-hidden="true" />
          {connecting ? "Cancel" : "Connect"}
        </button>
      </div>
      <div
        className={`flow-viewport${connecting ? " is-connecting" : ""}${!value.nodes.length ? " is-empty" : ""}`}
        ref={viewport}
      >
        <svg
          ref={svg}
          className="flow-canvas"
          width={width * zoom}
          height={height * zoom}
          viewBox={`0 0 ${width} ${height}`}
          aria-label="Editable flowchart"
          aria-describedby={`${uid}-help`}
          onPointerDown={(event) => {
            if (event.button !== 0 || !viewport.current) return;
            pan.current = {
              x: event.clientX,
              y: event.clientY,
              left: viewport.current.scrollLeft,
              top: viewport.current.scrollTop,
              moved: false,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!pan.current || !viewport.current) return;
            const dx = event.clientX - pan.current.x,
              dy = event.clientY - pan.current.y;
            if (Math.abs(dx) + Math.abs(dy) > 4) pan.current.moved = true;
            viewport.current.scrollLeft = pan.current.left - dx;
            viewport.current.scrollTop = pan.current.top - dy;
          }}
          onPointerUp={(event) => {
            if (pan.current && !pan.current.moved) {
              choose(null);
              setConnecting(null);
            }
            pan.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => {
            pan.current = null;
          }}
        >
          <defs>
            <pattern
              id={`${uid}-dots`}
              x="0"
              y="0"
              width="24"
              height="24"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="1" cy="1" r="0.8" className="flow-grid-dot" />
            </pattern>
            <marker
              id={`${uid}-arrow`}
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path className="flow-arrow" d="M 0 0 L 8 4 L 0 8 z" />
            </marker>
          </defs>
          <rect
            className="flow-grid"
            width={width}
            height={height}
            fill={`url(#${uid}-dots)`}
          />
          {value.edges.map((edge) => {
            const source = nodeById.get(edge.source),
              target = nodeById.get(edge.target);
            if (!source || !target) return null;
            const path = connection(source, target),
              label =
                edge.label.length > 32
                  ? `${edge.label.slice(0, 31)}…`
                  : edge.label;
            return (
              <g
                key={edge.id}
                className={`flow-edge${selectedEdge?.id === edge.id ? " is-selected" : ""}`}
                tabIndex={0}
                role="button"
                aria-label={`Connection: ${source.label} to ${target.label}${edge.label ? `, ${edge.label}` : ""}`}
                aria-pressed={selectedEdge?.id === edge.id}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  event.currentTarget.focus();
                  choose({ kind: "edge", id: edge.id });
                  setConnecting(null);
                }}
                onDoubleClick={() =>
                  choose({ kind: "edge", id: edge.id }, true)
                }
                onFocus={() => choose({ kind: "edge", id: edge.id })}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    choose({ kind: "edge", id: edge.id }, true);
                  }
                  if (event.key === "Delete" || event.key === "Backspace") {
                    event.preventDefault();
                    removeSelected();
                  }
                }}
              >
                <title>
                  {edge.label || `${source.label} → ${target.label}`}
                </title>
                <path className="flow-edge-hit" d={path.d} />
                <path
                  className="flow-edge-line"
                  d={path.d}
                  markerEnd={`url(#${uid}-arrow)`}
                />
                {label && (
                  <>
                    <rect
                      className="flow-edge-label-bg"
                      x={path.x - (label.length * 6.5 + 16) / 2}
                      y={path.y - 11}
                      width={label.length * 6.5 + 16}
                      height={22}
                      rx={4}
                    />
                    <text
                      className="flow-edge-label"
                      x={path.x}
                      y={path.y + 4}
                      textAnchor="middle"
                    >
                      {label}
                    </text>
                  </>
                )}
              </g>
            );
          })}
          {drawnNodes.map((node) => {
            const dimensions = size(node),
              text = lines(
                node.label,
                node.type === "decision" ? 18 : 22,
                node.type === "decision" ? 3 : node.type === "process" ? 3 : 2,
              );
            return (
              <g
                key={node.id}
                className={`flow-node${selectedNode?.id === node.id ? " is-selected" : ""}${connecting === node.id ? " is-source" : ""}`}
                transform={`translate(${node.x}, ${node.y})`}
                tabIndex={0}
                role="button"
                aria-label={`${names[node.type]}: ${node.label}`}
                aria-pressed={selectedNode?.id === node.id}
                aria-disabled={disabled}
                onPointerDown={(event) => startDrag(event, node)}
                onPointerMove={moveDrag}
                onPointerUp={(event) => finishDrag(event)}
                onPointerCancel={(event) => finishDrag(event, true)}
                onDoubleClick={() =>
                  choose({ kind: "node", id: node.id }, true)
                }
                onFocus={() => choose({ kind: "node", id: node.id })}
                onKeyDown={(event) => nodeKey(event, node)}
              >
                <title>{node.label}</title>
                <Shape node={node} />
                <text
                  className="flow-node-label"
                  x={dimensions.w / 2}
                  y={dimensions.h / 2 - (text.length - 1) * 8 + 5}
                  textAnchor="middle"
                >
                  {text.map((line, index) => (
                    <tspan
                      key={index}
                      x={dimensions.w / 2}
                      dy={index === 0 ? 0 : 16}
                    >
                      {line}
                    </tspan>
                  ))}
                </text>
              </g>
            );
          })}
        </svg>
        {!value.nodes.length && (
          <div className="flow-empty">
            <div className="flow-empty-diagram" aria-hidden="true">
              <Circle size={26} />
              <ArrowRight size={23} />
              <Diamond size={31} />
              <ArrowRight size={23} />
              <Square size={27} />
            </div>
            <h3>Map your approach</h3>
            <p>
              Lay out the steps, add decisions, and connect your thinking before
              you code.
            </p>
            <button
              type="button"
              onClick={() => addNode("start")}
              disabled={disabled}
            >
              <Plus size={15} />
              Add a starting point
            </button>
          </div>
        )}
      </div>
      <div className="flow-view-tools">
        <span className="flow-context" role="status">
          {connecting
            ? "Choose a destination step"
            : `${value.nodes.length} ${value.nodes.length === 1 ? "step" : "steps"} · ${value.edges.length} ${value.edges.length === 1 ? "connection" : "connections"}`}
        </span>
        <div className="flow-zoom-tools">
          <button
            type="button"
            onClick={() => changeZoom(zoom - 0.1)}
            disabled={zoom <= 0.25}
            aria-label="Zoom out"
          >
            <ZoomOut size={15} />
          </button>
          <button
            type="button"
            onClick={() => changeZoom(1)}
            aria-label="Reset zoom to 100 percent"
            className="flow-zoom-value"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={() => changeZoom(zoom + 0.1)}
            disabled={zoom >= 2}
            aria-label="Zoom in"
          >
            <ZoomIn size={15} />
          </button>
          <button
            type="button"
            onClick={fit}
            aria-label="Fit flowchart"
            title="Fit all steps"
          >
            <Maximize2 size={15} />
            <span>Fit</span>
          </button>
          <button
            type="button"
            onClick={exportSvg}
            disabled={!value.nodes.length}
            aria-label="Export flowchart as SVG"
            title="Export SVG"
          >
            <Download size={15} />
          </button>
        </div>
      </div>
      <details
        className="flow-inspector"
        open={inspectorOpen}
        onToggle={(event) => setInspectorOpen(event.currentTarget.open)}
      >
        <summary>
          <Pencil size={14} aria-hidden="true" />
          <span>
            {selectedNode
              ? `Edit ${names[selectedNode.type].toLowerCase()}`
              : selectedEdge
                ? "Edit connection"
                : "Outline & editing"}
          </span>
          {(selectedNode || selectedEdge) && (
            <span className="flow-inspector-selection">
              {selectedNode?.label || selectedEdge?.label || "Unlabelled arrow"}
            </span>
          )}
        </summary>
        <div className="flow-inspector-body">
          <label className="flow-field">
            Select a step or connection
            <select
              value={currentSelection}
              onChange={(event) => {
                const [kind, ...id] = event.target.value.split(":");
                choose(
                  id.length
                    ? { kind: kind as "node" | "edge", id: id.join(":") }
                    : null,
                );
              }}
            >
              <option value="">Choose an item…</option>
              <optgroup label="Steps">
                {value.nodes.map((node, index) => (
                  <option key={node.id} value={`node:${node.id}`}>
                    {index + 1}. {node.label || names[node.type]}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Connections">
                {value.edges.map((edge) => (
                  <option key={edge.id} value={`edge:${edge.id}`}>
                    {nodeById.get(edge.source)?.label} →{" "}
                    {nodeById.get(edge.target)?.label}
                    {edge.label && ` (${edge.label})`}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          {selectedNode && (
            <>
              <div className="flow-edit-row">
                <label className="flow-field">
                  Step label
                  <input
                    ref={labelInput}
                    value={selectedNode.label}
                    maxLength={160}
                    disabled={disabled}
                    onChange={(event) =>
                      updateNode(selectedNode.id, { label: event.target.value })
                    }
                  />
                </label>
                <button
                  type="button"
                  className="flow-delete"
                  disabled={disabled}
                  aria-label="Delete selected step"
                  onClick={removeSelected}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="flow-node-properties">
                <label className="flow-field">
                  Shape
                  <select
                    disabled={disabled}
                    value={selectedNode.type}
                    onChange={(event) =>
                      updateNode(selectedNode.id, {
                        type: event.target.value as FlowNode["type"],
                      })
                    }
                  >
                    {nodeTypes.map((type) => (
                      <option key={type} value={type}>
                        {names[type]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flow-field">
                  X
                  <input
                    type="number"
                    value={selectedNode.x}
                    min={0}
                    max={4000}
                    disabled={disabled}
                    onChange={(event) =>
                      updateNode(selectedNode.id, {
                        x: clamp(Number(event.target.value) || 0, 0, 4000),
                      })
                    }
                  />
                </label>
                <label className="flow-field">
                  Y
                  <input
                    type="number"
                    value={selectedNode.y}
                    min={0}
                    max={4000}
                    disabled={disabled}
                    onChange={(event) =>
                      updateNode(selectedNode.id, {
                        y: clamp(Number(event.target.value) || 0, 0, 4000),
                      })
                    }
                  />
                </label>
              </div>
              {value.nodes.length > 1 && (
                <div className="flow-connect-fields">
                  <label className="flow-field">
                    Connect to
                    <select
                      disabled={disabled || value.edges.length >= 120}
                      value={targetId}
                      onChange={(event) => setTargetId(event.target.value)}
                    >
                      <option value="">Choose a destination…</option>
                      {value.nodes
                        .filter((node) => node.id !== selectedNode.id)
                        .map((node) => (
                          <option key={node.id} value={node.id}>
                            {node.label || names[node.type]}
                          </option>
                        ))}
                    </select>
                  </label>
                  <div className="flow-edit-row">
                    <label className="flow-field">
                      Arrow label <span>(optional)</span>
                      <input
                        value={edgeLabel}
                        maxLength={80}
                        placeholder={
                          selectedNode.type === "decision"
                            ? "e.g. Yes or No"
                            : "e.g. next"
                        }
                        disabled={disabled}
                        onChange={(event) => setEdgeLabel(event.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="flow-add-connection"
                      disabled={
                        disabled || !targetId || value.edges.length >= 120
                      }
                      onClick={() => connect(selectedNode.id, targetId)}
                    >
                      <Link2 size={15} />
                      Connect
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
          {selectedEdge && (
            <>
              <p className="flow-edge-description">
                {nodeById.get(selectedEdge.source)?.label}
                <ArrowRight size={14} aria-hidden="true" />
                {nodeById.get(selectedEdge.target)?.label}
              </p>
              <div className="flow-edit-row">
                <label className="flow-field">
                  Arrow label
                  <input
                    ref={labelInput}
                    value={selectedEdge.label}
                    maxLength={80}
                    placeholder="e.g. Yes or No"
                    disabled={disabled}
                    onChange={(event) =>
                      updateEdge(selectedEdge.id, { label: event.target.value })
                    }
                  />
                </label>
                <button
                  type="button"
                  className="flow-delete"
                  aria-label="Delete selected connection"
                  disabled={disabled}
                  onClick={removeSelected}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="flow-branch-labels">
                <span>Branch label</span>
                {["Yes", "No"].map((label) => (
                  <button
                    type="button"
                    key={label}
                    disabled={disabled}
                    aria-pressed={selectedEdge.label === label}
                    onClick={() => updateEdge(selectedEdge.id, { label })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
          <p className="flow-keyboard-help" id={`${uid}-help`}>
            Drag a step to move it. Select two steps with Connect to draw an
            arrow. With a step focused, arrow keys move it, Shift moves 1 px,
            Enter edits, and Delete removes it. Drag empty canvas to pan.
          </p>
          {value.nodes.length >= 60 && (
            <p className="flow-limit" role="status">
              60-step limit reached. Delete a step to add another.
            </p>
          )}
          {value.edges.length >= 120 && (
            <p className="flow-limit" role="status">
              120-connection limit reached. Delete a connection to add another.
            </p>
          )}
        </div>
      </details>
      <span className="flow-announcement" role="status" aria-live="polite">
        {notice}
      </span>
    </div>
  );
}
