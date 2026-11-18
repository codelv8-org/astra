"""ตรวจความครบถ้วน ความปลอดภัยพื้นฐาน และความตรงกันของ manifest กับ SVG จริง"""

from pathlib import Path
import hashlib
import json
import xml.etree.ElementTree as ET
import re

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "assets" / "crewbots"
manifest = json.loads((BASE / "manifest.json").read_text(encoding="utf-8"))
expected = {"astra": "OpenAI Codex", "forge": "Claude Code", "mira": "Antigravity", "vector": "OpenAI Codex", "scout": "OpenAI Codex"}
variants = {"full-body", "portrait", "icon", "idle", "working", "thinking", "success", "error"}
assert manifest["schemaVersion"] == 1
assert manifest["product"] == "CrewNest"
assert len(manifest["agents"]) == 5
assert {a["characterKey"] for a in manifest["agents"]} == set(expected)
checked = set()
for agent in manifest["agents"]:
    assert agent["runtimeLabel"] == expected[agent["characterKey"]]
    assert set(agent["assets"]) == variants
    for variant, asset in agent["assets"].items():
        path = (BASE / asset["src"]).resolve()
        assert path.is_relative_to(BASE.resolve())
        data = path.read_bytes()
        assert hashlib.sha256(data).hexdigest() == asset["sha256"]
        root = ET.fromstring(data)
        assert root.tag == "{http://www.w3.org/2000/svg}svg"
        assert root.attrib["viewBox"] == asset["viewBox"]
        ids = [node.attrib["id"] for node in root.iter() if "id" in node.attrib]
        assert len(ids) == len(set(ids))
        text = data.decode("utf-8")
        assert set(re.findall(r"url\(#([^)]+)\)", text)).issubset(ids)
        assert set(root.attrib["aria-labelledby"].split()).issubset(ids)
        assert "prefers-reduced-motion:reduce" in text
        for node in root.iter():
            assert node.tag.rsplit("}", 1)[-1] not in {"script", "foreignObject", "image", "use", "a"}
            assert not any(k.lower().startswith("on") or k.rsplit("}", 1)[-1] == "href" for k in node.attrib)
        assert asset["format"] == "svg" and asset["mimeType"] == "image/svg+xml"
        checked.add(path)
assert checked == {p.resolve() for p in BASE.glob("*/*.svg")}
assert (BASE / manifest["licenseDocument"]).resolve().is_file()
assert len(checked) == 40
print("PASS: 40 SVGs; roster/runtime labels; variants; XML; hashes; local paths; IDs/references; reduced motion; no active/external SVG content")
