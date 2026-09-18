import { builtInExercises } from "../../src/exercises.ts";
import { defaultSession, isSession } from "../../src/session.ts";
import { defaultLearning, isLearning } from "../../src/learning/state.ts";
import { isScratchpad, type Scratchpad } from "../../src/scratchpad/model.ts";
import type { ProjectState } from "../../src/projects/types.ts";

/** Synthetic authored demo content; no user history or execution evidence. */
export const seedMetadata = {
  schemaVersion: 1,
  label: "Synthetic Tracepad demo fixture",
  generator: "scripts/demo/seed.ts",
  version: "pair-sum-v1",
} as const;

export const mainSource = `from algorithms.pairs import find_pair


def pair_sum(nums: list[int], target: int) -> list[int]:
    """Return two distinct indices whose values add up to target."""
    return find_pair(nums, target)


if __name__ == "__main__":
    prices = [2, 7, 11, 15]
    target = 9
    indices = pair_sum(prices, target)

    print(f"Prices:  {prices}")
    print(f"Target:  {target}")
    print(f"Indices: {indices}")
    if indices:
        left, right = indices
        print(f"Found:   {prices[left]} + {prices[right]} = {target}")
`;

export const moduleSource = `def find_pair(nums: list[int], target: int) -> list[int]:
    """Find a pair in O(n) time with O(n) extra space."""
    seen: dict[int, int] = {}

    for index, value in enumerate(nums):
        complement = target - value

        # Check first: the current element cannot match itself.
        if complement in seen:
            return [seen[complement], index]

        seen[value] = index

    return []
`;

const scratchpad: Scratchpad = {
  version: 1,
  activeTab: "notes",
  notes: `PAIR SUM · APPROACH

Use a dictionary: value → index already visited.
For each value, look for target − value in seen.
Check before storing so an element never matches itself.

INVARIANT
Every index in seen is smaller than the current index.
The returned indices are distinct and already in order.

EDGE CASES
Empty input · no match · duplicate values · negatives · zero.

COMPLEXITY
One pass: O(n) time. Up to n entries: O(n) space.

Manual trace below: nums = [2, 7, 11, 15], target = 9.
Synthetic demo notes; trace rows are manually authored.`,
  trace: {
    columns: [
      { id: "step", name: "Step" },
      { id: "variables", name: "Variables" },
      { id: "observation", name: "Observation" },
    ],
    rows: [
      {
        id: "demo-trace-initialize",
        cells: {
          step: "1 · Initialize",
          variables: "target = 9; seen = {}",
          observation: "No earlier values yet.",
        },
      },
      {
        id: "demo-trace-store",
        cells: {
          step: "2 · Visit 2",
          variables: "i = 0; need = 7",
          observation: "7 not in seen → store {2: 0}.",
        },
      },
      {
        id: "demo-trace-return",
        cells: {
          step: "3 · Visit 7",
          variables: "i = 1; need = 2",
          observation: "2 is at index 0 → return [0, 1].",
        },
      },
    ],
  },
  flow: {
    nodes: [
      {
        id: "demo-start",
        type: "start",
        label: "Start: seen = {}",
        x: 235,
        y: 25,
      },
      {
        id: "demo-next",
        type: "process",
        label: "Read next index + value",
        x: 235,
        y: 120,
      },
      {
        id: "demo-check",
        type: "decision",
        label: "Complement in seen?",
        x: 225,
        y: 255,
      },
      {
        id: "demo-store",
        type: "process",
        label: "Store value → index",
        x: 490,
        y: 273,
      },
      { id: "demo-return", type: "end", label: "Return answer", x: 10, y: 283 },
    ],
    edges: [
      {
        id: "demo-edge-start",
        source: "demo-start",
        target: "demo-next",
        label: "Scan left to right",
      },
      {
        id: "demo-edge-read",
        source: "demo-next",
        target: "demo-check",
        label: "need = target − value",
      },
      {
        id: "demo-edge-empty",
        source: "demo-next",
        target: "demo-return",
        label: "Exhausted: []",
      },
      {
        id: "demo-edge-found",
        source: "demo-check",
        target: "demo-return",
        label: "Yes",
      },
      {
        id: "demo-edge-store",
        source: "demo-check",
        target: "demo-store",
        label: "No",
      },
      {
        id: "demo-edge-loop",
        source: "demo-store",
        target: "demo-next",
        label: "Continue",
      },
    ],
  },
};

export function demoState(): ProjectState {
  const exercise = builtInExercises.find((item) => item.id === "pair-sum");
  if (!exercise) throw new Error("The Pair sum exercise is unavailable.");
  const state: ProjectState = {
    schemaVersion: 1,
    session: {
      ...defaultSession(),
      fontSize: 16,
      theme: "dark",
      panelWidth: 35,
      consoleHeight: 240,
      drafts: {
        "pair-sum": {
          source: mainSource,
          files: { "algorithms/pairs.py": moduleSource },
          activeFile: "main.py",
          stdin: "",
          tests: [
            ...structuredClone(exercise.tests),
            {
              id: "demo-pair-zero",
              name: "Zero still needs two indices",
              code: "assert pair_sum([0], 0) == []\nassert pair_sum([0, 0], 0) == [0, 1]",
            },
            {
              id: "demo-pair-unchanged",
              name: "Keeps input and index order",
              code: "nums = [12, -4, 8, 3]\nbefore = nums.copy()\nassert pair_sum(nums, 4) == [1, 2]\nassert nums == before",
            },
          ],
          scratchpad: structuredClone(scratchpad),
        },
      },
    },
    learning: defaultLearning(),
  };
  if (
    !isSession(state.session) ||
    !isLearning(state.learning) ||
    !isScratchpad(state.session.drafts["pair-sum"].scratchpad)
  ) {
    throw new Error("The synthetic demo fixture failed state validation.");
  }
  return state;
}
