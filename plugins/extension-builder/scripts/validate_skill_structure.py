#!/usr/bin/env python3
"""Inspect explicitly scoped files without executing code or parsing YAML."""

import argparse
import json
import os
from pathlib import Path
import re
import stat
import sys
from urllib.parse import unquote, urlsplit


MAX_TEXT_BYTES = 1024 * 1024
TEXT_SUFFIXES = {
    ".md", ".txt", ".py", ".sh", ".json", ".yaml", ".yml", ".toml",
    ".js", ".ts", ".html", ".css", ".xml", ".csv",
}
INLINE_LINK = re.compile(r"!?\[[^\]\n]*\]\(([^)\n]*)\)")
REFERENCE = re.compile(r"^ {0,3}\[[^\]\n]+\]:\s*(.+)$", re.MULTILINE)
FENCE = re.compile(r"^ {0,3}(`{3,}|~{3,})(.*)$")


def absolute(path):
    """Anchor relative paths without collapsing symlink-sensitive components."""
    path = Path(path)
    return path if path.is_absolute() else Path.cwd() / path


def resolved(path):
    """Resolve symlinks before applying the remaining path components.

    Lexical normalization would collapse ``link/..`` to the link's parent,
    while the filesystem applies ``..`` after following the link.
    """
    return Path(os.path.realpath(os.fspath(path)))


def beneath(path, root):
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def prose_only(text):
    """Exclude fenced and inline code from the limited link scan."""
    lines = []
    delimiter = None
    for line in text.splitlines():
        match = FENCE.match(line)
        if delimiter is not None:
            if (match and match[1][0] == delimiter[0]
                    and len(match[1]) >= len(delimiter) and not match[2].strip()):
                delimiter = None
            lines.append("")
        elif match:
            delimiter = match[1]
            lines.append("")
        else:
            lines.append(line)
    return re.sub(r"(`+)(.*?)\1", "", "\n".join(lines))


