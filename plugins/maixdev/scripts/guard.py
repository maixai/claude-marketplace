#!/usr/bin/env python3
"""Keep fastdev role bindings separate from durable business documents."""

import contextlib
import fcntl
import hashlib
import json
import os
from pathlib import Path
import stat
import sys
import tempfile


ROLES = {"maixdev:developer", "maixdev:test-developer", "maixdev:reviewer"}
LIMIT = 10000


class GuardError(Exception):
    """A registration or filesystem precondition is not satisfied."""


def require(condition, message):
    if not condition:
        raise GuardError(message)


def text(value):
    require(isinstance(value, str) and bool(value.strip()), "missing non-empty string")
    require(not any(ord(c) < 32 for c in value), "control character in value")
    return value


def absolute(value):
    value = text(value)
    require(os.path.isabs(value), "absolute path required")
    return value


def key(value):
    return hashlib.sha256(text(value).encode()).hexdigest()


def read_json(path):
    require(not path.is_symlink(), "runtime file must not be a symlink")
    with path.open(encoding="utf-8") as stream:
        data = json.load(stream)
    require(isinstance(data, dict), "expected JSON object")
    return data


def atomic_json(path, value):
    require(not path.is_symlink(), "runtime file must not be a symlink")
    fd, name = tempfile.mkstemp(prefix=".pending-", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(value, stream, ensure_ascii=False, sort_keys=True)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def runtime_root():
    raw = absolute(os.environ.get("CLAUDE_PLUGIN_DATA"))
    require(str(Path(raw).resolve()) == raw.rstrip("/"), "runtime path must be canonical")
    root = Path(raw) / "fastdev-v1"
    require(not root.is_symlink(), "runtime directory must not be a symlink")
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    return root


@contextlib.contextmanager
def store():
    root = runtime_root()
    fd = os.open(root / ".lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        yield root
    finally:
        os.close(fd)


def session_path(root, session):
    return root / ("session-" + key(session) + ".json")


def observation_path(root, session, agent):
    return root / ("agent-" + key(json.dumps([session, agent])) + ".json")


def path_record(raw, kind):
    raw = absolute(raw)
    require(kind in {"file", "tree"}, "invalid protection kind")
    real = str(Path(raw).resolve())
    path = Path(real)
    if path.exists():
        require(path.is_dir() if kind == "tree" else path.is_file(), "protection kind mismatch")
    return {"path": raw, "real": real, "kind": kind}


def check_path(record):
    require(isinstance(record, dict), "invalid path record")
    require(path_record(record["path"], record["kind"]) == record, "path identity changed; pause and re-register")


def below(path, root):
    return path == root or root in path.parents


def inventory(records):
    """Follow aliases without looping, and include directory membership in evidence."""
    found = {}
    visited = set()

    def visit(raw):
        require(len(found) < LIMIT, "inventory limit exceeded; narrow the scope")
        path = Path(raw)
        real = str(path.resolve())
        if not path.exists():
            found[str(path)] = {"real": real, "kind": "missing"}
            return
        info = path.stat()
        require(stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode), "unsupported special file")
        is_dir = stat.S_ISDIR(info.st_mode)
        entry = {"real": real, "kind": "tree" if is_dir else "file", "inode": [info.st_dev, info.st_ino]}
        if not is_dir:
            entry["sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
        found[str(path)] = entry
        identity = (info.st_dev, info.st_ino)
        if is_dir and identity not in visited:
            visited.add(identity)
            for child in sorted(path.iterdir()):
                visit(child)

    for record in records:
        check_path(record)
        visit(record["path"])
    return found


def fingerprint(records):
    return hashlib.sha256(json.dumps(inventory(records), sort_keys=True).encode()).hexdigest()


def validate(data, session):
    require(data.get("schema") == 1 and data.get("session_id") == session, "invalid session registration")
    require(data.get("mode") in {"tdd", "normal"}, "invalid mode")
    require(data.get("phase") in {"preparing", "active", "paused", "closed"}, "invalid phase")
    require(isinstance(data.get("revision"), int) and data["revision"] > 0, "invalid revision")
    check_path(data["task_dir"])
    require(Path(data["task_dir"]["real"]).is_dir(), "task directory is missing")
    require(isinstance(data.get("roles"), dict), "invalid roles")
    for role, agent in data["roles"].items():
        require(role in ROLES, "unknown role")
        text(agent)
    require(len(set(data["roles"].values())) == len(data["roles"]), "duplicate role identity")
    require(isinstance(data.get("retired"), list), "invalid retired identities")
    for agent in data["retired"]:
        text(agent)
    require(not set(data["retired"]) & set(data["roles"].values()), "retired identity is active")
    require(isinstance(data.get("protected"), list), "invalid protection list")
    for record in data["protected"]:
        check_path(record)
    require(isinstance(data.get("members"), dict), "invalid protected inventory")
    for raw, member in data["members"].items():
        absolute(raw)
        require(isinstance(member, dict), "invalid protected member")
        absolute(member.get("real"))
        require(member.get("kind") in {"file", "tree", "missing"}, "invalid member kind")
        if member["kind"] != "missing":
            inode = member.get("inode")
            require(isinstance(inode, list) and len(inode) == 2 and all(isinstance(n, int) and n >= 0 for n in inode), "invalid member identity")
        if member["kind"] == "file":
            digest = member.get("sha256")
            require(isinstance(digest, str) and len(digest) == 64 and all(c in "0123456789abcdef" for c in digest), "invalid member fingerprint")
    group = data.get("group")
    require(group is None or (isinstance(group, dict) and group.get("state") in {"open", "sealed"} and isinstance(group.get("id"), str) and bool(group["id"])), "invalid group")
    if data["mode"] == "normal":
        require(not data["protected"] and not data["members"] and group is None and "maixdev:test-developer" not in data["roles"], "normal mode must not inherit TDD protection")
    elif data["phase"] == "active":
        require(group is not None and group["state"] == "sealed" and data["protected"], "active TDD group is not sealed")
        require("maixdev:test-developer" in data["roles"], "test author is not bound")
        require(all(record["path"] in data["members"] for record in data["protected"]), "sealed protection inventory is incomplete")
    if data["phase"] == "active":
        require("maixdev:developer" in data["roles"], "developer is not bound")
    return data


def observe(event):
    role = event.get("agent_type")
    if role not in ROLES:
        return None
    require(event.get("hook_event_name") == "SubagentStart", "unexpected observation event")
    session, agent = text(event.get("session_id")), text(event.get("agent_id"))
    with store() as root:
        path = observation_path(root, session, agent)
        observation = {"session_id": session, "agent_id": agent, "agent_type": role}
        if path.exists():
            require(read_json(path) == observation, "observed identity changed")
        else:
            atomic_json(path, observation)
    return {"hookSpecificOutput": {"hookEventName": "SubagentStart", "additionalContext": "fastdev identity observed; remain read-only until Main binds this identity. Runtime data: " + str(root.parent) + "; session_id=" + session + "; agent_id=" + agent}}


def apply(request):
    action = text(request.get("action"))
    with store() as root:
        if action == "observations":
            return {"observations": [read_json(path) for path in sorted(root.glob("agent-*.json"))]}
        session = text(request.get("session_id"))
        path = session_path(root, session)
        if action == "init":
            require(not path.exists(), "session already registered; resume or close it explicitly")
            mode = request.get("mode")
            data = {"schema": 1, "session_id": session, "task_dir": path_record(request.get("task_dir"), "tree"), "mode": mode, "phase": "preparing", "revision": 1, "roles": {}, "retired": [], "protected": [], "members": {}, "group": None}
        else:
            require(path.exists(), "session registration is missing")
            data = validate(read_json(path), session)
            if action == "status":
                return data
            require(data["phase"] != "closed", "session is closed; use a new session for another task")
            if action == "bind":
                require(data["phase"] != "active", "pause before binding a role")
                role, agent = request.get("role"), text(request.get("agent_id"))
                require(role in ROLES, "unknown role")
                require(agent not in data["retired"], "retired identity cannot be rebound")
                observation = read_json(observation_path(root, session, agent))
                require(observation == {"session_id": session, "agent_id": agent, "agent_type": role}, "binding does not match host observation")
                old = data["roles"].get(role)
                if old and old != agent:
                    data["retired"].append(old)
                data["roles"][role] = agent
            elif action == "open-group":
                require(data["mode"] == "tdd", "test groups require TDD mode")
                require(data["phase"] != "active", "pause the developer before opening a group")
                data["group"] = {"id": text(request.get("group_id")), "state": "open"}
                data["phase"] = "preparing"
            elif action == "protect":
                require(data["mode"] == "tdd" and data["group"] and data["group"]["state"] == "open", "open a group before adding protection")
                entries = request.get("paths")
                require(isinstance(entries, list) and bool(entries), "protection paths are required")
                for entry in entries:
                    record = path_record(entry["path"], entry["kind"])
                    if record not in data["protected"]:
                        data["protected"].append(record)
            elif action == "seal-group":
                require(data["mode"] == "tdd" and data["group"] and data["group"]["state"] == "open", "group is not open")
                paths = request.get("handoff_paths")
                require(isinstance(paths, list) and bool(paths), "explicit handoff paths are required")
                require(data["protected"], "protection is empty")
                for raw in paths:
                    require(is_protected(absolute(raw), data), "handoff path is not protected")
                    require(Path(raw).is_file(), "handoff file is missing")
                data["members"] = inventory(data["protected"])
                data["group"]["state"] = "sealed"
            elif action == "activate":
                require(data["phase"] in {"preparing", "paused"}, "session is not ready for activation")
                data["phase"] = "active"
            elif action in {"pause", "close"}:
                data["phase"] = "paused" if action == "pause" else "closed"
            elif action == "stamp":
                records = [path_record(item["path"], item["kind"]) for item in request.get("paths", [])]
                require(bool(records), "artifact scope is required")
                return {"revision": data["revision"], "paths": records, "fingerprint": fingerprint(records)}
            elif action == "verify-stamp":
                stamp = request["stamp"]
                require(stamp["revision"] == data["revision"] and stamp["fingerprint"] == fingerprint(stamp["paths"]), "artifact or registration changed; rerun affected checks")
                return {"unchanged": True, "note": "This verifies artifact identity, not a test outcome."}
            else:
                raise GuardError("unknown registration action")
            data["revision"] += 1
        validate(data, session)
        atomic_json(path, data)
        return data


def is_protected(raw, data):
    target = Path(raw).resolve()
    lexical = Path(os.path.abspath(raw))
    for record in data["protected"]:
        check_path(record)
        real, alias = Path(record["real"]), Path(os.path.abspath(record["path"]))
        if target == real or lexical == alias:
            return True
        if record["kind"] == "tree" and (below(target, real) or below(lexical, alias)):
            return True
    for raw_member, member in data["members"].items():
        require(str(Path(raw_member).resolve()) == member["real"], "protected alias changed; pause and re-register")
        if target == Path(member["real"]) or (member["kind"] == "tree" and below(target, Path(member["real"]))):
            return True
        if target.exists() and Path(raw_member).exists() and target.samefile(raw_member):
            return True
    return False


def developer_record(raw, data):
    task = Path(data["task_dir"]["real"])
    target = Path(raw).resolve()
    if target in {task / "development.md", task / "acceptance-developer.md"}:
        return True
    if target.parent == task / "issues" and target.suffix == ".md" and "-decision-" not in target.name:
        return True
    return below(target, task / "evidence" / "developer")


def known_identity(session, agent):
    """Find existing ownership without initializing state for unrelated callers."""
    if not all(isinstance(value, str) and value.strip() for value in (session, agent)):
        return False
    try:
        raw = absolute(os.environ.get("CLAUDE_PLUGIN_DATA"))
        if str(Path(raw).resolve()) != raw.rstrip("/"):
            return False
        root = Path(raw) / "fastdev-v1"
        if root.is_symlink():
            return False
        observation = observation_path(root, session, agent)
        # The exact identity marker remains scoped evidence even if its JSON is damaged.
        if observation.exists() or observation.is_symlink():
            return True
        data = read_json(session_path(root, session))
        if data.get("session_id") != session:
            return False
        roles, retired = data.get("roles"), data.get("retired")
        return (
            isinstance(roles, dict) and any(role in ROLES and bound == agent for role, bound in roles.items())
        ) or (isinstance(retired, list) and agent in retired)
    except (OSError, ValueError, RuntimeError, GuardError):
        # A broken index alone does not establish ownership of an unrelated identity.
        return False


def check_edit(event):
    require(event.get("hook_event_name") == "PreToolUse", "unexpected edit event")
    if event.get("tool_name") not in {"Write", "Edit"}:
        return None
    role = event.get("agent_type")
    agent = event.get("agent_id")
    # Explicitly unrelated roles and the main session do not use this policy.
    if isinstance(role, str) and role.startswith("maixdev:"):
        require(role in ROLES, "unknown fastdev role")
    if role not in ROLES and (role or not agent):
        require(not known_identity(event.get("session_id"), agent), "known fastdev identity has a conflicting agent type; ask Main to rebind")
        return None
    require(role in ROLES, "agent type is missing; cannot classify this edit safely")
    session, agent = text(event.get("session_id")), text(agent)
    with store() as root:
        path = session_path(root, session)
        require(path.exists(), "fastdev registration is missing; ask Main to bind the role")
        data = validate(read_json(path), session)
        require(data["roles"].get(role) == agent and agent not in data["retired"], "unbound or retired role; ask Main to rebind")
        require(data["phase"] != "closed", "task is closed")
        if role == "maixdev:reviewer":
            raise GuardError("reviewer is read-only")
        if role == "maixdev:test-developer":
            return None
        raw = text(event.get("tool_input", {}).get("file_path"))
        if not os.path.isabs(raw):
            raw = str(Path(absolute(event.get("cwd"))) / raw)
        if data["mode"] == "tdd":
            require(not is_protected(raw, data), "protected test asset; submit a test issue to test-developer instead")
        # A bound developer must still be able to preserve a blocked-task handoff.
        require(data["phase"] == "active" or developer_record(raw, data), "developer is paused until registration and handoff are complete")
    return None


def main():
    require(len(sys.argv) == 2 and sys.argv[1] in {"observe", "apply", "hook"}, "usage: guard.py observe|apply|hook")
    command = sys.argv[1]
    try:
        payload = json.load(sys.stdin)
        require(isinstance(payload, dict), "expected JSON object")
        result = {"observe": observe, "apply": apply, "hook": check_edit}[command](payload)
        if result is not None:
            print(json.dumps(result, ensure_ascii=False))
        return 0
    except Exception as error:
        # Never print event payloads, file contents, or arbitrary exception strings.
        message = str(error) if isinstance(error, GuardError) else "invalid input or runtime state (" + type(error).__name__ + ")"
        if command == "hook":
            print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": "fastdev: " + message}}))
            return 0
        print("fastdev: " + message, file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
