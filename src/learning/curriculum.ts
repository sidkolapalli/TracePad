import type { PracticeCase } from "../types";
import type { Level, PracticeMode, QuestionPackage, Topic } from "./types";

export const topics: Topic[] = [
  {
    id: "python.oop.instance-state",
    title: "Classes & instance state",
    description:
      "Construct objects, keep independent state, and define useful methods.",
  },
  {
    id: "python.oop.validation",
    title: "Validation & invariants",
    description:
      "Reject invalid operations and keep an object consistent after errors.",
  },
  {
    id: "python.oop.composition",
    title: "Composition",
    description:
      "Build collaborating objects and choose where responsibilities belong.",
  },
  {
    id: "python.oop.polymorphism",
    title: "Inheritance & polymorphism",
    description:
      "Override behavior and use a shared interface without type checks.",
  },
  {
    id: "python.fundamentals.collections",
    title: "Lists, dictionaries & sets",
    description:
      "Choose data structures, aggregate records, and preserve ordering.",
  },
  {
    id: "python.debugging.edge-cases",
    title: "Debugging & edge cases",
    description:
      "Repair a plausible implementation and reason about boundary cases.",
  },
];

type Content = Pick<
  QuestionPackage,
  | "title"
  | "prompt"
  | "starterCode"
  | "examples"
  | "constraints"
  | "baselineTests"
  | "hints"
  | "referenceSolution"
  | "learningObjectives"
> & { templateId: string };
const cases = (entries: [string, string][]): PracticeCase[] =>
  entries.map(([name, code], index) => ({
    id: `baseline-${index + 1}`,
    name,
    code,
  }));
const raises = (statement: string, error = "ValueError") =>
  `try:\n    ${statement}\nexcept ${error}:\n    pass\nelse:\n    raise AssertionError("Expected ${error}")`;
const py = (value: string) => JSON.stringify(value);

function playlist(applied: boolean, n: number): Content {
  const first = `Track ${n}`,
    second = `Track ${n + 1}`;
  return {
    templateId: "oop.playlist.v1",
    title: applied ? "Playlist with replay" : "Build a listening queue",
    prompt: `A listening app needs a Playlist class. Each object owns an independent queue.\n\nImplement Playlist(name). Store its name as .name. add(track) appends a string, including duplicates, and returns None. pending() returns a new list of waiting tracks. play_next() removes and returns the oldest waiting track, or returns None for an empty queue.${applied ? "\n\nAdd .played_count, initially 0, counting successful play_next calls. replay_last() puts the most recently played track at the front of the queue and returns True. It returns False if nothing has played. Replaying does not itself increment played_count or change the most recently played track; repeated replay requests each add a copy." : ""}\n\nExplain where mutable state belongs and why callers should not receive the internal queue.`,
    starterCode: `class Playlist:\n    def __init__(self, name):\n        pass\n\n    def add(self, track):\n        pass\n\n    def pending(self):\n        pass\n\n    def play_next(self):\n        pass\n${applied ? "\n    def replay_last(self):\n        pass\n" : ""}`,
    examples: [
      {
        input: `p = Playlist("Morning"); p.add(${py(first)}); p.add(${py(second)}); p.play_next()`,
        output: py(first),
        explanation: `p.pending() is now [${py(second)}].`,
      },
    ],
    constraints: [
      "Names and tracks are nonempty strings; no type validation is needed.",
      "Do not use class-level mutable collections.",
      "Do not print results; return the documented values.",
    ],
    baselineTests: cases([
      [
        "Empty queue and constructor",
        'p = Playlist("Morning")\nassert p.name == "Morning"\nassert p.pending() == []\nassert p.play_next() is None',
      ],
      [
        "First in, first out",
        `p = Playlist("A")\nassert p.add(${py(first)}) is None\np.add(${py(second)})\nassert p.play_next() == ${py(first)}\nassert p.play_next() == ${py(second)}\nassert p.play_next() is None`,
      ],
      [
        "Instances never share tracks",
        `a, b = Playlist("A"), Playlist("B")\na.add(${py(first)})\nassert b.pending() == []\nassert b.play_next() is None\nassert a.pending() == [${py(first)}]`,
      ],
      [
        "Duplicates stay in order",
        `p = Playlist("A")\np.add(${py(first)})\np.add(${py(first)})\nassert p.pending() == [${py(first)}, ${py(first)}]\np.play_next()\nassert p.pending() == [${py(first)}]`,
      ],
      [
        "Queue snapshots cannot mutate the object",
        'p = Playlist("A")\np.add("one")\nview = p.pending()\nview.append("injected")\nassert p.pending() == ["one"]\np.play_next()\nassert view == ["one", "injected"]',
      ],
      ...(applied
        ? [
            [
              "Replay has precise counting semantics",
              'p = Playlist("A")\nassert p.played_count == 0\nassert p.replay_last() is False\np.add("one")\np.add("two")\nassert p.play_next() == "one"\nassert p.played_count == 1\nassert p.replay_last() is True\nassert p.replay_last() is True\nassert p.played_count == 1\nassert p.pending() == ["one", "one", "two"]\nassert p.play_next() == "one"\nassert p.played_count == 2\nassert Playlist("B").played_count == 0',
            ] as [string, string],
          ]
        : []),
    ]),
    hints: [
      "Write down the state for one playlist. Imagine two playlists being used in alternating order.",
      "Create the list in __init__. Return a list copy from pending, and guard the empty case before removing index 0.",
      applied
        ? "Keep a last-played value and a counter. Only successful play_next changes them; replay_last inserts at index 0."
        : "A minimal play_next checks whether the list is empty, then returns the value removed by pop(0).",
    ],
    referenceSolution: `class Playlist:\n    def __init__(self, name):\n        self.name = name\n        self._tracks = []\n${applied ? "        self._last = None\n        self.played_count = 0\n" : ""}\n    def add(self, track):\n        self._tracks.append(track)\n\n    def pending(self):\n        return list(self._tracks)\n\n    def play_next(self):\n        if not self._tracks:\n            return None\n        track = self._tracks.pop(0)\n${applied ? "        self._last = track\n        self.played_count += 1\n" : ""}        return track\n${applied ? "\n    def replay_last(self):\n        if self._last is None:\n            return False\n        self._tracks.insert(0, self._last)\n        return True\n" : ""}`,
    learningObjectives: [
      "Distinguish instance attributes from class attributes.",
      "Preserve queue order and independent mutable state.",
      "Protect internal collections by returning snapshots.",
      ...(applied
        ? [
            "Define and test transitions involving multiple instance attributes.",
          ]
        : []),
    ],
  };
}

