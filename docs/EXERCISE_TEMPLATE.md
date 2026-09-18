# Exercise contribution template

Copy this outline into a contribution. It documents an exercise implemented through the existing TypeScript catalog; it is not an importable question-pack format. See [CONTRIBUTING.md](../CONTRIBUTING.md) for the files and checks to update.

## Identity and permission

- Stable ID:
- Title:
- Category: library exercise / topic variation / mock change
- Topic and level:
- Intended duration:
- Author or source:
- Original work, or source URL and permission/license:
- What changed if adapting existing content:

Do not contribute an employer's confidential interview question. Attribute permitted source material and preserve any required notices. Describe AI assistance if used; the contributor remains responsible for checking the contract, reference, tests, and permission to distribute the result.

## Learning objective

What specific reasoning or Python behavior should this exercise develop? What is deliberately outside its scope? Explain why its level and time budget are reasonable.

## Candidate-facing prompt

Describe the scenario and required public interface. Specify argument and return types, ordering, error behavior, mutation/identity expectations, duplicate handling, and relevant limits. Include enough information to implement a correct solution without guessing unstated rules. Questions worth clarifying can remain open only if the evaluation accepts the reasonable alternatives.

### Examples

| Input or calls        | Expected result | Explanation |
| --------------------- | --------------- | ----------- |
| Normal case           |                 |             |
| Boundary or edge case |                 |             |

### Starter code

```python
# Supply the public names and signatures for a drill or library exercise.
# A strict mock starts from a blank editor as described in its prompt.
```

## Reference solution

```python
# A clear implementation of the public contract.
```

Explain the approach, expected complexity where relevant, and at least one alternative. This reference must run using the bundled Python runtime and pass every baseline case.

## Named assertion cases

Give each case a stable ID, readable name, and independent Python assertion snippet. Each snippet runs after a fresh solution namespace is created; do not depend on a prior case. Standard-library state can remain shared within a suite, so restore any state you change and avoid global-environment side effects.

| Case ID           | Behavior                             | Why this edge matters         |
| ----------------- | ------------------------------------ | ----------------------------- |
| `example-normal`  | Ordinary use                         | Confirms the public contract  |
| `example-empty`   | Empty or minimum input               | Defines a boundary            |
| `example-state`   | Repeated use / independent instances | Finds state leakage           |
| `example-invalid` | Invalid input, if specified          | Confirms exact error contract |

Use assertions with useful failure details. For example, a counter exercise might specify that `Counter.increment()` increases its instance's `value` by one:

```python
first = Counter()
second = Counter()
first.increment()
assert first.value == 1, f"Expected first value 1, got {first.value!r}"
assert second.value == 0, "Incrementing one counter changed a different instance"
```

This is an illustrative assertion, not a complete shipped exercise. Never inspect private attributes or enforce one implementation when the prompt allows several. Random tests need a fixed seed and clear reproduction details.

## Mistakes the tests detect

| Incorrect implementation | Expected failing case | Actual verification result |
| ------------------------ | --------------------- | -------------------------- |
| Realistic mistake 1      |                       |                            |
| Realistic mistake 2      |                       |                            |
| Empty starter            |                       |                            |

Provide runnable incorrect solutions or precise mutations. Confirm that each fails at least one meaningful assertion; do not count a syntax error as evidence that an edge case is covered.

## Progressive hints

1. A question or direction that helps choose an approach.
2. A more concrete idea about data or state.
3. A useful implementation detail without replacing the learner's full solution.

## Validation record

- Correct reference passed in bundled Pyodide:
- Representative wrong solutions rejected:
- All generation branches/levels checked, if applicable:
- Prompt and examples checked manually:
- Failure messages read in the UI:
- Actual commands and outcomes:
- Remaining limitations:

Passing assertions does not establish complete correctness, appropriate difficulty, or readiness for an interview. Record what the tests actually demonstrate.
