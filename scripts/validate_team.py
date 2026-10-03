#!/usr/bin/env python3
"""Check collaboration documents using only the Python standard library.

Run from any directory: python3 /path/to/scendance/scripts/validate_team.py
This does not execute application code or verify product acceptance evidence.
"""

import hashlib
import json
from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[1]
TEAM = ROOT / "docs" / "team"
STATUSES = {"todo", "in_progress", "blocked", "review", "done"}
TASK_ID = re.compile(r"[A-Z][0-9]+")


def unique_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("JSON contains a duplicate object key")
        result[key] = value
    return result


def text(value):
    return isinstance(value, str) and bool(value.strip())


def strings(value, allow_empty=True):
    return (
        isinstance(value, list)
        and (allow_empty or bool(value))
        and all(text(item) for item in value)
    )


def validate(data, cards):
    errors = []

    def check(condition, message):
        if not condition:
            errors.append(message)

    if not isinstance(data, dict):
        return ["TASKS.json must contain a JSON object"]
    for key in ("schema_version", "created_date", "timezone", "project", "purpose"):
        check(text(data.get(key)), f"{key}: expected a non-empty string")
    for key in ("runtime", "constraints", "dispatch_rules", "roles", "source"):
        check(isinstance(data.get(key), dict), f"{key}: expected an object")

    source = data.get("source")
    if isinstance(source, dict):
        source_path = source.get("path")
        expected_hash = source.get("sha256")
        check(text(source_path), "source.path: expected a relative Markdown path")
        check(
            isinstance(expected_hash, str)
            and re.fullmatch(r"[a-f0-9]{64}", expected_hash) is not None,
            "source.sha256: expected a lowercase SHA-256 digest",
        )
        if text(source_path):
            plan = (TEAM / source_path).resolve()
            try:
                plan.relative_to(ROOT)
                allowed_path = not Path(source_path).is_absolute() and plan.suffix == ".md"
            except ValueError:
                allowed_path = False
            check(allowed_path, "source.path: must point to Markdown inside this repository")
            if allowed_path:
                try:
                    plan_bytes = plan.read_bytes()
                    check(hashlib.sha256(plan_bytes).hexdigest() == expected_hash,
                          "source.sha256 does not match the source PLAN bytes")
                    check(plan_bytes == (ROOT / "PLAN.md").read_bytes(),
                          "source PLAN differs from repository PLAN.md; update both and the hash")
                except OSError as exc:
                    errors.append(f"Cannot read PLAN source: {exc.strerror}")

    roles = data.get("roles")
    if not isinstance(roles, dict):
        roles = {}
    check(bool(roles), "roles: must contain at least one role")
    for role_id, role in roles.items():
        check(isinstance(role, dict), f"roles.{role_id}: expected an object")
        if isinstance(role, dict):
            check(text(role.get("name")), f"roles.{role_id}.name: required")

    dispatch = data.get("dispatch_rules")
    if isinstance(dispatch, dict):
        statuses = dispatch.get("statuses")
        check(strings(statuses) and set(statuses) == STATUSES
              and len(statuses) == len(STATUSES),
              "dispatch_rules.statuses: must list todo, in_progress, blocked, review, done once")

    tasks = data.get("tasks")
    if not isinstance(tasks, list) or not tasks:
        return errors + ["tasks: expected a non-empty list"]
    indexed = {}
    for position, task in enumerate(tasks):
        label = f"tasks[{position}]"
        if not isinstance(task, dict):
            errors.append(f"{label}: expected an object")
            continue
        task_id = task.get("id")
        if not isinstance(task_id, str) or not TASK_ID.fullmatch(task_id):
            errors.append(f"{label}.id: expected an ID such as A01 or G0")
            continue
        label = task_id
        check(task_id not in indexed, f"{task_id}: duplicate task ID")
        indexed[task_id] = task
        check(isinstance(task.get("owner"), str) and task["owner"] in roles,
              f"{label}.owner: must identify one declared role")
        check(isinstance(task.get("status"), str) and task["status"] in STATUSES,
              f"{label}.status: unknown status")
        for field in ("title", "phase", "human_action"):
            check(text(task.get(field)), f"{label}.{field}: expected a non-empty string")
        hours = task.get("timebox_hours")
        check(type(hours) in (int, float) and 0 < hours < float("inf"),
              f"{label}.timebox_hours: expected a positive finite number")
        for field in ("inputs", "outputs", "steps", "acceptance"):
            check(strings(task.get(field), allow_empty=False),
                  f"{label}.{field}: expected a non-empty list of strings")
        for field in ("depends_on", "complete_after", "handoff_to", "evidence"):
            check(strings(task.get(field)), f"{label}.{field}: expected a list of strings")
        for field in ("depends_on", "complete_after", "handoff_to"):
            values = task.get(field)
            if strings(values):
                check(len(values) == len(set(values)), f"{label}.{field}: duplicate entry")
        if strings(task.get("handoff_to")):
            check(all(role in roles for role in task["handoff_to"]),
                  f"{label}.handoff_to: references an undeclared role")
        check("blocker" in task and (task["blocker"] is None or text(task["blocker"])),
              f"{label}.blocker: expected null or a non-empty string")
        if task.get("status") == "blocked":
            check(text(task.get("blocker")), f"{label}: blocked tasks need a blocker")
        if task.get("status") == "done":
            check(strings(task.get("evidence"), allow_empty=False),
                  f"{label}: done tasks need evidence references (reviewed by a person)")
            check(task.get("blocker") is None, f"{label}: done tasks cannot retain a blocker")

    graph = {}
    for task_id, task in indexed.items():
        dependencies = set()
        for field in ("depends_on", "complete_after"):
            if strings(task.get(field)):
                dependencies.update(task[field])
        for dependency in dependencies:
            check(dependency in indexed, f"{task_id}: unknown dependency {dependency}")
            check(dependency != task_id, f"{task_id}: cannot depend on itself")
            if task.get("status") == "done" and dependency in indexed:
                check(indexed[dependency].get("status") == "done",
                      f"{task_id}: done task has an unfinished dependency {dependency}")
        graph[task_id] = sorted(dependencies & indexed.keys())

    visiting, visited = set(), set()

    def visit(task_id, trail):
        if task_id in visiting:
            errors.append("Dependency cycle: " + " -> ".join(trail + [task_id]))
            return
        if task_id in visited:
            return
        visiting.add(task_id)
        for dependency in graph[task_id]:
            visit(dependency, trail + [task_id])
        visiting.remove(task_id)
        visited.add(task_id)

    for task_id in graph:
        visit(task_id, [])
    for role_id, role in roles.items():
        if isinstance(role, dict):
            first = role.get("first")
            check(isinstance(first, str) and first in indexed
                  and indexed[first].get("owner") == role_id,
                  f"roles.{role_id}.first: must refer to a task owned by this role")

    card_ids = re.findall(r"^###\s+([A-Z][0-9]+)\s*[｜|]", cards, flags=re.MULTILINE)
    check(len(card_ids) == len(set(card_ids)), "TASKS.md contains duplicate task card IDs")
    missing, extra = set(indexed) - set(card_ids), set(card_ids) - set(indexed)
    check(not missing, "TASKS.md missing task cards: " + ", ".join(sorted(missing)))
    check(not extra, "TASKS.md contains unknown task cards: " + ", ".join(sorted(extra)))

    coverage = data.get("requirements_coverage")
    check(isinstance(coverage, list) and bool(coverage),
          "requirements_coverage: expected a non-empty list")
    if isinstance(coverage, list):
        for position, requirement in enumerate(coverage):
            label = f"requirements_coverage[{position}]"
            if not isinstance(requirement, dict):
                errors.append(f"{label}: expected an object")
                continue
            check(text(requirement.get("requirement")), f"{label}.requirement: required")
            references = requirement.get("tasks")
            check(strings(references, allow_empty=False), f"{label}.tasks: required")
            if strings(references):
                check(all(task_id in indexed for task_id in references),
                      f"{label}.tasks: references an unknown task")
    return errors


def main():
    try:
        data = json.loads((TEAM / "TASKS.json").read_text(encoding="utf-8"),
                          object_pairs_hook=unique_keys)
        cards = (TEAM / "TASKS.md").read_text(encoding="utf-8")
    except (OSError, UnicodeError, ValueError) as exc:
        print(f"FAIL: cannot load collaboration files: {exc}", file=sys.stderr)
        return 1
    errors = validate(data, cards)
    if errors:
        for error in errors:
            print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print(f"PASS: {len(data['tasks'])} task records; schema, dependencies, PLAN source and card coverage.")
    print("Collaboration document check only. Product behavior and evidence truth were not tested.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