function basket(applied: boolean, n: number): Content {
  return {
    templateId: "oop.basket.v1",
    title: applied ? "Basket with partial removal" : "Count a shopping basket",
    prompt: `Implement Basket(owner), storing .owner. Each basket maintains its own item quantities. add(item, quantity=1) increases that item's quantity and returns None. quantity(item) returns the count or 0 when absent. total_items() returns the sum of all quantities, not the number of distinct products.${applied ? "\n\nAdd take(item, quantity=1): return False and change nothing if fewer than quantity are present; otherwise remove that quantity and return True. Remove zero-count entries. items() returns a new dictionary of the remaining positive quantities." : ""}\n\nDescribe the tradeoff between storing repeated items in a list and storing counts in a dictionary.`,
    starterCode: `class Basket:\n    def __init__(self, owner):\n        pass\n\n    def add(self, item, quantity=1):\n        pass\n\n    def quantity(self, item):\n        pass\n\n    def total_items(self):\n        pass\n${applied ? "\n    def take(self, item, quantity=1):\n        pass\n\n    def items(self):\n        pass\n" : ""}`,
    examples: [
      {
        input: `b = Basket("Sam"); b.add("pear", ${n}); b.add("pear"); b.total_items()`,
        output: String(n + 1),
      },
    ],
    constraints: [
      "Owner and item names are nonempty strings.",
      "Quantities supplied to methods are positive integers.",
      "Each object must own its mutable state; method calls must not print.",
    ],
    baselineTests: cases([
      [
        "Empty basket",
        'b = Basket("Sam")\nassert b.owner == "Sam"\nassert b.quantity("missing") == 0\nassert b.total_items() == 0',
      ],
      [
        "Accumulate repeated products",
        `b = Basket("Sam")\nassert b.add("pear", ${n}) is None\nb.add("pear")\nassert b.quantity("pear") == ${n + 1}\nassert b.total_items() == ${n + 1}`,
      ],
      [
        "Sum quantities, not distinct items",
        `b = Basket("Sam")\nb.add("pear", ${n})\nb.add("apple", 2)\nassert b.total_items() == ${n + 2}\nassert b.quantity("apple") == 2`,
      ],
      [
        "Independent baskets",
        'a, b = Basket("A"), Basket("B")\na.add("pear", 3)\nb.add("apple")\nassert a.quantity("apple") == 0\nassert b.quantity("pear") == 0\nassert a.total_items() == 3\nassert b.total_items() == 1',
      ],
      [
        applied
          ? "Partial removal and failed removal preserve counts"
          : "Unknown lookup leaves totals unchanged",
        applied
          ? `b = Basket("Sam")\nb.add("pear", ${n})\nassert b.take("pear", ${n + 1}) is False\nassert b.quantity("pear") == ${n}\nassert b.take("pear") is True\nassert b.quantity("pear") == ${n - 1}\nassert b.take("missing") is False\nassert b.take("pear", ${n - 1}) is True\nassert b.items() == {}`
          : 'b = Basket("Sam")\nb.add("pear", 2)\nassert b.quantity("missing") == 0\nassert b.total_items() == 2',
      ],
      ...(applied
        ? [
            [
              "Item snapshots are independent",
              'b = Basket("Sam")\nb.add("pear", 2)\nview = b.items()\nview["pear"] = 99\nview["apple"] = 1\nassert b.items() == {"pear": 2}\nb.add("pear")\nassert view["pear"] == 99',
            ] as [string, string],
          ]
        : []),
    ]),
    hints: [
      "Which dictionary maps a product to the quantity for a single basket?",
      "Use get(item, 0) when accumulating or looking up counts. total_items sums dictionary values.",
      applied
        ? "Check availability before changing anything in take. Delete an entry when its new count is zero; return a copy from items."
        : "Initialize a new dictionary in __init__, rather than sharing a dictionary on the class.",
    ],
    referenceSolution: `class Basket:\n    def __init__(self, owner):\n        self.owner = owner\n        self._counts = {}\n\n    def add(self, item, quantity=1):\n        self._counts[item] = self._counts.get(item, 0) + quantity\n\n    def quantity(self, item):\n        return self._counts.get(item, 0)\n\n    def total_items(self):\n        return sum(self._counts.values())\n${applied ? "\n    def take(self, item, quantity=1):\n        if self.quantity(item) < quantity:\n            return False\n        self._counts[item] -= quantity\n        if self._counts[item] == 0:\n            del self._counts[item]\n        return True\n\n    def items(self):\n        return dict(self._counts)\n" : ""}`,
    learningObjectives: [
      "Represent object state with a dictionary.",
      "Accumulate values rather than overwrite them.",
      "Separate distinct-item count from total quantity.",
      ...(applied
        ? ["Make rejected mutations leave the object unchanged."]
        : []),
    ],
  };
}

function bank(applied: boolean, n: number): Content {
  const balance = n * 10;
  return {
    templateId: "oop.account.v1",
    title: applied ? "Atomic account transfers" : "An account that stays valid",
    prompt: `Implement Account(opening_balance=0) with a .balance attribute. Negative opening balances raise ValueError. deposit(amount) and withdraw(amount) accept strictly positive integers; all other integer amounts raise ValueError. A withdrawal above the balance also raises ValueError. Successful operations return None. Every rejected operation must preserve the original balance.${applied ? "\n\nImplement transfer_to(other, amount), where other is an Account. Transfer a positive amount if enough funds exist, returning None. Reject a transfer to the same object, nonpositive amounts, and insufficient funds with ValueError. A rejected transfer must leave both accounts unchanged." : ""}\n\nExplain which checks must happen before any state changes.`,
    starterCode: `class Account:\n    def __init__(self, opening_balance=0):\n        pass\n\n    def deposit(self, amount):\n        pass\n\n    def withdraw(self, amount):\n        pass\n${applied ? "\n    def transfer_to(self, other, amount):\n        pass\n" : ""}`,
    examples: [
      {
        input: `a = Account(${balance}); a.withdraw(${n}); a.balance`,
        output: String(balance - n),
      },
    ],
    constraints: [
      "Balances and amounts use integers (for example cents); no floating-point money.",
      "Inputs have the documented types; type validation is not required.",
      "Methods must raise ValueError rather than print an error.",
    ],
    baselineTests: cases([
      [
        "Constructor validation",
        `assert Account().balance == 0\n${raises("Account(-1)")}`,
      ],
      [
        "Deposits, withdrawals, and exact depletion",
        `a = Account(${balance})\nassert a.deposit(${n}) is None\nassert a.balance == ${balance + n}\nassert a.withdraw(${balance + n}) is None\nassert a.balance == 0`,
      ],
      [
        "Reject nonpositive deposits without mutation",
        `a = Account(${balance})\nfor amount in (0, -1, -${n}):\n    try:\n        a.deposit(amount)\n    except ValueError:\n        pass\n    else:\n        raise AssertionError("Expected ValueError")\n    assert a.balance == ${balance}`,
      ],
      [
        "Reject invalid withdrawals without mutation",
        `a = Account(${balance})\nfor amount in (0, -1, ${balance + 1}):\n    try:\n        a.withdraw(amount)\n    except ValueError:\n        pass\n    else:\n        raise AssertionError("Expected ValueError")\n    assert a.balance == ${balance}`,
      ],
      [
        applied
          ? "Transfer moves value between independent accounts"
          : "Balances belong to each account",
        applied
          ? `a, b = Account(${balance}), Account(${n})\nassert a.transfer_to(b, ${balance}) is None\nassert a.balance == 0\nassert b.balance == ${balance + n}`
          : `a, b = Account(${balance}), Account(${n})\na.withdraw(1)\nassert b.balance == ${n}\nassert a.balance == ${balance - 1}`,
      ],
      ...(applied
        ? [
            [
              "Invalid transfer is atomic",
              `a, b = Account(${balance}), Account(${n})\nfor amount in (0, -1, ${balance + 1}):\n    try:\n        a.transfer_to(b, amount)\n    except ValueError:\n        pass\n    else:\n        raise AssertionError("Expected ValueError")\n    assert (a.balance, b.balance) == (${balance}, ${n})\n${raises("a.transfer_to(a, 1)")}\nassert a.balance == ${balance}`,
            ] as [string, string],
          ]
        : []),
    ]),
    hints: [
      "Define the invariant: every account balance stays nonnegative, even after a method raises.",
      "Validate before updating balance. A strictly positive amount excludes zero as well as negative numbers.",
      applied
        ? "Check identity with other is self. Validate the source and amount before either account changes, then subtract and add."
        : "Withdrawal has two independent rejection reasons: a nonpositive amount and an amount greater than the current balance.",
    ],
    referenceSolution: `class Account:\n    def __init__(self, opening_balance=0):\n        if opening_balance < 0:\n            raise ValueError("Negative opening balance")\n        self.balance = opening_balance\n\n    def deposit(self, amount):\n        if amount <= 0:\n            raise ValueError("Amount must be positive")\n        self.balance += amount\n\n    def withdraw(self, amount):\n        if amount <= 0 or amount > self.balance:\n            raise ValueError("Invalid withdrawal")\n        self.balance -= amount\n${applied ? '\n    def transfer_to(self, other, amount):\n        if other is self or amount <= 0 or amount > self.balance:\n            raise ValueError("Invalid transfer")\n        self.balance -= amount\n        other.balance += amount\n' : ""}`,
    learningObjectives: [
      "Express invariants through constructor and method validation.",
      "Raise meaningful exceptions.",
      "Keep state unchanged when rejecting an operation.",
      ...(applied
        ? ["Coordinate mutations across two objects atomically."]
        : []),
    ],
  };
}

