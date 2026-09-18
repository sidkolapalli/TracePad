/** Test-only reference implementations; these are never imported into the app. */
export const referenceSolutions: Record<string, string> = {
  "pair-sum": `def pair_sum(nums, target):
    seen = {}
    for index, value in enumerate(nums):
        if target - value in seen:
            return [seen[target - value], index]
        seen[value] = index
    return []
`,
  "balanced-brackets": `def balanced_brackets(text):
    stack = []
    pairs = {')': '(', ']': '[', '}': '{'}
    for char in text:
        if char in '([{':
            stack.append(char)
        elif not stack or stack.pop() != pairs[char]:
            return False
    return not stack
`,
  "binary-search": `def binary_search(nums, target):
    left, right = 0, len(nums) - 1
    while left <= right:
        middle = (left + right) // 2
        if nums[middle] == target:
            return middle
        if nums[middle] < target:
            left = middle + 1
        else:
            right = middle - 1
    return -1
`,
  "merging-intervals": `def merge_intervals(intervals):
    merged = []
    for start, end in sorted(intervals):
        if merged and start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    return merged
`,
  "longest-unique-substring": `def longest_unique_substring(text):
    last_seen = {}
    start = best = 0
    for end, char in enumerate(text):
        start = max(start, last_seen.get(char, -1) + 1)
        best = max(best, end - start + 1)
        last_seen[char] = end
    return best
`,
  "flood-fill": `def flood_fill(image, sr, sc, color):
    if not image:
        return []
    original = image[sr][sc]
    if original == color:
        return image
    height, width = len(image), len(image[0])
    stack = [(sr, sc)]
    image[sr][sc] = color
    while stack:
        row, col = stack.pop()
        for nr, nc in ((row-1, col), (row+1, col), (row, col-1), (row, col+1)):
            if 0 <= nr < height and 0 <= nc < width and image[nr][nc] == original:
                image[nr][nc] = color
                stack.append((nr, nc))
    return image
`,
  "shortest-grid-path": `from collections import deque

def shortest_grid_path(grid):
    if not grid or grid[0][0] or grid[-1][-1]:
        return -1
    height, width = len(grid), len(grid[0])
    queue = deque([(0, 0, 0)])
    seen = {(0, 0)}
    while queue:
        row, col, distance = queue.popleft()
        if (row, col) == (height-1, width-1):
            return distance
        for nr, nc in ((row-1, col), (row+1, col), (row, col-1), (row, col+1)):
            if 0 <= nr < height and 0 <= nc < width and grid[nr][nc] == 0 and (nr, nc) not in seen:
                seen.add((nr, nc))
                queue.append((nr, nc, distance+1))
    return -1
`,
  "coin-change": `def coin_change(coins, amount):
    best = [0] + [amount + 1] * amount
    for subtotal in range(1, amount + 1):
        for coin in coins:
            if coin <= subtotal:
                best[subtotal] = min(best[subtotal], best[subtotal - coin] + 1)
    return best[amount] if best[amount] <= amount else -1
`,
};

/** Plausible mistakes to prove that the sample suites reject broken solutions. */
export const incorrectSolutions: Record<string, string> = {
  "pair-sum": `def pair_sum(nums, target):
    for i, first in enumerate(nums):
        for j, second in enumerate(nums):
            if first + second == target:
                return [i, j]
    return []
`,
  "balanced-brackets": `def balanced_brackets(text):
    return all(text.count(a) == text.count(b) for a, b in [('(', ')'), ('[', ']'), ('{', '}')])
`,
  "binary-search": `def binary_search(nums, target):
    left, right = 0, len(nums) - 1
    while left < right:
        middle = (left + right) // 2
        if nums[middle] == target:
            return middle
        if nums[middle] < target:
            left = middle + 1
        else:
            right = middle - 1
    return -1
`,
  "merging-intervals": `def merge_intervals(intervals):
    merged = []
    for start, end in sorted(intervals):
        if merged and start < merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    return merged
`,
  "longest-unique-substring": `def longest_unique_substring(text):
    return len(set(text))
`,
  "flood-fill": `def flood_fill(image, sr, sc, color):
    if not image:
        return []
    original = image[sr][sc]
    return [[color if value == original else value for value in row] for row in image]
`,
  "shortest-grid-path": `def shortest_grid_path(grid):
    if not grid or grid[0][0] or grid[-1][-1]:
        return -1
    return len(grid) + len(grid[0]) - 2
`,
  "coin-change": `def coin_change(coins, amount):
    count = 0
    for coin in sorted(coins, reverse=True):
        count += amount // coin
        amount %= coin
    return count if amount == 0 else -1
`,
};