class Inspector:
    def __init__(self, skill_dir, components, agents, allowed_roots):
        self.skill_dir = absolute(skill_dir)
        self.agents = {absolute(p) for p in agents}
        self.components = {absolute(p) for p in components} | self.agents
        requested_roots = {self.skill_dir} | {absolute(p) for p in allowed_roots}
        self.roots = set()
        self.approved_components = set()
        self.results = []
        self.seen_results = set()
        self.seen_files = set()
        self.seen_links = set()
        for path in sorted(requested_roots | self.components):
            try:
                # Normalization defines a boundary, never a replacement read target.
                expected = Path(os.path.abspath(os.fspath(path)))
                actual = resolved(path)
            except (OSError, RuntimeError, ValueError) as exc:
                self.add("fail", "path_resolution", path, str(exc))
                continue
            if actual == expected:
                if path in requested_roots:
                    self.roots.add(expected)
                if path in self.components:
                    self.approved_components.add(expected)
            elif path in requested_roots:
                self.add("fail", "scope", path,
                         f"Root resolves to a different location; approve its real path explicitly: {actual}")

    def add(self, status, check, path, detail):
        key = (status, check, str(path), detail)
        if key not in self.seen_results:
            self.seen_results.add(key)
            self.results.append({
                "status": status, "check": check,
                "path": str(path), "detail": detail,
            })

    def scoped(self, path):
        try:
            actual = resolved(path)
        except (OSError, RuntimeError, ValueError) as exc:
            self.add("fail", "path_resolution", path, str(exc))
            return False
        if actual in self.approved_components or any(beneath(actual, root) for root in self.roots):
            return True
        self.add("fail", "scope", path, f"Resolved path is outside approved scope: {actual}")
        return False

    def inspect_frontmatter(self, path, text, required):
        lines = text.splitlines()
        starts = bool(lines) and lines[0] == "---"
        if not starts:
            if required:
                self.add("fail", "frontmatter_delimiters", path, "The first line must be ---")
            return text
        closing = next((i for i in range(1, len(lines)) if lines[i] == "---"), None)
        if closing is None:
            self.add("fail", "frontmatter_delimiters", path, "Missing closing --- delimiter")
            return ""
        if not any(line.strip() for line in lines[1:closing]):
            self.add("fail", "frontmatter_delimiters", path, "Frontmatter is empty")
        else:
            self.add("pass", "frontmatter_delimiters", path, "Nonempty delimited block found")
        self.add("unverified", "yaml", path, "YAML syntax, fields and types require host or parser validation")
        return "\n".join(lines[closing + 1:])

    def inspect_link(self, source, raw):
        raw = raw.strip()
        if raw.startswith("<") and raw.endswith(">"):
            raw = raw[1:-1]
        elif any(char.isspace() for char in raw):
            self.add("unverified", "markdown_reference", source, f"Unsupported link syntax: {raw}")
            return
        key = (str(source.parent), raw)
        if key in self.seen_links:
            return
        self.seen_links.add(key)
        if not raw or any(token in raw for token in ("${", "{{", "<", ">", "(", "\\", "*", "?")):
            self.add("unverified", "markdown_reference", source, f"Dynamic or unsupported reference: {raw}")
            return
        try:
            parsed = urlsplit(raw)
            if parsed.scheme or parsed.netloc:
                self.add("unverified", "external_reference", source, f"Not fetched: {raw}")
                return
            if parsed.fragment:
                self.add("unverified", "fragment", source, f"Anchor not checked: {raw}")
            if not parsed.path:
                return
            decoded = unquote(parsed.path)
            if "\x00" in decoded:
                raise ValueError("Null byte in reference")
            if any(token in decoded for token in ("${", "{{", "<", ">", "*", "?")):
                self.add("unverified", "markdown_reference", source, f"Dynamic reference: {raw}")
                return
            # Keep the path components intact: lexical normalization here would
            # hide a symlinked directory that the following ".." escapes from.
            target = source.parent / decoded
            if not self.scoped(target):
                return
            actual = resolved(target)
            if actual.exists():
                self.add("pass", "local_reference", actual, "Referenced path exists")
            else:
                self.add("fail", "local_reference", actual, f"Missing reference from {source}")
        except (OSError, RuntimeError, ValueError) as exc:
            self.add("fail", "local_reference", source, f"Cannot inspect {raw}: {exc}")

    def inspect_file(self, path, required_frontmatter=False):
        path = absolute(path)
        if path in self.seen_files:
            return
        self.seen_files.add(path)
        if not self.scoped(path):
            return
        try:
            info = path.stat()
            if not stat.S_ISREG(info.st_mode):
                self.add("fail", "file_type", path, "Expected a regular file")
                return
            self.add("pass", "file_exists", path, "Regular file exists")
            if info.st_size == 0:
                self.add("fail", "empty_file", path, "File is empty")
                return
            if path.suffix.lower() not in TEXT_SUFFIXES:
                self.add("unverified", "content", path, "Binary or unknown file type was not read")
                return
            if info.st_size > MAX_TEXT_BYTES:
                self.add("unverified", "content", path, "File exceeds the 1 MiB text inspection limit")
                return
            with path.open("rb") as handle:
                data = handle.read(MAX_TEXT_BYTES + 1)
            if len(data) > MAX_TEXT_BYTES:
                self.add("unverified", "content", path, "File grew beyond the text inspection limit")
                return
            text = data.decode("utf-8")
            if "\x00" in text:
                self.add("fail", "text_encoding", path, "Unexpected null byte in text file")
                return
            self.add("pass", "text_encoding", path, "Valid UTF-8 text")
            if not text.strip():
                self.add("fail", "empty_file", path, "File contains only whitespace")
                return
            if path.suffix.lower() == ".md":
                body = self.inspect_frontmatter(path, text, required_frontmatter)
                prose = prose_only(body)
                self.add("unverified", "markdown_coverage", path,
                         "Limited file-link scan only; full Markdown syntax and implicit references are not validated")
                for match in INLINE_LINK.finditer(prose):
                    self.inspect_link(path, match[1])
                for match in REFERENCE.finditer(prose):
                    self.inspect_link(path, match[1])
        except (OSError, UnicodeError, ValueError) as exc:
            self.add("fail", "file_read", path, str(exc))

    def run(self):
        self.inspect_file(self.skill_dir / "SKILL.md", required_frontmatter=True)
        if self.scoped(self.skill_dir) and self.skill_dir.is_dir():
            def on_error(exc):
                self.add("fail", "directory_read", exc.filename or self.skill_dir, str(exc))

            for base, dirs, files in os.walk(self.skill_dir, followlinks=False, onerror=on_error):
                dirs.sort()
                for name in list(dirs):
                    path = Path(base) / name
                    if path.is_symlink():
                        if self.scoped(path):
                            self.add("unverified", "directory_symlink", path, "Directory symlink was not traversed")
                        dirs.remove(name)
                for name in sorted(files):
                    path = Path(base) / name
                    self.inspect_file(path, required_frontmatter=absolute(path) in self.agents)
        else:
            self.add("fail", "skill_directory", self.skill_dir, "Missing, invalid or out-of-scope Skill directory")
        for path in sorted(self.components):
            self.inspect_file(path, required_frontmatter=path in self.agents)
        self.add("unverified", "runtime_and_semantics", self.skill_dir,
                 "Host loading, model resolution, behavior, permissions and semantic correctness are not tested")
        counts = {status: sum(item["status"] == status for item in self.results)
                  for status in ("pass", "fail", "unverified")}
        status = "fail" if counts["fail"] else "unverified" if counts["unverified"] else "pass"
        return {
            "status": status,
            "counts": counts,
            "scope": {
                "skill_directory": str(self.skill_dir),
                "component_files": sorted(str(p) for p in self.components),
                "agent_files": sorted(str(p) for p in self.agents),
                "approved_roots": sorted(str(p) for p in self.roots),
                "network": False,
                "writes": False,
                "yaml_parser": False,
            },
            "checks": self.results,
        }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skill-dir", type=Path, required=True, help="Skill directory to inspect recursively")
    parser.add_argument("--component", type=Path, action="append", default=[], help="Additional exact file to inspect")
    parser.add_argument("--agent", type=Path, action="append", default=[], help="Exact agent file requiring frontmatter")
    parser.add_argument("--allow-root", type=Path, action="append", default=[], help="Additional explicitly approved reference root")
    args = parser.parse_args()
    report = Inspector(args.skill_dir, args.component, args.agent, args.allow_root).run()
    print(json.dumps(report, ensure_ascii=True, indent=2))
    return {"pass": 0, "fail": 1, "unverified": 2}[report["status"]]


if __name__ == "__main__":
    sys.exit(main())