function reservation(applied: boolean, n: number): Content {
  return {
    templateId: "oop.reservation.v1",
    title: applied
      ? "Reservations and cancellations"
      : "Never overbook a session",
    prompt: `Implement Session(capacity), with .capacity and .booked (initially 0). Capacity must be a positive integer; nonpositive values raise ValueError. available() returns capacity minus booked. book(seats) reserves a strictly positive number of seats and returns the new available count. Invalid amounts or a request exceeding available seats raise ValueError without changing state.${applied ? "\n\nImplement cancel(seats), which releases a strictly positive number of booked seats and returns the new available count. Reject nonpositive cancellations or cancellations greater than the current booked count with ValueError, leaving state intact." : ""}\n\nExplain the invariant connecting capacity, booked, and available seats.`,
    starterCode: `class Session:\n    def __init__(self, capacity):\n        pass\n\n    def available(self):\n        pass\n\n    def book(self, seats):\n        pass\n${applied ? "\n    def cancel(self, seats):\n        pass\n" : ""}`,
    examples: [
      {
        input: `s = Session(${n + 2}); s.book(${n})`,
        output: "2",
        explanation: `${n} seats are booked; 2 remain available.`,
      },
    ],
    constraints: [
      "Capacity and seats are integers; no type checks are required.",
      "A fully booked session is valid.",
      "Reject invalid operations before mutating attributes.",
    ],
    baselineTests: cases([
      [
        "Capacity and initial state",
        `s = Session(${n})\nassert (s.capacity, s.booked, s.available()) == (${n}, 0, ${n})\n${raises("Session(0)")}\n${raises("Session(-1)")}`,
      ],
      [
        "Successive reservations reach capacity",
        `s = Session(${n + 1})\nassert s.book(1) == ${n}\nassert s.book(${n}) == 0\nassert s.booked == ${n + 1}`,
      ],
      [
        "Overbooking changes nothing",
        `s = Session(${n})\ns.book(1)\n${raises(`s.book(${n})`)}\nassert s.booked == 1\nassert s.available() == ${n - 1}`,
      ],
      [
        "Nonpositive booking leaves state intact",
        `s = Session(${n})\n${raises("s.book(0)")}\n${raises("s.book(-1)")}\nassert s.booked == 0\nassert s.available() == ${n}`,
      ],
      [
        applied
          ? "Cancel and rebook released capacity"
          : "Sessions have independent occupancy",
        applied
          ? `s = Session(${n})\ns.book(${n})\nassert s.cancel(1) == 1\nassert s.booked == ${n - 1}\nassert s.book(1) == 0\nassert s.cancel(${n}) == ${n}\nassert s.booked == 0`
          : `a, b = Session(${n}), Session(${n})\na.book(${n})\nassert b.available() == ${n}\nassert b.booked == 0`,
      ],
      ...(applied
        ? [
            [
              "Reject cancellation without creating capacity",
              `s = Session(${n})\ns.book(1)\nfor seats in (0, -1, 2):\n    try:\n        s.cancel(seats)\n    except ValueError:\n        pass\n    else:\n        raise AssertionError("Expected ValueError")\n    assert s.booked == 1\n    assert s.available() == ${n - 1}`,
            ] as [string, string],
          ]
        : []),
    ]),
    hints: [
      "Think in terms of 0 <= booked <= capacity; derive availability instead of storing another count.",
      "Validate all rejection conditions before incrementing booked. Return capacity minus the updated booked value.",
      applied
        ? "Cancellation mirrors booking, but its upper bound is booked, not capacity. Check first, then decrement."
        : "Test the boundary where a reservation fills the last seat, then try one more reservation.",
    ],
    referenceSolution: `class Session:\n    def __init__(self, capacity):\n        if capacity <= 0:\n            raise ValueError("Capacity must be positive")\n        self.capacity = capacity\n        self.booked = 0\n\n    def available(self):\n        return self.capacity - self.booked\n\n    def book(self, seats):\n        if seats <= 0 or seats > self.available():\n            raise ValueError("Invalid booking")\n        self.booked += seats\n        return self.available()\n${applied ? '\n    def cancel(self, seats):\n        if seats <= 0 or seats > self.booked:\n            raise ValueError("Invalid cancellation")\n        self.booked -= seats\n        return self.available()\n' : ""}`,
    learningObjectives: [
      "Derive values from canonical state.",
      "Test exact-capacity and over-capacity boundaries.",
      "Maintain invariants after validation failures.",
      ...(applied ? ["Implement a reversible state transition."] : []),
    ],
  };
}

function project(applied: boolean, n: number): Content {
  return {
    templateId: "oop.project.v1",
    title: applied ? "Projects with live progress" : "A project made of tasks",
    prompt: `Implement two collaborating classes. Task(title) stores .title and .done (False initially). complete() sets done to True and returns None; repeated completion is harmless. Project(name) stores .name. add(task) keeps the supplied Task object and returns None. pending_titles() returns a new list of titles for incomplete tasks, in insertion order. Changes to a Task after it is added must be visible through the Project.${applied ? "\n\nAdd progress() returning a tuple (completed_count, total_count), and remove(task) removing the first reference to that exact object and returning True, or False if absent. Matching titles do not make two tasks the same object." : ""}\n\nA Task can be shared by two projects, and the same Task can appear more than once in one project. Count each entry. Explain why the Project should hold object references rather than copies of task state.`,
    starterCode: `class Task:\n    def __init__(self, title):\n        pass\n\n    def complete(self):\n        pass\n\n\nclass Project:\n    def __init__(self, name):\n        pass\n\n    def add(self, task):\n        pass\n\n    def pending_titles(self):\n        pass\n${applied ? "\n    def progress(self):\n        pass\n\n    def remove(self, task):\n        pass\n" : ""}`,
    examples: [
      {
        input: `t = Task("Step ${n}"); p = Project("Interview"); p.add(t); t.complete(); p.pending_titles()`,
        output: "[]",
      },
    ],
    constraints: [
      "Names and titles are nonempty strings; add receives a Task.",
      "Task state is public as specified; users may inspect .done.",
      "Return snapshots from collection-returning methods.",
    ],
    baselineTests: cases([
      [
        "Construct and complete a task",
        't = Task("Plan")\nassert t.title == "Plan"\nassert t.done is False\nassert t.complete() is None\nassert t.complete() is None\nassert t.done is True',
      ],
      [
        "Empty project and insertion order",
        `p = Project("Interview")\nassert p.name == "Interview"\nassert p.pending_titles() == []\nassert p.add(Task("Step ${n}")) is None\np.add(Task("Step ${n + 1}"))\nassert p.pending_titles() == ["Step ${n}", "Step ${n + 1}"]`,
      ],
      [
        "External task completion is visible",
        't = Task("Plan")\np = Project("A")\np.add(t)\nt.complete()\nassert p.pending_titles() == []',
      ],
      [
        "Shared tasks and independent projects",
        't = Task("Shared")\na, b = Project("A"), Project("B")\na.add(t)\nassert b.pending_titles() == []\nb.add(t)\na.add(Task("Only A"))\nt.complete()\nassert a.pending_titles() == ["Only A"]\nassert b.pending_titles() == []',
      ],
      [
        applied
          ? "Progress counts entries and follows live changes"
          : "Returned titles are a snapshot",
        applied
          ? 'p = Project("A")\nassert p.progress() == (0, 0)\nt = Task("One")\np.add(t)\np.add(t)\np.add(Task("Two"))\nassert p.progress() == (0, 3)\nt.complete()\nassert p.progress() == (2, 3)'
          : 'p = Project("A")\nt = Task("One")\np.add(t)\nview = p.pending_titles()\nview.append("injected")\nassert p.pending_titles() == ["One"]\nt.complete()\nassert view == ["One", "injected"]',
      ],
      ...(applied
        ? [
            [
              "Removal matches identity and removes one occurrence",
              'p = Project("A")\na, b = Task("Same"), Task("Same")\np.add(a)\np.add(a)\np.add(b)\nassert p.remove(Task("Same")) is False\nassert p.remove(a) is True\nassert p.progress() == (0, 2)\na.complete()\nassert p.progress() == (1, 2)\nassert p.remove(a) is True\nassert p.remove(a) is False\nassert p.pending_titles() == ["Same"]',
            ] as [string, string],
          ]
        : []),
    ]),
    hints: [
      "Task manages its own completion; Project manages a collection of Task references.",
      "Store the supplied object in a per-project list. Derive pending titles each time by inspecting task.done.",
      applied
        ? "Compute progress on demand so external changes are visible. For removal, enumerate entries and compare with is, then remove just that index."
        : "Do not save a separate copy of the done flag when adding a task: that copy would become stale.",
    ],
    referenceSolution: `class Task:\n    def __init__(self, title):\n        self.title = title\n        self.done = False\n\n    def complete(self):\n        self.done = True\n\n\nclass Project:\n    def __init__(self, name):\n        self.name = name\n        self._tasks = []\n\n    def add(self, task):\n        self._tasks.append(task)\n\n    def pending_titles(self):\n        return [task.title for task in self._tasks if not task.done]\n${applied ? "\n    def progress(self):\n        return (sum(task.done for task in self._tasks), len(self._tasks))\n\n    def remove(self, task):\n        for index, stored in enumerate(self._tasks):\n            if stored is task:\n                self._tasks.pop(index)\n                return True\n        return False\n" : ""}`,
    learningObjectives: [
      "Separate collection responsibilities from object responsibilities.",
      "Model composition using object references.",
      "Observe live state through collaborating objects.",
      ...(applied ? ["Distinguish identity from equal-looking data."] : []),
    ],
  };
}

