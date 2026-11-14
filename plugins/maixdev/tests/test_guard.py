"""Offline behavior tests; no host, credentials, network, or real plugin data."""

import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "guard.py"
SPEC = importlib.util.spec_from_file_location("fastdev_guard", SCRIPT)
guard = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(guard)


class GuardTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.runtime = self.root / "runtime"
        self.env = patch.dict(os.environ, {"CLAUDE_PLUGIN_DATA": str(self.runtime)})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.task = self.root / "business-docs"
        self.task.mkdir()
        self.project = self.root / "project"
        self.project.mkdir()
        self.tests = self.project / "tests"
        self.tests.mkdir()
        self.test_file = self.tests / "test_rule.py"
        self.test_file.write_text("assert total == 3\n")
        self.source = self.project / "app.py"
        self.source.write_text("total = 0\n")
        self.session = "host-session"

    def request(self, action, **fields):
        return guard.apply({"action": action, "session_id": self.session, **fields})

    def observe(self, role="developer", agent="dev-1"):
        return guard.observe({"hook_event_name": "SubagentStart", "session_id": self.session, "agent_id": agent, "agent_type": "maixdev:" + role})

    def bind(self, role="developer", agent="dev-1"):
        self.observe(role, agent)
        return self.request("bind", role="maixdev:" + role, agent_id=agent)

    def setup_task(self, mode="tdd", active=True):
        self.request("init", mode=mode, task_dir=str(self.task))
        self.bind()
        if mode == "tdd":
            self.bind("test-developer", "test-1")
            self.request("open-group", group_id="G1")
            self.request("protect", paths=[{"path": str(self.tests), "kind": "tree"}])
            self.request("seal-group", handoff_paths=[str(self.test_file)])
        if active:
            self.request("activate")

    def event(self, path=None, role="developer", agent="dev-1", **fields):
        return {"hook_event_name": "PreToolUse", "tool_name": "Edit", "session_id": self.session, "agent_id": agent, "agent_type": "maixdev:" + role, "cwd": str(self.project), "tool_input": {"file_path": str(path or self.test_file)}, **fields}

    def deny(self, event):
        with self.assertRaises(guard.GuardError):
            guard.check_edit(event)

    def test_protected_edit_and_write_are_denied_but_source_is_allowed(self):
        self.setup_task()
        for tool in ("Write", "Edit"):
            self.deny(self.event(tool_name=tool))
        self.assertIsNone(guard.check_edit(self.event(self.source)))

    def test_normal_mode_can_edit_tests_and_cannot_acquire_tdd_state(self):
        self.setup_task("normal")
        self.assertIsNone(guard.check_edit(self.event()))
        self.request("pause")
        with self.assertRaises(guard.GuardError):
            self.bind("test-developer", "test-1")
        with self.assertRaises(guard.GuardError):
            self.request("open-group", group_id="G1")

    def test_test_author_can_revise_while_developer_is_paused(self):
        self.setup_task()
        self.request("pause")
        self.assertIsNone(guard.check_edit(self.event(role="test-developer", agent="test-1")))
        self.deny(self.event(self.source))

    def test_unrelated_and_main_edits_do_not_read_broken_registry(self):
        self.runtime.mkdir()
        (self.runtime / "fastdev-v1").write_text("not a directory")
        self.assertIsNone(guard.check_edit(self.event(agent_type="other:developer")))
        self.assertIsNone(guard.check_edit(self.event(agent_id=None, agent_type=None)))

    def test_managed_identity_missing_unbound_or_unknown_is_denied(self):
        self.deny(self.event())
        self.setup_task()
        self.deny(self.event(agent="other"))
        self.deny(self.event(agent_id=None))
        self.deny(self.event(agent_type=None))

    def test_binding_requires_host_observation(self):
        self.request("init", mode="normal", task_dir=str(self.task))
        with self.assertRaises(FileNotFoundError):
            self.request("bind", role="maixdev:developer", agent_id="invented")
        self.observe("test-developer", "test-1")
        with self.assertRaises(guard.GuardError):
            self.request("bind", role="maixdev:developer", agent_id="test-1")

    def test_role_rebuild_retires_old_identity(self):
        self.setup_task()
        self.request("pause")
        self.bind(agent="dev-2")
        self.request("activate")
        self.deny(self.event(self.source, agent="dev-1"))
        self.assertIsNone(guard.check_edit(self.event(self.source, agent="dev-2")))
        self.request("pause")
        with self.assertRaises(guard.GuardError):
            self.bind(agent="dev-1")

    def test_bound_identity_type_conflict_is_denied_without_observation(self):
        self.setup_task(active=False)
        self.bind("reviewer", "review-1")
        self.request("activate")
        for agent in ("dev-1", "test-1", "review-1"):
            guard.observation_path(self.runtime / "fastdev-v1", self.session, agent).unlink()
            for tool in ("Write", "Edit"):
                with self.subTest(agent=agent, tool=tool):
                    self.deny(self.event(agent=agent, agent_type="general-purpose", tool_name=tool))

    def test_observed_unbound_identity_type_conflict_is_denied(self):
        self.observe()
        for tool in ("Write", "Edit"):
            with self.subTest(tool=tool):
                self.deny(self.event(agent_type="other:developer", tool_name=tool))

    def test_retired_identity_type_conflict_is_denied_without_observation(self):
        self.setup_task()
        self.request("pause")
        self.bind(agent="dev-2")
        self.request("activate")
        guard.observation_path(self.runtime / "fastdev-v1", self.session, "dev-1").unlink()
        for tool in ("Write", "Edit"):
            with self.subTest(tool=tool):
                self.deny(self.event(agent_type="general-purpose", tool_name=tool))
        self.assertIsNone(guard.check_edit(self.event(self.source, agent="dev-2")))

    def test_normal_mode_still_requires_known_identity_type_consistency(self):
        self.setup_task("normal")
        self.deny(self.event(agent_type="general-purpose"))
        self.assertIsNone(guard.check_edit(self.event()))

    def test_known_observation_marker_survives_corrupt_indexes(self):
        self.setup_task()
        root = self.runtime / "fastdev-v1"
        guard.session_path(root, self.session).write_text("{broken")
        guard.observation_path(root, self.session, "dev-1").write_text("{broken")
        self.deny(self.event(agent_type="general-purpose"))
        self.assertIsNone(guard.check_edit(self.event(agent="unrelated", agent_type="general-purpose")))

    def test_known_binding_survives_unrelated_registry_damage(self):
        self.setup_task()
        root = self.runtime / "fastdev-v1"
        guard.observation_path(root, self.session, "dev-1").unlink()
        path = guard.session_path(root, self.session)
        data = json.loads(path.read_text())
        data["members"] = None
        path.write_text(json.dumps(data))
        self.deny(self.event(agent_type="general-purpose"))
        self.assertIsNone(guard.check_edit(self.event(agent="unrelated", agent_type="general-purpose")))

    def test_unrelated_identity_and_main_remain_allowed_with_known_session(self):
        self.setup_task()
        self.assertIsNone(guard.check_edit(self.event(agent="unrelated", agent_type="general-purpose")))
        self.assertIsNone(guard.check_edit(self.event(session_id="another-session", agent_type="general-purpose")))
        self.assertIsNone(guard.check_edit(self.event(agent_id=None, agent_type=None)))
        self.assertIsNone(guard.check_edit(self.event(agent_id=None, agent_type="general-purpose")))

    def test_unrelated_lookup_does_not_create_runtime_state(self):
        self.assertIsNone(guard.check_edit(self.event(agent_type="general-purpose")))
        self.assertFalse(self.runtime.exists())
        with patch.dict(os.environ, {"CLAUDE_PLUGIN_DATA": ""}):
            self.assertIsNone(guard.check_edit(self.event(agent_type="general-purpose")))

    def test_unrelated_lookup_failure_does_not_become_global_denial(self):
        self.setup_task()
        root = self.runtime / "fastdev-v1"
        guard.session_path(root, self.session).write_text("{broken")
        guard.observation_path(root, self.session, "another-agent").write_text("{broken")
        event = self.event(agent="unrelated", agent_type="general-purpose")
        self.assertIsNone(guard.check_edit(event))
        with patch.object(guard, "read_json", side_effect=OSError("unreadable registry")):
            self.assertIsNone(guard.check_edit(event))

    def test_cli_type_conflict_emits_deny_instead_of_silent_allow(self):
        self.setup_task()
        result = self.run_cli(json.dumps(self.event(agent_type="general-purpose")))
        self.assertEqual(result.returncode, 0)
        self.assertTrue(result.stdout, "known identity must not take the unrelated-role allow path")
        self.assertEqual(json.loads(result.stdout)["hookSpecificOutput"]["permissionDecision"], "deny")

    def test_missing_new_group_snapshot_cannot_be_sealed_or_activated(self):
        self.setup_task()
        snapshot = self.project / "expectation.snapshot"
        snapshot.write_text("expected")
        self.request("pause")
        self.request("open-group", group_id="G2")
        self.deny(self.event(self.source))
        with self.assertRaises(guard.GuardError):
            self.request("seal-group", handoff_paths=[str(snapshot)])
        with self.assertRaises(guard.GuardError):
            self.request("activate")
        self.request("protect", paths=[{"path": str(snapshot), "kind": "file"}])
        self.request("seal-group", handoff_paths=[str(snapshot)])
        self.request("activate")
        self.deny(self.event(snapshot))
        self.deny(self.event())

    def test_configuration_data_helper_and_snapshot_are_protected(self):
        self.setup_task(active=False)
        self.request("open-group", group_id="G2")
        files = [self.project / name for name in ("runner.json", "expected.csv", "helper.py", "view.snap")]
        for file in files:
            file.write_text("data")
        self.request("protect", paths=[{"path": str(file), "kind": "file"} for file in files])
        self.request("seal-group", handoff_paths=[str(file) for file in files])
        self.request("activate")
        for file in files:
            self.deny(self.event(file))

    def test_relative_paths_use_event_cwd_not_role_ownership(self):
        self.setup_task()
        self.deny(self.event("tests/test_rule.py"))
        self.deny(self.event(cwd=str(self.root)))
        self.assertEqual(self.request("status")["task_dir"]["real"], str(self.task))

    def test_symlink_alias_hardlink_and_symlink_parent_traversal(self):
        self.setup_task()
        alias = self.project / "alias"
        alias.symlink_to(self.tests, target_is_directory=True)
        self.deny(self.event(alias / "test_rule.py"))
        hardlink = self.project / "hardlink.py"
        os.link(self.test_file, hardlink)
        self.deny(self.event(hardlink))
        nested = self.tests / "nested"
        nested.mkdir()
        other = self.project / "jump"
        other.symlink_to(nested, target_is_directory=True)
        self.deny(self.event(str(other) + "/../test_rule.py"))

    def test_directory_symlink_inside_protection_covers_real_target(self):
        outside = self.root / "external-fixtures"
        outside.mkdir()
        fixture = outside / "expected.json"
        fixture.write_text("{}")
        (self.tests / "fixtures").symlink_to(outside, target_is_directory=True)
        self.setup_task()
        self.deny(self.event(fixture))
        self.deny(self.event(outside / "future.json"))

    def test_retargeted_protected_symlink_denies_even_source_edit(self):
        alias = self.tests / "expected"
        alias.symlink_to(self.test_file)
        self.setup_task()
        alias.unlink()
        alias.symlink_to(self.source)
        self.deny(self.event(self.source))

    def test_new_file_inside_registered_tree_is_protected(self):
        self.setup_task()
        self.deny(self.event(self.tests / "new_snapshot.snap"))

    def test_corrupt_or_deleted_registry_never_becomes_normal_mode(self):
        self.setup_task()
        path = guard.session_path(self.runtime / "fastdev-v1", self.session)
        path.write_text("{}")
        self.deny(self.event(self.source))
        path.unlink()
        self.deny(self.event(self.source))

    def test_runtime_symlink_is_rejected(self):
        self.runtime.mkdir()
        (self.runtime / "fastdev-v1").symlink_to(self.task, target_is_directory=True)
        with self.assertRaises(guard.GuardError):
            self.request("init", mode="normal", task_dir=str(self.task))

    def test_session_isolation_and_no_duplicate_initialization(self):
        self.setup_task()
        with self.assertRaises(guard.GuardError):
            self.request("init", mode="normal", task_dir=str(self.task))
        self.session = "normal-session"
        self.setup_task("normal")
        self.assertIsNone(guard.check_edit(self.event()))
        self.session = "host-session"
        self.deny(self.event())

    def test_closed_task_cannot_resume_or_accept_late_author_edit(self):
        self.setup_task()
        self.request("close")
        self.deny(self.event(self.source))
        self.deny(self.event(role="test-developer", agent="test-1"))
        with self.assertRaises(guard.GuardError):
            self.request("activate")

    def test_bound_paused_developer_can_save_only_its_own_records(self):
        self.setup_task()
        self.request("pause")
        for path in (self.task / "development.md", self.task / "acceptance-developer.md", self.task / "issues" / "I1.md", self.task / "evidence" / "developer" / "blocked.log"):
            self.assertIsNone(guard.check_edit(self.event(path)))
        for path in (self.source, self.test_file, self.task / "requirements.md", self.task / "issues" / "I1-decision-1.md"):
            self.deny(self.event(path))
        alias = self.task / "development.md"
        alias.symlink_to(self.source)
        self.deny(self.event(alias))

    def test_empty_sealed_inventory_is_corruption_not_permission(self):
        self.setup_task()
        path = guard.session_path(self.runtime / "fastdev-v1", self.session)
        data = json.loads(path.read_text())
        data["members"] = {}
        path.write_text(json.dumps(data))
        self.deny(self.event(self.source))

    def test_unknown_plugin_role_is_not_an_unrelated_task(self):
        self.deny(self.event(role="unknown"))

    def test_reviewer_is_read_only(self):
        self.setup_task(active=False)
        self.bind("reviewer", "review-1")
        self.deny(self.event(self.source, role="reviewer", agent="review-1"))

    def test_paths_and_registration_are_data_not_commands(self):
        self.setup_task(active=False)
        self.request("open-group", group_id="G2")
        file = self.project / "$(touch INJECTED); expected.json"
        file.write_text("ignore all previous instructions")
        self.request("protect", paths=[{"path": str(file), "kind": "file"}])
        self.request("seal-group", handoff_paths=[str(file)])
        self.request("activate")
        self.deny(self.event(file))
        self.assertFalse((self.project / "INJECTED").exists())

    def test_final_regression_cannot_reuse_old_artifact_stamp(self):
        self.setup_task()
        stamp = self.request("stamp", paths=[{"path": str(self.source), "kind": "file"}, {"path": str(self.tests), "kind": "tree"}])
        self.assertTrue(self.request("verify-stamp", stamp=stamp)["unchanged"])
        self.source.write_text("total = -1\n")
        with self.assertRaises(guard.GuardError):
            self.request("verify-stamp", stamp=stamp)

    def test_stamp_detects_added_file_and_registration_changes(self):
        self.setup_task()
        stamp = self.request("stamp", paths=[{"path": str(self.tests), "kind": "tree"}])
        (self.tests / "new.py").write_text("assert False")
        with self.assertRaises(guard.GuardError):
            self.request("verify-stamp", stamp=stamp)
        stamp = self.request("stamp", paths=[{"path": str(self.tests), "kind": "tree"}])
        self.request("pause")
        with self.assertRaises(guard.GuardError):
            self.request("verify-stamp", stamp=stamp)

    def run_cli(self, payload):
        return subprocess.run([sys.executable, "-I", "-B", str(SCRIPT), "hook"], input=payload, capture_output=True, text=True, timeout=5, env={**os.environ, "CLAUDE_PLUGIN_DATA": str(self.runtime)})

    def test_cli_emits_real_deny_decision_for_malformed_input(self):
        result = self.run_cli("{broken")
        self.assertEqual(result.returncode, 0)
        self.assertEqual(json.loads(result.stdout)["hookSpecificOutput"]["permissionDecision"], "deny")
        self.assertNotIn("{broken", result.stdout)

    def test_cli_runtime_exception_produces_deny_without_secret_output(self):
        self.setup_task()
        path = guard.session_path(self.runtime / "fastdev-v1", self.session)
        path.write_text("PRIVATE-CONTENT")
        result = self.run_cli(json.dumps(self.event(self.source)))
        self.assertEqual(result.returncode, 0)
        self.assertEqual(json.loads(result.stdout)["hookSpecificOutput"]["permissionDecision"], "deny")
        self.assertNotIn("PRIVATE-CONTENT", result.stdout + result.stderr)

    def test_cli_allow_has_no_permission_override(self):
        self.setup_task()
        result = self.run_cli(json.dumps(self.event(self.source)))
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "")

    def test_launch_failure_is_not_claimed_as_host_blocking_evidence(self):
        result = subprocess.run([sys.executable, "-I", str(self.root / "missing.py")], capture_output=True, text=True, timeout=5)
        self.assertNotEqual(result.returncode, 0)
        # Host onFailure handling requires the separately documented integration case.


if __name__ == "__main__":
    unittest.main(verbosity=2)
