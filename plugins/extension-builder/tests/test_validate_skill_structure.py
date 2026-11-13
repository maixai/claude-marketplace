"""Regression tests for the limited inspector; fixture code is never executed."""

import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


PLUGIN_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = PLUGIN_ROOT / "scripts" / "validate_skill_structure.py"
SPEC = importlib.util.spec_from_file_location("structure_inspector", SCRIPT)
INSPECTOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(INSPECTOR)
MINIMAL = "---\nname: sample\ndescription: A test skill\n---\n\n# Sample\n"


class StructureInspectorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="fixture-", dir=PLUGIN_ROOT / "tests")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.skill = self.root / "skill"
        self.skill.mkdir()
        self.write("SKILL.md", MINIMAL)

    def write(self, relative, text):
        path = self.skill / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(text, bytes):
            path.write_bytes(text)
        else:
            path.write_text(text, encoding="utf-8")
        return path

    def inspect(self, components=(), agents=(), roots=()):
        return INSPECTOR.Inspector(self.skill, components, agents, roots).run()

    def checks(self, report, check, status=None):
        return [item for item in report["checks"]
                if item["check"] == check and (status is None or item["status"] == status)]

    def cli(self, *args, cwd=PLUGIN_ROOT):
        return subprocess.run(
            [sys.executable, "-I", "-B", str(SCRIPT), *map(str, args)],
            cwd=cwd, capture_output=True, text=True, check=False,
        )

    def test_st01_minimal_and_existing_link_are_still_unverified(self):
        self.write("note.txt", "Fixture text\n")
        self.write("SKILL.md", MINIMAL + "[note](note.txt)\n")
        report = self.inspect()
        self.assertEqual(report["counts"]["fail"], 0)
        self.assertEqual(report["status"], "unverified")
        for check in ("yaml", "markdown_coverage", "runtime_and_semantics"):
            self.assertTrue(self.checks(report, check, "unverified"))
        self.assertTrue(self.checks(report, "local_reference", "pass"))
        self.assertFalse(report["scope"]["network"])
        self.assertFalse(report["scope"]["writes"])
        self.assertFalse(report["scope"]["yaml_parser"])

    def test_st02_missing_skill_returns_fail_exit_one(self):
        (self.skill / "SKILL.md").unlink()
        result = self.cli("--skill-dir", self.skill)
        self.assertEqual(result.returncode, 1)
        self.assertTrue(self.checks(json.loads(result.stdout), "file_read", "fail"))

    def test_st03_empty_and_whitespace(self):
        for data in ("", " \n\t"):
            with self.subTest(data=data):
                self.write("SKILL.md", data)
                self.assertTrue(self.checks(self.inspect(), "empty_file", "fail"))

    def test_st04_invalid_utf8_and_null(self):
        for data, check in ((b"\xff", "file_read"), (b"text\x00", "text_encoding")):
            with self.subTest(check=check):
                self.write("SKILL.md", data)
                self.assertTrue(self.checks(self.inspect(), check, "fail"))

    def test_st05_missing_or_empty_frontmatter(self):
        for text in ("# No frontmatter\n", "---\nname: sample\n", "---\n \n---\nBody\n"):
            with self.subTest(text=text):
                self.write("SKILL.md", text)
                self.assertTrue(self.checks(self.inspect(), "frontmatter_delimiters", "fail"))

    def test_st06_duplicate_missing_link_reported_once(self):
        self.write("SKILL.md", MINIMAL + "[one](missing.md) [two](missing.md)\n")
        failures = self.checks(self.inspect(), "local_reference", "fail")
        self.assertEqual(len(failures), 1)

    def test_st07_outside_link_not_read(self):
        outside = self.root / "outside.md"
        outside.write_bytes(b"\xff")
        self.write("SKILL.md", MINIMAL + "[outside](../outside.md)\n")
        report = self.inspect()
        self.assertTrue(self.checks(report, "scope", "fail"))
        self.assertFalse(self.checks(report, "file_read", "fail"))
        self.assertNotIn(str(outside), [item["path"] for item in self.checks(report, "text_encoding")])

    def test_st08_external_file_and_directory_symlinks(self):
        outside = self.root / "outside"
        outside.mkdir()
        (outside / "unread.md").write_bytes(b"\xff")
        (self.skill / "linked.md").symlink_to(outside / "unread.md")
        (self.skill / "linked-dir").symlink_to(outside, target_is_directory=True)
        report = self.inspect()
        self.assertEqual(len(self.checks(report, "scope", "fail")), 2)
        self.assertFalse(self.checks(report, "file_read", "fail"))
        self.assertFalse(self.checks(report, "directory_symlink"))

    def test_st09_internal_directory_symlink_not_traversed(self):
        internal = self.skill / "real"
        internal.mkdir()
        self.write("real/note.txt", "Fixture text\n")
        (self.skill / "alias").symlink_to(internal, target_is_directory=True)
        report = self.inspect()
        self.assertEqual(report["counts"]["fail"], 0)
        self.assertEqual(len(self.checks(report, "directory_symlink", "unverified")), 1)
        self.assertFalse(any("/alias/" in item["path"] for item in report["checks"]))

    def test_st10_dynamic_titles_parentheses_and_anchors(self):
        self.write("SKILL.md", MINIMAL + '\n'.join([
            "[dynamic](${ROOT}/a.md)", "[template]({{path}}/a.md)",
            '[title](note.md "A title")', "[complex](foo(bar).md)",
            "[fragment](#missing-anchor)", "[encoded](%24%7BROOT%7D/a.md)",
            "[web](https://example.invalid/never-fetch)", "",
        ]))
        report = self.inspect()
        self.assertEqual(report["counts"]["fail"], 0)
        for check in ("markdown_reference", "fragment", "external_reference"):
            self.assertTrue(self.checks(report, check, "unverified"))

    def test_st11_code_links_are_ignored(self):
        self.write("SKILL.md", MINIMAL + (
            "`[inline](missing-one.md)`\n"
            "```markdown\n[block](missing-two.md)\n```\n"
            "~~~markdown\n[other](missing-three.md)\n~~~\n"
        ))
        report = self.inspect()
        self.assertEqual(report["counts"]["fail"], 0)
        self.assertFalse(self.checks(report, "local_reference"))

    def test_st12_allow_root_does_not_scan_extra_directory(self):
        shared = self.root / "shared"
        shared.mkdir()
        (shared / "note.md").write_text("Note\n", encoding="utf-8")
        (shared / "unrelated.md").write_bytes(b"\xff")
        self.write("SKILL.md", MINIMAL + "[shared](../shared/note.md)\n")
        self.assertTrue(self.checks(self.inspect(), "scope", "fail"))
        report = self.inspect(roots=[shared])
        self.assertEqual(report["counts"]["fail"], 0)
        self.assertTrue(self.checks(report, "local_reference", "pass"))
        self.assertFalse(any("unrelated.md" in item["path"] for item in report["checks"]))

    def test_st13_agents_require_frontmatter_scripts_never_execute(self):
        helper = self.root / "helper.py"
        helper.write_text('raise RuntimeError("fixture must never execute")\n', encoding="utf-8")
        agent = self.root / "agent.md"
        agent.write_text("# Agent\n", encoding="utf-8")
        report = self.inspect(components=[helper], agents=[agent])
        failures = self.checks(report, "frontmatter_delimiters", "fail")
        self.assertEqual([item["path"] for item in failures], [str(agent)])
        agent.write_text(MINIMAL + "[sibling](sibling.txt)\n", encoding="utf-8")
        (self.root / "sibling.txt").write_text("Fixture text\n", encoding="utf-8")
        report = self.inspect(components=[helper], agents=[agent])
        self.assertTrue(self.checks(report, "scope", "fail"))
        self.assertNotIn(str(self.root), report["scope"]["approved_roots"])

    def test_st14_binary_and_oversized_text_are_unverified(self):
        self.write("asset.bin", b"\xff\xfe")
        self.write("large.txt", b"x" * (INSPECTOR.MAX_TEXT_BYTES + 1))
        report = self.inspect()
        self.assertEqual(report["counts"]["fail"], 0)
        self.assertEqual(len(self.checks(report, "content", "unverified")), 2)

    def test_st15_invalid_yaml_is_not_parsed(self):
        self.write("SKILL.md", "---\nname: [invalid yaml\n---\nBody\n")
        report = self.inspect()
        self.assertEqual(report["counts"]["fail"], 0)
        self.assertTrue(self.checks(report, "yaml", "unverified"))
        self.assertEqual(report["status"], "unverified")

    def test_st16_argument_errors_are_not_json_reports(self):
        for args in ((), ("--unknown",), ("--skill-dir",)):
            with self.subTest(args=args):
                result = self.cli(*args)
                self.assertEqual(result.returncode, 2)
                self.assertEqual(result.stdout, "")
                self.assertIn("error:", result.stderr)

    def test_st17_symlink_then_parent_escapes(self):
        (self.root / "outside.md").write_text("Outside\n", encoding="utf-8")
        (self.skill / "alias").symlink_to(self.skill, target_is_directory=True)
        self.write("SKILL.md", MINIMAL + "[outside](alias/../outside.md)\n")
        report = self.inspect()
        self.assertTrue(self.checks(report, "scope", "fail"))
        self.assertFalse(self.checks(report, "local_reference", "pass"))

    def test_st18_symlink_then_parent_remains_inside(self):
        nested = self.skill / "nested"
        nested.mkdir()
        (self.skill / "alias").symlink_to(nested, target_is_directory=True)
        self.write("SKILL.md", MINIMAL + "[inside](alias/../SKILL.md)\n")
        report = self.inspect()
        self.assertEqual(report["counts"]["fail"], 0)
        self.assertTrue(self.checks(report, "local_reference", "pass"))
        self.assertTrue(self.checks(report, "directory_symlink", "unverified"))

    def test_unverified_exit_two_is_valid_json(self):
        result = self.cli("--skill-dir", self.skill)
        self.assertEqual(result.returncode, 2)
        self.assertEqual(result.stderr, "")
        self.assertEqual(json.loads(result.stdout)["status"], "unverified")

    def test_failure_takes_priority_over_unverified(self):
        self.write("SKILL.md", MINIMAL + "[missing](missing.md)\n")
        result = self.cli("--skill-dir", self.skill)
        report = json.loads(result.stdout)
        self.assertGreater(report["counts"]["unverified"], 0)
        self.assertGreater(report["counts"]["fail"], 0)
        self.assertEqual(report["status"], "fail")
        self.assertEqual(result.returncode, 1)

    def test_reference_definition_percent_encoded_and_space_path(self):
        self.write("space note.md", "# Note\n")
        self.write("SKILL.md", MINIMAL + (
            "[one][note]\n[note]: space%20note.md\n[two](<space note.md>)\n"
        ))
        report = self.inspect()
        self.assertEqual(report["counts"]["fail"], 0)
        self.assertTrue(self.checks(report, "local_reference", "pass"))

    def test_null_encoded_link_fails(self):
        self.write("SKILL.md", MINIMAL + "[bad](invalid%00.md)\n")
        self.assertTrue(self.checks(self.inspect(), "local_reference", "fail"))

    def test_explicit_component_symlink_does_not_authorize_destination(self):
        outside = self.root / "outside.txt"
        outside.write_text("Outside\n", encoding="utf-8")
        link = self.root / "component.txt"
        link.symlink_to(outside)
        report = self.inspect(components=[link])
        self.assertTrue(self.checks(report, "scope", "fail"))
        self.assertFalse(any(item["path"] == str(link) for item in self.checks(report, "file_exists")))

    def test_non_regular_component_fails(self):
        directory = self.root / "component"
        directory.mkdir()
        report = self.inspect(components=[directory])
        self.assertTrue(self.checks(report, "file_type", "fail"))

    def test_missing_skill_directory_fails(self):
        missing = self.root / "absent"
        report = INSPECTOR.Inspector(missing, [], [], []).run()
        self.assertEqual(report["status"], "fail")
        self.assertTrue(self.checks(report, "skill_directory", "fail"))

    def check_cli_symlink_parent_escape(self, flag, suffix):
        workspace = self.root / "workspace"
        elsewhere = self.root / "elsewhere"
        for parent in (workspace, elsewhere):
            (parent / "skill").mkdir(parents=True)
            (parent / "shared").mkdir()
            (parent / "skill/SKILL.md").write_text(
                MINIMAL if parent == workspace else "", encoding="utf-8")
            (parent / "helper.py").write_text(
                "# Fixture only\n" if parent == workspace else "", encoding="utf-8")
            (parent / "agent.md").write_text(
                MINIMAL if parent == workspace else "", encoding="utf-8")
            (parent / "shared/note.txt").write_text("Fixture only\n", encoding="utf-8")
        (elsewhere / "nested").mkdir()
        (workspace / "link").symlink_to(elsewhere / "nested", target_is_directory=True)
        decoy = workspace / suffix
        actual = elsewhere / suffix
        if flag != "--skill-dir":
            reference = suffix + "/note.txt" if flag == "--allow-root" else suffix
            self.write("SKILL.md", MINIMAL + f"[decoy](../workspace/{reference})\n")
        for relative in (False, True):
            with self.subTest(flag=flag, relative=relative):
                supplied = Path("link/../") / suffix if relative else workspace / "link" / ".." / suffix
                args = [] if flag == "--skill-dir" else ["--skill-dir", self.skill]
                result = self.cli(*args, flag, supplied, cwd=workspace)
                report = json.loads(result.stdout)
                self.assertEqual(result.returncode, 1)
                self.assertEqual(report["status"], "fail")
                failures = self.checks(report, "scope", "fail")
                self.assertTrue(failures)
                self.assertTrue(any(str(actual) in item["detail"] for item in failures))
                self.assertNotIn(str(decoy), report["scope"]["approved_roots"])
                self.assertNotIn(str(actual), report["scope"]["approved_roots"])
                passed = self.checks(report, "file_exists", "pass") + self.checks(report, "local_reference", "pass")
                self.assertFalse(any(str(workspace) in item["path"] or str(elsewhere) in item["path"]
                                     for item in passed))
                self.assertFalse(self.checks(report, "empty_file", "fail"))

    def test_st26_cli_skill_dir_symlink_parent_rejects_wrong_target(self):
        self.check_cli_symlink_parent_escape("--skill-dir", "skill")

    def test_st27_cli_component_symlink_parent_does_not_authorize_decoy(self):
        self.check_cli_symlink_parent_escape("--component", "helper.py")

    def test_st28_cli_agent_symlink_parent_does_not_authorize_decoy(self):
        self.check_cli_symlink_parent_escape("--agent", "agent.md")

    def test_st29_cli_allow_root_symlink_parent_does_not_authorize_decoy(self):
        self.check_cli_symlink_parent_escape("--allow-root", "shared")

    def test_st30_cli_safe_parent_paths_keep_their_filesystem_target(self):
        nested = self.root / "nested"
        nested.mkdir()
        (self.root / "alias").symlink_to(nested, target_is_directory=True)
        (self.root / "helper.py").write_text("# Fixture only\n", encoding="utf-8")
        (self.root / "agent.md").write_text(MINIMAL, encoding="utf-8")
        shared = self.root / "shared"
        shared.mkdir()
        (shared / "note.txt").write_text("Fixture only\n", encoding="utf-8")
        for flag, suffix in (("--skill-dir", "skill"), ("--component", "helper.py"),
                             ("--agent", "agent.md"), ("--allow-root", "shared")):
            for prefix in ("nested", "alias"):
                for relative in (False, True):
                    with self.subTest(flag=flag, prefix=prefix, relative=relative):
                        self.write("SKILL.md", MINIMAL + (
                            "[shared](../shared/note.txt)\n" if flag == "--allow-root" else ""))
                        supplied = Path(prefix) / ".." / suffix
                        if not relative:
                            supplied = self.root / supplied
                        args = [] if flag == "--skill-dir" else ["--skill-dir", self.skill]
                        result = self.cli(*args, flag, supplied, cwd=self.root)
                        report = json.loads(result.stdout)
                        self.assertEqual(result.returncode, 2)
                        self.assertEqual(report["counts"]["fail"], 0)
                        self.assertEqual(report["status"], "unverified")
                        if flag == "--allow-root":
                            self.assertIn(str(shared), report["scope"]["approved_roots"])
                            self.assertTrue(self.checks(report, "local_reference", "pass"))
                        else:
                            passed = self.checks(report, "file_exists", "pass")
                            target = self.root / suffix
                            if flag == "--skill-dir":
                                target = target / "SKILL.md"
                            self.assertTrue(any(Path(item["path"]).resolve() == target for item in passed))

    def test_st31_explicit_root_symlinks_do_not_grant_new_scope(self):
        outside = self.root / "outside"
        outside.mkdir()
        (outside / "SKILL.md").write_text(MINIMAL, encoding="utf-8")
        link = self.root / "linked-root"
        link.symlink_to(outside, target_is_directory=True)
        for flag in ("--skill-dir", "--allow-root"):
            with self.subTest(flag=flag):
                self.write("SKILL.md", MINIMAL + (
                    "[outside](../outside/SKILL.md)\n" if flag == "--allow-root" else ""))
                args = [] if flag == "--skill-dir" else ["--skill-dir", self.skill]
                result = self.cli(*args, flag, link)
                report = json.loads(result.stdout)
                self.assertEqual(result.returncode, 1)
                self.assertTrue(self.checks(report, "scope", "fail"))
                self.assertNotIn(str(outside), report["scope"]["approved_roots"])
                self.assertNotIn(str(link), report["scope"]["approved_roots"])
                self.assertFalse(self.checks(report, "local_reference", "pass"))
                self.assertFalse(any("outside" in item["path"] or "linked-root" in item["path"]
                                     for item in self.checks(report, "file_exists", "pass")))


if __name__ == "__main__":
    unittest.main()