function cart(applied: boolean, n: number): Content {
  return {
    templateId: "oop.cart.v1",
    title: applied
      ? "A cart with mutable products"
      : "Compose products into a cart",
    prompt: `Implement Product(name, price), storing public .name and .price (integer cents). Implement Cart() with add(product, quantity=1), returning None, and total(), returning the sum of current product prices multiplied by their quantities. Each add creates a separate line, even for the same Product. Store the supplied Product objects: changing a product's price after adding it must change the cart total.${applied ? "\n\nAdd receipt() returning a new list of tuples (name, quantity, line_total) in insertion order, using current product data. remove(product) removes all lines referencing that exact object and returns the number of removed lines. A different object with the same name is not a match." : ""}\n\nExplain which object knows about a product price and which knows how many units were added.`,
    starterCode: `class Product:\n    def __init__(self, name, price):\n        pass\n\n\nclass Cart:\n    def __init__(self):\n        pass\n\n    def add(self, product, quantity=1):\n        pass\n\n    def total(self):\n        pass\n${applied ? "\n    def receipt(self):\n        pass\n\n    def remove(self, product):\n        pass\n" : ""}`,
    examples: [
      {
        input: `p = Product("Notebook", ${n * 100}); c = Cart(); c.add(p, 2); c.total()`,
        output: String(n * 200),
      },
    ],
    constraints: [
      "Prices are nonnegative integer cents; quantities are positive integers.",
      "Inputs are valid; validation is outside this exercise.",
      "Keep separate cart line collections per Cart.",
    ],
    baselineTests: cases([
      [
        "Empty cart and product fields",
        `p = Product("Notebook", ${n * 100})\nassert (p.name, p.price) == ("Notebook", ${n * 100})\nassert Cart().total() == 0`,
      ],
      [
        "Prices are multiplied by quantities",
        `c = Cart()\nassert c.add(Product("A", ${n}), 3) is None\nc.add(Product("B", 2))\nassert c.total() == ${n * 3 + 2}`,
      ],
      [
        "Cart follows product price changes",
        'p = Product("A", 10)\nc = Cart()\nc.add(p, 2)\np.price = 7\nassert c.total() == 14\np.price = 0\nassert c.total() == 0',
      ],
      [
        "Independent carts and repeated products",
        'p = Product("A", 5)\na, b = Cart(), Cart()\na.add(p, 2)\na.add(p, 3)\nassert a.total() == 25\nassert b.total() == 0\nb.add(p)\np.price = 2\nassert a.total() == 10\nassert b.total() == 2',
      ],
      [
        applied
          ? "Receipt preserves lines and is a snapshot"
          : "Zero-priced products",
        applied
          ? 'p = Product("A", 5)\nc = Cart()\nc.add(p, 2)\nc.add(p)\nview = c.receipt()\nassert view == [("A", 2, 10), ("A", 1, 5)]\nview.clear()\nassert len(c.receipt()) == 2\np.name = "B"\np.price = 3\nassert c.receipt() == [("B", 2, 6), ("B", 1, 3)]'
          : 'c = Cart()\nc.add(Product("Gift", 0), 99)\nc.add(Product("A", 4))\nassert c.total() == 4',
      ],
      ...(applied
        ? [
            [
              "Remove all lines by object identity",
              'a, b = Product("Same", 5), Product("Same", 5)\nc = Cart()\nc.add(a, 2)\nc.add(b)\nc.add(a)\nassert c.remove(Product("Same", 5)) == 0\nassert c.remove(a) == 2\nassert c.total() == 5\nassert c.receipt() == [("Same", 1, 5)]\nassert c.remove(a) == 0',
            ] as [string, string],
          ]
        : []),
    ]),
    hints: [
      "The cart can store pairs of (Product object, quantity). Product should not store a cart-specific quantity.",
      "Calculate total from the object references at call time, rather than caching prices when adding lines.",
      applied
        ? "A receipt converts each line to a tuple. Removal uses product identity; count matching lines before retaining only nonmatches."
        : "A generator expression can multiply each line price by its quantity and sum the results.",
    ],
    referenceSolution: `class Product:\n    def __init__(self, name, price):\n        self.name = name\n        self.price = price\n\n\nclass Cart:\n    def __init__(self):\n        self._lines = []\n\n    def add(self, product, quantity=1):\n        self._lines.append((product, quantity))\n\n    def total(self):\n        return sum(product.price * quantity for product, quantity in self._lines)\n${applied ? "\n    def receipt(self):\n        return [(product.name, quantity, product.price * quantity) for product, quantity in self._lines]\n\n    def remove(self, product):\n        count = sum(stored is product for stored, _ in self._lines)\n        self._lines = [(stored, quantity) for stored, quantity in self._lines if stored is not product]\n        return count\n" : ""}`,
    learningObjectives: [
      "Compose a collection from domain objects.",
      "Keep product data and cart quantities in the right objects.",
      "Calculate derived values from live state.",
      ...(applied
        ? ["Use identity when equal attributes are insufficient."]
        : []),
    ],
  };
}

function pricing(applied: boolean, n: number): Content {
  return {
    templateId: "oop.pricing.v1",
    title: applied
      ? "Three interchangeable price policies"
      : "Override a pricing policy",
    prompt: `Implement PricingPolicy with price(subtotal) returning subtotal. Implement FixedDiscount(PricingPolicy), initialized with amount, whose price(subtotal) subtracts amount but never returns less than 0. Implement checkout(subtotals, policy), returning a list produced by calling policy.price on each subtotal in order. checkout must work with any object exposing price, without isinstance checks.${applied ? "\n\nAdd ThresholdDiscount(PricingPolicy), initialized with threshold and amount. Its price subtracts amount only when subtotal >= threshold, again floored at 0. All policies must inherit from PricingPolicy and override behavior where appropriate." : ""}\n\nExplain how inheritance and duck typing both appear in this design.`,
    starterCode: `class PricingPolicy:\n    def price(self, subtotal):\n        pass\n\n\nclass FixedDiscount(PricingPolicy):\n    def __init__(self, amount):\n        pass\n\n    def price(self, subtotal):\n        pass\n${applied ? "\n\nclass ThresholdDiscount(PricingPolicy):\n    def __init__(self, threshold, amount):\n        pass\n\n    def price(self, subtotal):\n        pass\n" : ""}\n\ndef checkout(subtotals, policy):\n    pass\n`,
    examples: [
      {
        input: `checkout([0, ${n}, ${n * 3}], FixedDiscount(${n + 1}))`,
        output: `[0, 0, ${n * 2 - 1}]`,
      },
    ],
    constraints: [
      "Subtotals, discount amounts, and thresholds are nonnegative integers.",
      "checkout must not mutate the input list.",
      "No type-specific branching inside checkout.",
    ],
    baselineTests: cases([
      [
        "Base policy and inheritance",
        `assert PricingPolicy().price(${n}) == ${n}\nassert isinstance(FixedDiscount(1), PricingPolicy)`,
      ],
      [
        "Discount floors at zero",
        `p = FixedDiscount(${n})\nassert p.price(${n * 3}) == ${n * 2}\nassert p.price(${n}) == 0\nassert p.price(0) == 0\nassert FixedDiscount(0).price(${n}) == ${n}`,
      ],
      [
        "Checkout preserves order and input",
        `values = [${n * 4}, 0, ${n}]\nassert checkout(values, FixedDiscount(${n + 1})) == [${n * 3 - 1}, 0, 0]\nassert values == [${n * 4}, 0, ${n}]\nassert checkout([], PricingPolicy()) == []`,
      ],
      [
        "A new policy works without type checks",
        "class DoublePolicy:\n    def price(self, subtotal):\n        return subtotal * 2\nassert checkout([3, 1, 0], DoublePolicy()) == [6, 2, 0]",
      ],
      [
        applied
          ? "Threshold boundary and floor"
          : "Policies keep independent configuration",
        applied
          ? `p = ThresholdDiscount(${n * 2}, ${n})\nassert isinstance(p, PricingPolicy)\nassert p.price(${n * 2 - 1}) == ${n * 2 - 1}\nassert p.price(${n * 2}) == ${n}\nassert p.price(${n * 3}) == ${n * 2}\nassert ThresholdDiscount(0, 99).price(2) == 0`
          : `a, b = FixedDiscount(${n}), FixedDiscount(1)\nassert a.price(${n * 2}) == ${n}\nassert b.price(${n * 2}) == ${n * 2 - 1}`,
      ],
      ...(applied
        ? [
            [
              "Checkout dispatches threshold override",
              `assert checkout([${n - 1}, ${n}, ${n + 1}], ThresholdDiscount(${n}, 1)) == [${n - 1}, ${n - 1}, ${n}]`,
            ] as [string, string],
          ]
        : []),
    ]),
    hints: [
      "Give every policy the same method signature. Let callers invoke that method without asking what class it belongs to.",
      "FixedDiscount stores amount per instance and overrides price using max(0, subtotal - amount).",
      applied
        ? "ThresholdDiscount changes behavior at an inclusive >= boundary. checkout simply calls policy.price for each input value."
        : "Use a list comprehension in checkout. An unrelated class with a compatible price method should also work.",
    ],
    referenceSolution: `class PricingPolicy:\n    def price(self, subtotal):\n        return subtotal\n\n\nclass FixedDiscount(PricingPolicy):\n    def __init__(self, amount):\n        self.amount = amount\n\n    def price(self, subtotal):\n        return max(0, subtotal - self.amount)\n${applied ? "\n\nclass ThresholdDiscount(PricingPolicy):\n    def __init__(self, threshold, amount):\n        self.threshold = threshold\n        self.amount = amount\n\n    def price(self, subtotal):\n        return max(0, subtotal - self.amount) if subtotal >= self.threshold else subtotal\n" : ""}\n\ndef checkout(subtotals, policy):\n    return [policy.price(value) for value in subtotals]\n`,
    learningObjectives: [
      "Override behavior through inheritance.",
      "Program against a method interface.",
      "Allow duck-typed implementations without type switches.",
      ...(applied ? ["Test inclusive thresholds on overridden behavior."] : []),
    ],
  };
}

