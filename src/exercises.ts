import type { Exercise, PracticeCase } from "./types";

/** Each snippet runs after the submitted solution in a fresh Python namespace. */
function checks(
  id: string,
  name: string,
  pairs: [string, string][],
): PracticeCase {
  return {
    id,
    name,
    code: pairs
      .map(
        ([call, expected]) =>
          `actual = ${call}\nexpected = ${expected}\nassert actual == expected, f"Expected {expected!r}, got {actual!r}"`,
      )
      .join("\n\n"),
  };
}

export const sandboxExercise: Exercise = {
  id: "sandbox",
  title: "Blank sandbox",
  difficulty: "Sandbox",
  topic: "Free practice",
  description:
    "A clean page for your next idea. Write Python, explore the standard library, or add your own assertion tests in the Tests panel. Put any input() values in the Input tab before running.",
  examples: [],
  constraints: [],
  starterCode: '# Write your Python code here.\n\nprint("Hello, world!")\n',
  tests: [],
};

export const builtInExercises: Exercise[] = [
  {
    id: "pair-sum",
    title: "Pair sum",
    difficulty: "Easy",
    topic: "Arrays · Hash maps",
    description:
      "A checkout system needs to find two items whose prices add up to a target. Given a list of integers nums and an integer target, return the indices of two distinct elements whose sum equals target. Return the smaller index first.\n\nYou may assume there is at most one valid pair of indices. If there is no pair, return an empty list. An element cannot be used twice. Can you solve this in one pass?",
    examples: [
      {
        input: "nums = [2, 7, 11, 15], target = 9",
        output: "[0, 1]",
        explanation: "The values at indices 0 and 1 add up to 9.",
      },
      {
        input: "nums = [3, 3], target = 6",
        output: "[0, 1]",
        explanation:
          "Equal values are allowed when their indices are different.",
      },
    ],
    constraints: [
      "0 ≤ len(nums) ≤ 10,000",
      "−1,000,000 ≤ nums[i], target ≤ 1,000,000",
      "At most one valid index pair exists.",
    ],
    starterCode:
      'def pair_sum(nums: list[int], target: int) -> list[int]:\n    """Return two increasing indices, or [] when no pair exists."""\n    pass\n',
    tests: [
      checks("pair-basic", "Finds a pair", [
        ["pair_sum([2, 7, 11, 15], 9)", "[0, 1]"],
      ]),
      checks("pair-negative", "Handles negative values", [
        ["pair_sum([-8, 4, 6, -2], -10)", "[0, 3]"],
      ]),
      checks("pair-duplicates", "Uses two distinct indices", [
        ["pair_sum([3, 3], 6)", "[0, 1]"],
        ["pair_sum([3], 6)", "[]"],
      ]),
      checks("pair-missing", "Handles empty and missing pairs", [
        ["pair_sum([], 0)", "[]"],
        ["pair_sum([1, 2, 4], 8)", "[]"],
      ]),
    ],
  },
  {
    id: "balanced-brackets",
    title: "Balanced brackets",
    difficulty: "Easy",
    topic: "Strings · Stacks",
    description:
      "A tiny expression editor needs a bracket checker. Given a string text containing only parentheses, square brackets, and curly braces, return True if every opening bracket is closed by the same kind of bracket in the correct order. Otherwise return False.\n\nSeparate balanced groups are allowed. An empty string is balanced.",
    examples: [
      {
        input: 'text = "{[()]}()"',
        output: "True",
        explanation: "Every group is properly nested and closed.",
      },
      {
        input: 'text = "([)]"',
        output: "False",
        explanation:
          "The closing parenthesis crosses the square-bracket group.",
      },
    ],
    constraints: [
      "0 ≤ len(text) ≤ 10,000",
      "text contains only the characters ( ) [ ] { }.",
    ],
    starterCode:
      'def balanced_brackets(text: str) -> bool:\n    """Return whether all bracket groups close in the right order."""\n    pass\n',
    tests: [
      checks("brackets-nested", "Accepts nested and adjacent groups", [
        ['balanced_brackets("{[()]}()[]")', "True"],
      ]),
      checks("brackets-crossed", "Rejects crossed bracket types", [
        ['balanced_brackets("([)]")', "False"],
        ['balanced_brackets("(]")', "False"],
      ]),
      checks("brackets-unclosed", "Rejects unmatched ends", [
        ['balanced_brackets(")(")', "False"],
        ['balanced_brackets("(()")', "False"],
      ]),
      checks("brackets-empty", "Accepts the empty string", [
        ['balanced_brackets("")', "True"],
      ]),
    ],
  },
  {
    id: "binary-search",
    title: "Binary search",
    difficulty: "Easy",
    topic: "Arrays · Search",
    description:
      "A catalog stores unique numeric IDs in ascending order. Implement binary_search(nums, target) to return the index of target, or −1 if the ID is missing.\n\nUse the sorted order to discard half the remaining search range at each step. Aim for O(log n) time and O(1) extra space.",
    examples: [
      { input: "nums = [-9, -2, 0, 5, 12], target = 5", output: "3" },
      { input: "nums = [1, 4, 9], target = 6", output: "-1" },
    ],
    constraints: [
      "0 ≤ len(nums) ≤ 100,000",
      "nums is strictly increasing; all values are distinct.",
      "nums and target contain integers.",
    ],
    starterCode:
      'def binary_search(nums: list[int], target: int) -> int:\n    """Return the target index in sorted nums, or -1 if absent."""\n    pass\n',
    tests: [
      checks("search-middle", "Finds an interior value", [
        ["binary_search([-9, -2, 0, 5, 12], 5)", "3"],
      ]),
      checks("search-ends", "Finds both endpoints", [
        ["binary_search([1, 4, 9, 16], 1)", "0"],
        ["binary_search([1, 4, 9, 16], 16)", "3"],
      ]),
      checks("search-absent", "Returns −1 for missing values", [
        ["binary_search([1, 4, 9], 6)", "-1"],
        ["binary_search([1, 4, 9], 12)", "-1"],
        ["binary_search([1, 4, 9], -3)", "-1"],
      ]),
      checks("search-small", "Handles empty and single-item lists", [
        ["binary_search([], 7)", "-1"],
        ["binary_search([7], 7)", "0"],
        ["binary_search([7], 2)", "-1"],
      ]),
    ],
  },
  {
    id: "merging-intervals",
    title: "Merging intervals",
    difficulty: "Medium",
    topic: "Sorting · Intervals",
    description:
      "A calendar has collected availability windows from several sources. Given an unsorted list of closed intervals [start, end], merge all overlapping windows and return them sorted by start.\n\nIntervals that touch at an endpoint also merge: [1, 3] and [3, 5] become [1, 5]. Return a list of two-element lists. You may modify the input.",
    examples: [
      {
        input: "intervals = [[8, 10], [1, 3], [2, 6], [15, 18]]",
        output: "[[1, 6], [8, 10], [15, 18]]",
      },
      {
        input: "intervals = [[1, 4], [4, 5]]",
        output: "[[1, 5]]",
        explanation:
          "Closed intervals include their endpoints, so these windows touch.",
      },
    ],
    constraints: [
      "0 ≤ len(intervals) ≤ 10,000",
      "Each interval contains two integers with start ≤ end.",
      "−1,000,000 ≤ start, end ≤ 1,000,000",
    ],
    starterCode:
      'def merge_intervals(intervals: list[list[int]]) -> list[list[int]]:\n    """Return sorted, non-overlapping closed intervals."""\n    pass\n',
    tests: [
      checks("merge-unsorted", "Merges unsorted overlapping windows", [
        [
          "merge_intervals([[8, 10], [1, 3], [2, 6], [15, 18]])",
          "[[1, 6], [8, 10], [15, 18]]",
        ],
      ]),
      checks("merge-touching", "Merges touching intervals transitively", [
        ["merge_intervals([[4, 5], [1, 3], [3, 4]])", "[[1, 5]]"],
      ]),
      checks("merge-contained", "Handles nested and duplicate intervals", [
        ["merge_intervals([[1, 10], [2, 3], [1, 10], [7, 8]])", "[[1, 10]]"],
      ]),
      checks("merge-small", "Handles empty and zero-length intervals", [
        ["merge_intervals([])", "[]"],
        ["merge_intervals([[2, 2], [-3, -1]])", "[[-3, -1], [2, 2]]"],
      ]),
    ],
  },
  {
    id: "longest-unique-substring",
    title: "Longest unique substring",
    difficulty: "Medium",
    topic: "Strings · Sliding windows",
    description:
      "A text analyzer wants the longest uninterrupted stretch of unique characters. Given a string text, return the length of its longest contiguous substring containing no repeated character.\n\nCharacters are case-sensitive, and spaces count as characters. Return 0 for an empty string. Aim for O(n) time.",
    examples: [
      {
        input: 'text = "abcabcbb"',
        output: "3",
        explanation: '"abc" is one longest substring with unique characters.',
      },
      {
        input: 'text = "pwwkew"',
        output: "3",
        explanation: '"wke" is contiguous; "pwke" is not.',
      },
    ],
    constraints: [
      "0 ≤ len(text) ≤ 100,000",
      "text contains ASCII letters, digits, spaces, or punctuation.",
      "Compare characters exactly; uppercase and lowercase differ.",
    ],
    starterCode:
      'def longest_unique_substring(text: str) -> int:\n    """Return the length of the longest substring with no repeats."""\n    pass\n',
    tests: [
      checks("unique-pattern", "Finds the longest unique window", [
        ['longest_unique_substring("abcabcbb")', "3"],
        ['longest_unique_substring("pwwkew")', "3"],
      ]),
      checks("unique-backtrack", "Does not move the window backward", [
        ['longest_unique_substring("abba")', "2"],
        ['longest_unique_substring("dvdf")', "3"],
      ]),
      checks("unique-characters", "Distinguishes case and counts spaces", [
        ['longest_unique_substring("aA a!")', "4"],
      ]),
      checks("unique-small", "Handles empty and repeated text", [
        ['longest_unique_substring("")', "0"],
        ['longest_unique_substring("bbbbb")', "1"],
        ['longest_unique_substring("x")', "1"],
      ]),
    ],
  },
  {
    id: "flood-fill",
    title: "Flood fill",
    difficulty: "Easy",
    topic: "Grids · Traversal",
    description:
      "Build the paint-bucket tool for a small pixel editor. Given an integer grid image, a starting row sr and column sc, and a replacement color, recolor the starting pixel and every pixel connected to it with the same original color.\n\nConnection is horizontal or vertical, never diagonal. Return the resulting grid. You may modify the input. If image is empty, return []. If the replacement color matches the original color, leave the grid unchanged.",
    examples: [
      {
        input: "image = [[1,1,1], [1,1,0], [1,0,1]], sr = 1, sc = 1, color = 2",
        output: "[[2,2,2], [2,2,0], [2,0,1]]",
        explanation:
          "The bottom-right pixel is separated from the starting region.",
      },
      {
        input: "image = [[0,0], [0,1]], sr = 1, sc = 1, color = 3",
        output: "[[0,0], [0,3]]",
      },
    ],
    constraints: [
      "image is empty or rectangular, with 1–100 rows and 1–100 columns.",
      "For a nonempty image, sr and sc are valid indices.",
      "Pixel colors and the replacement color are integers from 0 to 255.",
    ],
    starterCode:
      'def flood_fill(image: list[list[int]], sr: int, sc: int, color: int) -> list[list[int]]:\n    """Recolor the four-connected region containing (sr, sc)."""\n    pass\n',
    tests: [
      checks("fill-region", "Recolors a connected region", [
        [
          "flood_fill([[1, 1, 1], [1, 1, 0], [1, 0, 1]], 1, 1, 2)",
          "[[2, 2, 2], [2, 2, 0], [2, 0, 1]]",
        ],
      ]),
      checks("fill-diagonal", "Keeps diagonal regions separate", [
        ["flood_fill([[1, 0], [0, 1]], 0, 0, 9)", "[[9, 0], [0, 1]]"],
      ]),
      checks("fill-same", "Handles an unchanged color", [
        ["flood_fill([[2, 2], [2, 2]], 0, 0, 2)", "[[2, 2], [2, 2]]"],
      ]),
      checks("fill-small", "Handles empty and rectangular grids", [
        ["flood_fill([], 0, 0, 3)", "[]"],
        ["flood_fill([[0, 0, 1, 0]], 0, 1, 4)", "[[4, 4, 1, 0]]"],
        ["flood_fill([[7]], 0, 0, 5)", "[[5]]"],
      ]),
    ],
  },
  {
    id: "shortest-grid-path",
    title: "Shortest grid path",
    difficulty: "Medium",
    topic: "Grids · Breadth-first search",
    description:
      "A delivery robot must cross a warehouse map. Given a rectangular grid of 0s (open cells) and 1s (walls), return the minimum number of moves from the top-left cell to the bottom-right cell.\n\nEach move goes one cell up, down, left, or right. The robot cannot enter a wall. Return −1 when the grid is empty, either endpoint is blocked, or no route exists. An open one-cell grid takes 0 moves. You may modify the input.",
    examples: [
      {
        input: "grid = [[0,0,0], [1,1,0], [0,0,0]]",
        output: "4",
        explanation: "Move right twice, then down twice.",
      },
      {
        input: "grid = [[0,1], [1,0]]",
        output: "-1",
        explanation: "Diagonal moves are not allowed.",
      },
    ],
    constraints: [
      "grid is empty or rectangular, with 1–100 rows and 1–100 columns.",
      "Each cell is 0 or 1.",
      "Return the number of moves, not the number of visited cells.",
    ],
    starterCode:
      'def shortest_grid_path(grid: list[list[int]]) -> int:\n    """Return the fewest four-directional moves, or -1 if unreachable."""\n    pass\n',
    tests: [
      checks("path-route", "Finds a route around walls", [
        ["shortest_grid_path([[0, 0, 0], [1, 1, 0], [0, 0, 0]])", "4"],
      ]),
      checks("path-detour", "Measures a route longer than Manhattan distance", [
        [
          "shortest_grid_path([[0, 1, 0, 0, 0], [0, 1, 0, 1, 0], [0, 0, 0, 1, 0], [1, 1, 1, 1, 0]])",
          "11",
        ],
      ]),
      checks("path-blocked", "Rejects blocked and disconnected routes", [
        ["shortest_grid_path([[0, 1], [1, 0]])", "-1"],
        ["shortest_grid_path([[1, 0], [0, 0]])", "-1"],
        ["shortest_grid_path([[0, 0], [0, 1]])", "-1"],
      ]),
      checks("path-small", "Handles empty, single-cell, and narrow grids", [
        ["shortest_grid_path([])", "-1"],
        ["shortest_grid_path([[0]])", "0"],
        ["shortest_grid_path([[0, 0, 0, 0]])", "3"],
      ]),
    ],
  },
  {
    id: "coin-change",
    title: "Coin change",
    difficulty: "Medium",
    topic: "Dynamic programming",
    description:
      "A kiosk can dispense an unlimited supply of each coin denomination. Given distinct positive integers coins and a nonnegative integer amount, return the fewest coins needed to make that exact amount.\n\nReturn −1 if no combination works. An amount of 0 always needs 0 coins, even when coins is empty. Denominations are not necessarily sorted, and choosing the largest available coin first may not produce the best answer.",
    examples: [
      {
        input: "coins = [1, 3, 4], amount = 6",
        output: "2",
        explanation: "Two 3s use fewer coins than 4 + 1 + 1.",
      },
      { input: "coins = [2], amount = 3", output: "-1" },
    ],
    constraints: [
      "0 ≤ len(coins) ≤ 20",
      "Coin denominations are distinct integers from 1 to 10,000.",
      "0 ≤ amount ≤ 10,000",
    ],
    starterCode:
      'def coin_change(coins: list[int], amount: int) -> int:\n    """Return the minimum coin count, or -1 if exact change is impossible."""\n    pass\n',
    tests: [
      checks("coins-normal", "Makes change with repeated coins", [
        ["coin_change([5, 1, 2], 11)", "3"],
      ]),
      checks("coins-greedy", "Finds the optimum when greedy fails", [
        ["coin_change([1, 3, 4], 6)", "2"],
        ["coin_change([9, 6, 5, 1], 11)", "2"],
      ]),
      checks("coins-impossible", "Reports impossible amounts", [
        ["coin_change([2], 3)", "-1"],
        ["coin_change([], 7)", "-1"],
      ]),
      checks("coins-zero", "Handles zero and an exact denomination", [
        ["coin_change([], 0)", "0"],
        ["coin_change([2, 5], 0)", "0"],
        ["coin_change([7, 2], 7)", "1"],
      ]),
    ],
  },
];