function notification(applied: boolean, n: number): Content {
  return {
    templateId: "oop.notifier.v1",
    title: applied
      ? "Chainable notification formats"
      : "Polymorphic message formatting",
    prompt: `Implement Formatter with format(message) returning message unchanged. PrefixFormatter(Formatter) stores a prefix and overrides format to return prefix + message with no added whitespace. UpperFormatter(Formatter) overrides format to return message.upper(). Implement deliver(messages, formatter), returning a new list by calling formatter.format for each message in order. It must support unrelated objects with a format method.${applied ? "\n\nAdd PipelineFormatter(Formatter), initialized with a list of formatter objects. Copy the list on construction. Its format passes a message through the formatters from left to right, returning the final string. An empty pipeline is an identity operation. A pipeline can contain another pipeline." : ""}\n\nExplain why deliver does not need to know every formatter class.`,
    starterCode: `class Formatter:\n    def format(self, message):\n        pass\n\n\nclass PrefixFormatter(Formatter):\n    def __init__(self, prefix):\n        pass\n\n    def format(self, message):\n        pass\n\n\nclass UpperFormatter(Formatter):\n    def format(self, message):\n        pass\n${applied ? "\n\nclass PipelineFormatter(Formatter):\n    def __init__(self, formatters):\n        pass\n\n    def format(self, message):\n        pass\n" : ""}\n\ndef deliver(messages, formatter):\n    pass\n`,
    examples: [
      {
        input: `deliver(["ready", ""], PrefixFormatter("[${n}] "))`,
        output: `["[${n}] ready", "[${n}] "]`,
      },
    ],
    constraints: [
      "Messages and prefixes are strings, including empty strings.",
      "Formatting must not print or mutate the message list.",
      "Use method dispatch rather than branching on formatter types.",
    ],
    baselineTests: cases([
      [
        "Base and overrides",
        'assert Formatter().format("aB") == "aB"\nassert isinstance(PrefixFormatter(""), Formatter)\nassert isinstance(UpperFormatter(), Formatter)\nassert UpperFormatter().format("aB") == "AB"',
      ],
      [
        "Prefixes and empty messages",
        `p = PrefixFormatter("[${n}] ")\nassert p.format("ready") == "[${n}] ready"\nassert p.format("") == "[${n}] "\nassert PrefixFormatter("").format("x") == "x"`,
      ],
      [
        "Deliver preserves input order",
        'messages = ["b", "a", ""]\nassert deliver(messages, UpperFormatter()) == ["B", "A", ""]\nassert messages == ["b", "a", ""]\nassert deliver([], Formatter()) == []',
      ],
      [
        "Unknown formatter dispatches normally",
        'class ReverseFormatter:\n    def format(self, message):\n        return message[::-1]\nassert deliver(["ab", "xy"], ReverseFormatter()) == ["ba", "yx"]',
      ],
      [
        applied
          ? "Pipeline respects order and empty pipeline"
          : "Instances retain independent prefixes",
        applied
          ? 'assert isinstance(PipelineFormatter([]), Formatter)\nassert PipelineFormatter([]).format("a") == "a"\np = PipelineFormatter([PrefixFormatter("hi "), UpperFormatter()])\nassert p.format("Sam") == "HI SAM"\nq = PipelineFormatter([UpperFormatter(), PrefixFormatter("hi ")])\nassert q.format("Sam") == "hi SAM"'
          : 'a, b = PrefixFormatter("A"), PrefixFormatter("B")\nassert a.format("x") == "Ax"\nassert b.format("x") == "Bx"',
      ],
      ...(applied
        ? [
            [
              "Nested pipeline copies its configuration list",
              'steps = [PrefixFormatter("a")]\ninner = PipelineFormatter(steps)\nsteps.clear()\nouter = PipelineFormatter([inner, UpperFormatter()])\nassert deliver(["b", "c"], outer) == ["AB", "AC"]\nassert inner.format("d") == "ad"',
            ] as [string, string],
          ]
        : []),
    ]),
    hints: [
      "The shared interface is format(message). Each subclass decides how to transform the string.",
      "deliver only needs formatter.format(message), so it also supports a class unrelated to Formatter.",
      applied
        ? "Copy the supplied steps list. Iterate in order, assigning message = step.format(message); a nested pipeline already obeys this interface."
        : "PrefixFormatter needs instance state; UpperFormatter can implement its behavior without a constructor.",
    ],
    referenceSolution: `class Formatter:\n    def format(self, message):\n        return message\n\n\nclass PrefixFormatter(Formatter):\n    def __init__(self, prefix):\n        self.prefix = prefix\n\n    def format(self, message):\n        return self.prefix + message\n\n\nclass UpperFormatter(Formatter):\n    def format(self, message):\n        return message.upper()\n${applied ? "\n\nclass PipelineFormatter(Formatter):\n    def __init__(self, formatters):\n        self._formatters = list(formatters)\n\n    def format(self, message):\n        for formatter in self._formatters:\n            message = formatter.format(message)\n        return message\n" : ""}\n\ndef deliver(messages, formatter):\n    return [formatter.format(message) for message in messages]\n`,
    learningObjectives: [
      "Implement compatible method signatures.",
      "Use subclass overrides and duck typing.",
      "Test empty strings and independent configurations.",
      ...(applied ? ["Compose interchangeable behaviors in a pipeline."] : []),
    ],
  };
}

function inventory(applied: boolean, n: number): Content {
  return {
    templateId: "collections.inventory.v1",
    title: applied
      ? "Inventory deltas and reorder lists"
      : "Aggregate an inventory log",
    prompt: `Implement stock_totals(events). Each event is a tuple (item, delta), where delta is a signed integer. Return a new dictionary summing deltas per item. Keep items whose total is zero; preserve the first-seen key order. Empty input returns {}. Do not modify events.${applied ? "\n\nAlso implement needs_restock(events, minimum), returning a list of item names whose final total is strictly below minimum. Sort by total ascending, then item name ascending to break ties. Compute final totals before deciding; negative totals are valid." : ""}\n\nExplain why grouping first is necessary before making decisions about final stock.`,
    starterCode: `def stock_totals(events):\n    pass\n${applied ? "\n\ndef needs_restock(events, minimum):\n    pass\n" : ""}`,
    examples: [
      {
        input: `stock_totals([("pen", ${n}), ("book", 2), ("pen", -1)])`,
        output: `{"pen": ${n - 1}, "book": 2}`,
      },
    ],
    constraints: [
      "At most 10,000 events; item names are nonempty strings.",
      "Deltas may be positive, negative, or zero.",
      "Use one pass to aggregate; avoid scanning the whole list once per item.",
    ],
    baselineTests: cases([
      ["Empty input", "assert stock_totals([]) == {}"],
      [
        "Repeated keys accumulate signed values",
        `assert stock_totals([("a", ${n}), ("b", 2), ("a", -1), ("b", 3)]) == {"a": ${n - 1}, "b": 5}`,
      ],
      [
        "Keep zero and negative totals",
        'assert stock_totals([("a", 2), ("a", -2), ("b", -3), ("c", 0)]) == {"a": 0, "b": -3, "c": 0}',
      ],
      [
        "First appearance controls key order",
        'totals = stock_totals([("z", 1), ("a", 2), ("z", -1)])\nassert list(totals) == ["z", "a"]',
      ],
      [
        applied
          ? "Restock after aggregation, with deterministic ties"
          : "Input remains unchanged",
        applied
          ? `events = [("z", 0), ("a", 0), ("b", -2), ("enough", ${n}), ("late", -5), ("late", ${n + 5})]\nassert needs_restock(events, ${n}) == ["b", "a", "z"]\nassert needs_restock([], ${n}) == []`
          : 'events = [("b", 1), ("a", 2)]\nbefore = events.copy()\nstock_totals(events)\nassert events == before',
      ],
      ...(applied
        ? [
            [
              "Strict threshold and input immutability",
              `events = [("below", ${n - 1}), ("equal", ${n}), ("above", ${n + 1})]\nbefore = events.copy()\nassert needs_restock(events, ${n}) == ["below"]\nassert events == before`,
            ] as [string, string],
          ]
        : []),
    ]),
    hints: [
      "Maintain a dictionary from each item to its running total; initialize unseen items to zero.",
      "Adding delta with totals.get(item, 0) handles repeated keys and preserves first-seen insertion order.",
      applied
        ? "Filter only after aggregation, then sort qualifying (item, total) pairs by (total, item)."
        : "Do not delete keys when they reach zero: the contract asks you to retain them.",
    ],
    referenceSolution: `def stock_totals(events):\n    totals = {}\n    for item, delta in events:\n        totals[item] = totals.get(item, 0) + delta\n    return totals\n${applied ? "\n\ndef needs_restock(events, minimum):\n    totals = stock_totals(events)\n    return [item for item, total in sorted(totals.items(), key=lambda pair: (pair[1], pair[0])) if total < minimum]\n" : ""}`,
    learningObjectives: [
      "Aggregate records using a dictionary.",
      "Preserve specified ordering and zero values.",
      "Distinguish incremental state from final state.",
      ...(applied
        ? ["Implement a multi-key sort and a strict threshold."]
        : []),
    ],
  };
}

function attendance(applied: boolean, n: number): Content {
  return {
    templateId: "collections.attendance.v1",
    title: applied
      ? "Attendance across several sessions"
      : "Unique attendees in arrival order",
    prompt: `Implement attendees(records). Each record is (session, person). Return a dictionary mapping each session to a list of unique attendees in their first-arrival order for that session. Repeated records must not duplicate people. Preserve first-seen session order. Empty input returns {}.${applied ? "\n\nImplement frequent_attendees(records, minimum_sessions), returning alphabetically sorted names that attended at least minimum_sessions distinct sessions. Duplicate check-ins for the same session count once. The threshold is a positive integer." : ""}\n\nDescribe where a list is useful and where a set is useful; do not mutate records.`,
    starterCode: `def attendees(records):\n    pass\n${applied ? "\n\ndef frequent_attendees(records, minimum_sessions):\n    pass\n" : ""}`,
    examples: [
      {
        input: `attendees([("S${n}", "Zoe"), ("S${n}", "Ari"), ("S${n}", "Zoe")])`,
        output: `{"S${n}": ["Zoe", "Ari"]}`,
      },
    ],
    constraints: [
      "At most 10,000 records; names and session IDs are nonempty strings.",
      "Matching is case-sensitive.",
      "Preserve arrival order within each group rather than alphabetizing attendees.",
    ],
    baselineTests: cases([
      ["Empty input", "assert attendees([]) == {}"],
      [
        "Deduplicate without sorting arrival order",
        `assert attendees([("S${n}", "Zoe"), ("S${n}", "Ari"), ("S${n}", "Zoe")]) == {"S${n}": ["Zoe", "Ari"]}`,
      ],
      [
        "Session groups are independent",
        'records = [("B", "Zoe"), ("A", "Zoe"), ("B", "Ari"), ("A", "Mia")]\nresult = attendees(records)\nassert result == {"B": ["Zoe", "Ari"], "A": ["Zoe", "Mia"]}\nassert list(result) == ["B", "A"]',
      ],
      [
        "Case-sensitive names and unchanged input",
        'records = [("S", "sam"), ("S", "Sam"), ("S", "sam")]\nbefore = records.copy()\nassert attendees(records) == {"S": ["sam", "Sam"]}\nassert records == before',
      ],
      [
        applied
          ? "Count distinct sessions, not check-ins"
          : "Results do not share attendee lists",
        applied
          ? 'records = [("A", "Zoe"), ("A", "Zoe"), ("A", "Ari"), ("B", "Ari"), ("B", "Mia"), ("C", "Mia")]\nassert frequent_attendees(records, 2) == ["Ari", "Mia"]\nassert frequent_attendees(records, 3) == []'
          : 'result = attendees([("A", "Zoe"), ("B", "Ari")])\nresult["A"].append("Mia")\nassert result["B"] == ["Ari"]',
      ],
      ...(applied
        ? [
            [
              "Inclusive threshold and sorted output",
              'records = [("A", "Zoe"), ("B", "Ari"), ("C", "Mia")]\nbefore = records.copy()\nassert frequent_attendees(records, 1) == ["Ari", "Mia", "Zoe"]\nassert frequent_attendees([], 1) == []\nassert records == before',
            ] as [string, string],
          ]
        : []),
    ]),
    hints: [
      "Each session needs an ordered result list and a way to recognize someone already seen.",
      "Use a dictionary of lists for output and a dictionary of sets for membership, appending only on the first check-in.",
      applied
        ? "Invert the relationship: map each person to a set of session IDs. Filter by set size, then sort names."
        : "Allocate a fresh list and set for every new session; sharing one mutable list would mix sessions.",
    ],
    referenceSolution: `def attendees(records):\n    result, seen = {}, {}\n    for session, person in records:\n        if session not in result:\n            result[session] = []\n            seen[session] = set()\n        if person not in seen[session]:\n            result[session].append(person)\n            seen[session].add(person)\n    return result\n${applied ? "\n\ndef frequent_attendees(records, minimum_sessions):\n    sessions = {}\n    for session, person in records:\n        sessions.setdefault(person, set()).add(session)\n    return sorted(person for person, values in sessions.items() if len(values) >= minimum_sessions)\n" : ""}`,
    learningObjectives: [
      "Combine ordered lists with set membership.",
      "Deduplicate within the correct grouping key.",
      "Avoid aliasing mutable collections.",
      ...(applied
        ? ["Invert a relationship and count distinct memberships."]
        : []),
    ],
  };
}

function chunks(applied: boolean, n: number): Content {
  return {
    templateId: "debug.chunks.v1",
    title: applied
      ? "Repair batching and optional padding"
      : "Repair a batching function",
    prompt: `The supplied split_batches implementation drops data and mishandles invalid sizes. Repair it. split_batches(items, size${applied ? ", fill=None" : ""}) must return a new list of consecutive batches of at most size items. Keep the final partial batch and do not mutate items. Nonpositive integer size raises ValueError, even when items is empty. Empty items returns [].${applied ? '\n\nWhen fill is not None, pad only the final partial batch to size using fill. Values such as 0, False, and "" are valid padding; None means no padding. Never append an extra batch when the length divides evenly.' : ""}\n\nBefore editing, name two failing examples and explain which boundary condition each exposes.`,
    starterCode: `def split_batches(items, size${applied ? ", fill=None" : ""}):\n    # Debug this implementation.\n    result = []\n    for start in range(0, len(items) - size, size):\n        batch = items[start:start + size]\n${applied ? "        if fill and len(batch) < size:\n            batch += [fill] * (size - len(batch))\n" : ""}        result.append(batch)\n    return result\n`,
    examples: [
      {
        input: `split_batches(list(range(${n + 1})), ${n})`,
        output: `[${JSON.stringify(Array.from({ length: n }, (_, i) => i))}, [${n}]]`,
      },
    ],
    constraints: [
      "items is a list and size is an integer.",
      "Return new batch lists rather than the original input object.",
      "A valid size may be greater than the input length.",
    ],
    baselineTests: cases([
      [
        "Final partial batch is retained",
        `assert split_batches(list(range(${n + 1})), ${n}) == [list(range(${n})), [${n}]]`,
      ],
      [
        "Exact multiples and size one",
        "assert split_batches([1, 2, 3, 4], 2) == [[1, 2], [3, 4]]\nassert split_batches([1, 2], 1) == [[1], [2]]",
      ],
      [
        "Empty and oversized batches",
        "assert split_batches([], 3) == []\nassert split_batches([1, 2], 8) == [[1, 2]]",
      ],
      [
        "Validate size even for empty input",
        `${raises("split_batches([], 0)")}\n${raises("split_batches([], -1)")}\n${raises("split_batches([1], 0)")}`,
      ],
      [
        "Batch lists and input are independent",
        "items = [1, 2, 3]\nresult = split_batches(items, 2)\nresult[0].append(99)\nassert items == [1, 2, 3]\nassert result[1] == [3]",
      ],
      ...(applied
        ? [
            [
              "Padding distinguishes None from falsy values",
              'assert split_batches([1, 2, 3], 2, 0) == [[1, 2], [3, 0]]\nassert split_batches([1], 3, "") == [[1, "", ""]]\nassert split_batches([1], 2, False) == [[1, False]]\nassert split_batches([1], 2) == [[1]]\nassert split_batches([1, 2], 2, 0) == [[1, 2]]\nassert split_batches([], 2, 0) == []',
            ] as [string, string],
          ]
        : []),
    ]),
    hints: [
      "Try inputs of lengths zero, one, exactly size, and size + 1. Which starts should be visited?",
      "Validate size before the loop. Iterate start values from 0 up to len(items), stepping by size; slicing naturally handles a partial last batch.",
      applied
        ? "Check fill is not None, not its truthiness. Only extend a short final slice, leaving full batches unchanged."
        : "range(0, len(items), size) includes the final start without needing to subtract size from the upper bound.",
    ],
    referenceSolution: `def split_batches(items, size${applied ? ", fill=None" : ""}):\n    if size <= 0:\n        raise ValueError("Size must be positive")\n    result = []\n    for start in range(0, len(items), size):\n        batch = items[start:start + size]\n${applied ? "        if fill is not None and len(batch) < size:\n            batch += [fill] * (size - len(batch))\n" : ""}        result.append(batch)\n    return result\n`,
    learningObjectives: [
      "Find off-by-one errors using boundary examples.",
      "Validate parameters before early returns or loops.",
      "Keep input lists unchanged.",
      ...(applied ? ["Distinguish absence from falsy values."] : []),
    ],
  };
}

function streaks(applied: boolean, n: number): Content {
  return {
    templateId: "debug.streaks.v1",
    title: applied
      ? "Repair a streak report with positions"
      : "Repair longest consecutive streak",
    prompt: `Repair longest_streak(values, target). It returns the length of the longest consecutive run of values equal to target; return 0 for empty input or no match. Equality means ==, so falsy targets such as 0 are valid. Do not modify values.${applied ? "\n\nAlso implement streak_report(values, target), returning (length, start_index) for the longest matching run. For tied lengths choose the earliest start. With no match return (0, None). longest_streak must continue to return just the length." : ""}\n\nThe starter incorrectly resets state and can miss a run at the end. Describe the invariant for the current run before repairing it.`,
    starterCode: `def longest_streak(values, target):\n    best = current = 0\n    for value in values:\n        if value == target:\n            current += 1\n        else:\n            best = max(best, current)\n            current = 1\n    return best\n${applied ? "\n\ndef streak_report(values, target):\n    pass\n" : ""}`,
    examples: [
      { input: `longest_streak([${n}, ${n}, 0, ${n}], ${n})`, output: "2" },
    ],
    constraints: [
      "At most 10,000 values; compare using equality.",
      "A streak is consecutive, not a total frequency.",
      "An O(n) scan with constant extra working space is sufficient.",
    ],
    baselineTests: cases([
      [
        "Empty and no-match inputs",
        `assert longest_streak([], ${n}) == 0\nassert longest_streak([0, 0], ${n}) == 0`,
      ],
      [
        "Entire list and final streak",
        `assert longest_streak([${n}, ${n}, ${n}], ${n}) == 3\nassert longest_streak([0, ${n}, ${n}], ${n}) == 2`,
      ],
      [
        "Separated runs do not merge",
        `assert longest_streak([${n}, 0, ${n}, 0, ${n}], ${n}) == 1\nassert longest_streak([${n}, ${n}, 0, ${n}], ${n}) == 2`,
      ],
      [
        "Falsy target and unchanged input",
        "values = [0, 0, 1, 0]\nbefore = values.copy()\nassert longest_streak(values, 0) == 2\nassert values == before",
      ],
      [
        applied ? "Report position and earliest tied streak" : "Single element",
        applied
          ? `assert streak_report([0, ${n}, ${n}, 0, ${n}, ${n}], ${n}) == (2, 1)\nassert streak_report([${n}, 0, ${n}, ${n}], ${n}) == (2, 2)`
          : `assert longest_streak([${n}], ${n}) == 1\nassert longest_streak([0], ${n}) == 0`,
      ],
      ...(applied
        ? [
            [
              "No-match report and all-match report",
              `assert streak_report([], ${n}) == (0, None)\nassert streak_report([0], ${n}) == (0, None)\nassert streak_report([${n}, ${n}], ${n}) == (2, 0)\nassert streak_report([1, 0, 0], 0) == (2, 1)`,
            ] as [string, string],
          ]
        : []),
    ]),
    hints: [
      "Track the length of the run ending at the current element. A nonmatch resets that length to zero.",
      "Update the best length while scanning matches, so a run ending at the last element is considered.",
      applied
        ? "When a run starts, save its index. Replace the best pair only when current length is strictly larger, retaining the earliest tie."
        : "For a matching element, increment current then compare it with best. For a nonmatch, set current = 0.",
    ],
    referenceSolution: applied
      ? `def streak_report(values, target):\n    best = current = 0\n    best_start = None\n    current_start = 0\n    for index, value in enumerate(values):\n        if value == target:\n            if current == 0:\n                current_start = index\n            current += 1\n            if current > best:\n                best = current\n                best_start = current_start\n        else:\n            current = 0\n    return (best, best_start)\n\n\ndef longest_streak(values, target):\n    return streak_report(values, target)[0]\n`
      : `def longest_streak(values, target):\n    best = current = 0\n    for value in values:\n        if value == target:\n            current += 1\n            best = max(best, current)\n        else:\n            current = 0\n    return best\n`,
    learningObjectives: [
      "State a loop invariant for consecutive runs.",
      "Test empty input, no matches, and a run at the end.",
      "Distinguish run length from overall frequency.",
      ...(applied
        ? ["Track positions and resolve ties deterministically."]
        : []),
    ],
  };
}

function mock(n: number): Content {
  return {
    templateId: "mock.equipment-library.v1",
    title: "Mock interview · Equipment lending desk",
    prompt: `You are building a small equipment lending system. Start by clarifying requirements and describing your object model, then implement and test it. You have 60 minutes and a blank editor.\n\nImplement these exact public contracts:\n\n1. Item(item_id, name) stores .item_id and .name. max_days() returns 14. ShortLoanItem(Item) overrides max_days() to return ${n}.\n\n2. Loan(item, borrower, due_day) stores the supplied Item reference as .item, plus .borrower and .due_day. is_overdue(day) returns True only when day > due_day.\n\n3. Library() owns an independent registry of items and active loans. add(item) registers the supplied Item and returns None. A duplicate item_id raises ValueError without replacing the original.\n\n4. borrow(item_id, borrower, day) returns a new Loan for an available registered item, with due_day = day + item.max_days(). Unknown IDs raise KeyError. Already-loaned items raise ValueError. Store the Loan as active. All rejected calls leave state unchanged.\n\n5. return_item(item_id) removes and returns its active Loan. Unknown IDs raise KeyError; a registered item with no active loan raises ValueError. Returned items can be borrowed again.\n\n6. available_ids() returns a new alphabetically sorted list of registered IDs without active loans. overdue(day) returns a new list of overdue active Loan objects, sorted by (due_day, item.item_id).\n\nUse composition for items, loans, and the library. Dispatch max_days() on each item; do not switch on class names. Explain assumptions, discuss an edge case before coding, and describe tests you would add beyond the baseline suite.`,
    starterCode:
      "# Equipment lending desk — implement your solution from scratch.\n",
    examples: [
      {
        input: `desk = Library(); desk.add(ShortLoanItem("cam", "Camera")); loan = desk.borrow("cam", "Sam", 10); loan.due_day`,
        output: String(10 + n),
        explanation: `The camera is overdue starting on day ${11 + n}; returning it makes it available again.`,
      },
    ],
    constraints: [
      "IDs, names, and borrower names are nonempty strings; IDs are case-sensitive.",
      "Days are nonnegative integers; no date parsing or wall-clock use.",
      "Assume item IDs are not changed after registration and max_days returns a positive integer.",
      "No accounts, database, file I/O, or user-interface code is required.",
      "Aim for constant-time ID lookup and borrowing; sorting report lists is acceptable.",
    ],
    baselineTests: cases([
      [
        "Domain objects and inclusive due date",
        `item = Item("a", "Tripod")\nassert (item.item_id, item.name, item.max_days()) == ("a", "Tripod", 14)\nshort = ShortLoanItem("b", "Camera")\nassert isinstance(short, Item)\nassert short.max_days() == ${n}\nloan = Loan(item, "Sam", 20)\nassert loan.item is item\nassert (loan.borrower, loan.due_day) == ("Sam", 20)\nassert loan.is_overdue(20) is False\nassert loan.is_overdue(21) is True`,
      ],
      [
        "Independent registries, sorted snapshots, duplicate rejection",
        `a, b = Library(), Library()\noriginal = Item("z", "Original")\nassert a.add(original) is None\na.add(Item("a", "Other"))\nassert a.available_ids() == ["a", "z"]\nassert b.available_ids() == []\nview = a.available_ids()\nview.clear()\nassert a.available_ids() == ["a", "z"]\n${raises('a.add(Item("z", "Replacement"))')}\nassert a.borrow("z", "Sam", 0).item is original`,
      ],
      [
        "Borrow dispatches overridden and unfamiliar policies",
        `class OneDayItem(Item):\n    def max_days(self):\n        return 1\ndesk = Library()\nnormal, short, custom = Item("n", "Normal"), ShortLoanItem("s", "Short"), OneDayItem("c", "Custom")\nfor item in (normal, short, custom):\n    desk.add(item)\na = desk.borrow("n", "Ari", 10)\nb = desk.borrow("s", "Zoe", 10)\nc = desk.borrow("c", "Sam", 10)\nassert (a.due_day, b.due_day, c.due_day) == (24, ${10 + n}, 11)\nassert a.item is normal\nassert a.borrower == "Ari"\nassert desk.available_ids() == []`,
      ],
      [
        "Failed operations keep existing loans intact",
        `desk = Library()\ndesk.add(Item("a", "A"))\nloan = desk.borrow("a", "Sam", 0)\n${raises('desk.borrow("a", "Other", 1)')}\n${raises('desk.borrow("missing", "Sam", 0)', "KeyError")}\n${raises('desk.return_item("missing")', "KeyError")}\nassert desk.available_ids() == []\nassert desk.return_item("a") is loan\n${raises('desk.return_item("a")')}\nassert desk.available_ids() == ["a"]`,
      ],
      [
        "Return and borrow again creates a fresh loan",
        `desk = Library()\nitem = ShortLoanItem("a", "A")\ndesk.add(item)\nfirst = desk.borrow("a", "Sam", 0)\nassert desk.return_item("a") is first\nsecond = desk.borrow("a", "Ari", 20)\nassert second is not first\nassert second.item is item\nassert second.borrower == "Ari"\nassert second.due_day == ${20 + n}\nassert desk.overdue(${20 + n}) == []`,
      ],
      [
        "Overdue reports order ties and contain live Loan objects",
        'desk = Library()\nfor key in ("z", "a", "m"):\n    desk.add(Item(key, key))\nz = desk.borrow("z", "Sam", 0)\na = desk.borrow("a", "Sam", 0)\nm = desk.borrow("m", "Sam", 1)\nassert desk.overdue(14) == []\nassert desk.overdue(15) == [a, z]\nassert desk.overdue(16) == [a, z, m]\nview = desk.overdue(16)\nview.clear()\nassert desk.overdue(16) == [a, z, m]\ndesk.return_item("a")\nassert desk.overdue(16) == [z, m]',
      ],
    ]),
    hints: [
      "Separate item policy, loan facts, and library bookkeeping. Write the class and method names first, then identify each object’s state.",
      "Use two per-library dictionaries keyed by item ID: registered items and active loans. Validate before changing them; Loan should hold the actual Item reference.",
      "Borrow computes day + item.max_days(). Return removes the active loan. Reports filter active loans with is_overdue(day) and sort by (loan.due_day, loan.item.item_id).",
    ],
    referenceSolution: `class Item:\n    def __init__(self, item_id, name):\n        self.item_id = item_id\n        self.name = name\n\n    def max_days(self):\n        return 14\n\n\nclass ShortLoanItem(Item):\n    def max_days(self):\n        return ${n}\n\n\nclass Loan:\n    def __init__(self, item, borrower, due_day):\n        self.item = item\n        self.borrower = borrower\n        self.due_day = due_day\n\n    def is_overdue(self, day):\n        return day > self.due_day\n\n\nclass Library:\n    def __init__(self):\n        self._items = {}\n        self._loans = {}\n\n    def add(self, item):\n        if item.item_id in self._items:\n            raise ValueError("Duplicate item")\n        self._items[item.item_id] = item\n\n    def borrow(self, item_id, borrower, day):\n        if item_id not in self._items:\n            raise KeyError(item_id)\n        if item_id in self._loans:\n            raise ValueError("Item already borrowed")\n        item = self._items[item_id]\n        loan = Loan(item, borrower, day + item.max_days())\n        self._loans[item_id] = loan\n        return loan\n\n    def return_item(self, item_id):\n        if item_id not in self._items:\n            raise KeyError(item_id)\n        if item_id not in self._loans:\n            raise ValueError("Item is not borrowed")\n        return self._loans.pop(item_id)\n\n    def available_ids(self):\n        return sorted(key for key in self._items if key not in self._loans)\n\n    def overdue(self, day):\n        return sorted((loan for loan in self._loans.values() if loan.is_overdue(day)), key=lambda loan: (loan.due_day, loan.item.item_id))\n`,
    learningObjectives: [
      "Break a practical requirement into collaborating objects.",
      "Use inheritance for one varying policy and composition for relationships.",
      "Protect invariants on failed state transitions.",
      "Test boundaries, identity, ordering, and independent state.",
      "Explain a design and respond to hints under a 60-minute timer.",
    ],
  };
}

const families: Record<
  string,
  [
    (applied: boolean, n: number) => Content,
    (applied: boolean, n: number) => Content,
  ]
> = {
  "python.oop.instance-state": [playlist, basket],
  "python.oop.validation": [bank, reservation],
  "python.oop.composition": [project, cart],
  "python.oop.polymorphism": [pricing, notification],
  "python.fundamentals.collections": [inventory, attendance],
  "python.debugging.edge-cases": [chunks, streaks],
};

/** Offline, deterministic exercise variants. This is explicitly a template generator, not an AI call. */
export function generateQuestion(
  topicId: string,
  level: Level,
  seed: number,
  mode: PracticeMode = "drill",
): QuestionPackage {
  if (!Object.hasOwn(families, topicId))
    throw new Error(`Unknown learning topic: ${topicId}`);
  if (level !== "foundation" && level !== "applied")
    throw new Error(`Unknown learning level: ${level}`);
  if (mode !== "drill" && mode !== "mock")
    throw new Error(`Unknown practice mode: ${mode}`);
  if (!Number.isSafeInteger(seed))
    throw new Error("A question seed must be a safe integer.");
  const normalizedSeed = seed >>> 0;
  const branch = normalizedSeed % 2;
  const n = 2 + (Math.floor(normalizedSeed / 2) % 6);
  const content =
    mode === "mock"
      ? mock(n)
      : families[topicId][branch](level === "applied", n);
  const { templateId, ...details } = content;
  return {
    schemaVersion: 1,
    id: `local-${templateId}-${level}-${normalizedSeed}`,
    topicId: mode === "mock" ? "python.oop.composition" : topicId,
    level,
    ...details,
    recommendedMinutes: mode === "mock" ? 60 : level === "foundation" ? 15 : 20,
    provenance: {
      kind: "local-template",
      generator: "Tracepad",
      templateId,
      seed: normalizedSeed,
    },
  };
}
