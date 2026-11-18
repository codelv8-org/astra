"""สร้างภาพ CrewBots ต้นฉบับและ manifest โดยไม่ใช้ artwork ภายนอก"""

from pathlib import Path
import hashlib
import html
import json

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "crewbots"
VARIANTS = ["full-body", "portrait", "icon", "idle", "working", "thinking", "success", "error"]
ROSTER = [
    ("astra", "ASTRA", "CEO / Orchestrator", "OpenAI Codex", "#4169E1", "#F2C75C"),
    ("forge", "FORGE", "Software Engineering Lead", "Claude Code", "#E98B3A", "#FFE0A3"),
    ("mira", "MIRA", "UI/UX Design Lead", "Antigravity", "#A597E8", "#F6BCD8"),
    ("vector", "VECTOR", "System Architect & Researcher", "OpenAI Codex", "#36B7B0", "#A6F0E8"),
    ("scout", "SCOUT", "Reviewer, QA & UAT Lead", "OpenAI Codex", "#879B4A", "#D5E89B"),
]


def svg(key, name, color, accent, variant):
    compact = variant == "icon"
    head_only = variant in ("portrait", "icon")
    box = "40 22 160 120" if compact else "25 12 190 160" if head_only else "0 0 240 280"
    shapes = {
        "astra": '<rect x="43" y="40" width="154" height="113" rx="49"/>',
        "forge": '<rect x="43" y="40" width="154" height="113" rx="24"/>',
        "mira": '<path d="M43 98Q35 43 89 38Q120 22 151 38Q205 43 197 98Q199 153 120 155Q41 153 43 98Z"/>',
        "vector": '<path d="M79 38H161L201 77V115L161 153H79L39 115V77Z"/>',
        "scout": '<rect x="42" y="48" width="156" height="99" rx="45"/>',
    }
    antenna = {
        "astra": '<path d="M120 41V30"/><path fill="ACC" d="m120 13 5 10 11 2-8 8 2 11-10-5-10 5 2-11-8-8 11-2Z"/>',
        "forge": '<path d="M88 41V27h24"/><rect x="108" y="22" width="15" height="10" rx="3" fill="ACC"/>',
        "mira": '<path d="m143 40 12-23 6 3-8 25Z" fill="ACC"/><path d="m155 17 7-7 0 10"/>',
        "vector": '<path d="M120 38V25"/><path d="m120 13 10 6v12l-10 6-10-6V19Z" fill="ACC"/>',
        "scout": '<path d="M153 49V33l12-5"/><circle cx="169" cy="27" r="6" fill="ACC"/>',
    }[key].replace("ACC", accent)
    if compact:
        antenna = ""
    eyes = '<path d="M83 94h13m48 0h13"/>'
    mouth = '<path d="M110 117q10 7 20 0"/>'
    if key == "astra":
        eyes = '<path d="M82 95q7-7 14 0m48 0q7-7 14 0"/>'
    elif key == "forge":
        eyes = '<path d="m81 88 17 5m44 0 17-5M85 99h10m50 0h10"/>'
    elif key == "mira":
        eyes = '<path d="M81 96q8-14 16 0m46 0 15-4"/>'
        mouth = '<path d="M109 115q11 15 22 0Z"/>'
    elif key == "vector":
        eyes = '<path d="m89 85 10 10-10 10-10-10Zm62 0 10 10-10 10-10-10Z"/>'
        mouth = '<path d="M112 118h16"/>'
    if variant == "thinking":
        eyes = '<path d="M82 91h16m45-5 16 7"/>'
        mouth = '<path d="M112 119q8-5 16 0"/>'
    elif variant == "working":
        eyes = '<path d="m81 90 17 4m44 0 17-4M85 100h10m50 0h10"/>'
        mouth = '<path d="M111 118h18"/>'
    elif variant == "success":
        eyes = '<path d="M81 97q8-15 16 0m46 0q8-15 16 0"/>'
        mouth = '<path d="M107 115q13 16 26 0"/>'
    elif variant == "error":
        eyes = '<path d="m81 92 17-6m44 0 17 6M85 101h9m52 0h9"/>'
        mouth = '<path d="M110 122q10-10 20 0"/>'
    if key == "scout":
        lens = '<circle cx="91" cy="96" r="23" fill="#24435A" stroke="' + accent + '" stroke-width="6"/><circle cx="91" cy="96" r="12" fill="#BCE8EE" stroke="none"/><circle cx="95" cy="91" r="4" fill="white" stroke="none"/>'
        eyes = lens + '<path d="M145 96h12"/>'
        if variant == "success":
            eyes = lens + '<path d="M142 98q8-13 16 0"/>'
        elif variant in ("thinking", "error", "working"):
            eyes = lens + '<path d="m142 92 16 6"/>'
    body_shape = {
        "astra": '<rect x="81" y="158" width="78" height="76" rx="29"/>',
        "forge": '<rect x="79" y="158" width="82" height="76" rx="16"/>',
        "mira": '<path d="M91 158h58q22 31 15 64-44 21-88 0-7-33 15-64Z"/>',
        "vector": '<path d="M95 158h50l19 26-8 46H84l-8-46Z"/>',
        "scout": '<rect x="82" y="162" width="76" height="65" rx="25"/>',
    }[key]
    chest = {
        "astra": '<ellipse cx="120" cy="194" rx="23" ry="11" fill="none"/><circle cx="120" cy="194" r="7"/>',
        "forge": '<rect x="94" y="175" width="52" height="32" rx="6" fill="#152B42"/><path d="m102 184 6 6-6 6m14 1h13" fill="none" stroke="#FFE0A3" stroke-width="3"/>',
        "mira": '<path d="M103 182q17-15 34 0v23q-17 15-34 0Z"/><circle cx="118" cy="190" r="4" fill="#A597E8" stroke="none"/>',
        "vector": '<path d="m120 178 19 10v19l-19 10-19-10v-19Zm0 20 19-10m-19 10-19-10m19 10v19" fill="none"/>',
        "scout": '<circle cx="120" cy="191" r="18"/><path d="M120 179v24m-12-12h24" stroke="#879B4A"/>',
    }[key]
    body = "" if head_only else f'''<g fill="url(#shell)">{body_shape}
      <path d="M79 173q-20-6-22 22v15h16v-17l11-5M161 173q20-6 22 22v15h-16v-17l-11-5"/>
      <rect x="84" y="229" width="25" height="27" rx="10"/><rect x="131" y="229" width="25" height="27" rx="10"/>
      <rect x="77" y="250" width="36" height="15" rx="7" fill="{accent}"/><rect x="127" y="250" width="36" height="15" rx="7" fill="{accent}"/>
      <circle cx="65" cy="213" r="10" fill="{accent}"/><circle cx="175" cy="213" r="10" fill="{accent}"/>
      </g><g fill="{accent}" stroke="{accent}" stroke-width="3">{chest}</g>'''
    if key == "forge" and not head_only:
        body += '<path d="M57 215v9m16-9v9m94-9v9m16-9v9" stroke-width="4"/>'
    if key == "vector" and not head_only:
        body += f'<g stroke="{accent}" stroke-width="2" fill="#193B4C"><path d="M180 157h36v37h-36Z"/><path d="M185 184v-19h24v24h-12v-12h12m-24 0h12" fill="none"/></g>'
    glyphs = {
        "idle": '<circle cx="204" cy="225" r="4"/>',
        "working": '<path d="M195 213h18v20h-18Z" fill="none"/><path d="M199 219h10m-10 5h6" fill="none"/><circle class="pulse" cx="204" cy="241" r="3"/>',
        "thinking": '<circle class="pulse" cx="192" cy="221" r="3"/><circle class="pulse" cx="203" cy="216" r="4"/><circle class="pulse" cx="216" cy="210" r="5"/>',
        "success": '<circle cx="204" cy="222" r="15" fill="#173F3B"/><path d="m196 222 6 6 11-13" fill="none" stroke="#B7EBD2"/>',
        "error": '<path d="m204 205 17 29h-34Z" fill="#4B3440"/><path d="M204 215v8m0 5v1" stroke="#FFE0CB"/>',
    }
    glyph = f'<g class="status" fill="{accent}" stroke="{accent}" stroke-width="3">{glyphs[variant]}</g>' if variant in glyphs else ""
    motion = ""
    if variant == "idle":
        motion = ".bot{animation:float 3.2s ease-in-out infinite}@keyframes float{50%{transform:translateY(-2px)}}"
    elif variant in ("working", "thinking"):
        duration = "1.2s" if variant == "working" else "1.8s"
        motion = f".pulse{{animation:pulse {duration} ease-in-out infinite}}@keyframes pulse{{50%{{opacity:.4}}}}"
    elif variant == "success":
        motion = ".status{animation:lift 2.4s ease-in-out infinite}@keyframes lift{50%{transform:translateY(-2px)}}"
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{box}" role="img" aria-labelledby="title desc">
<title id="title">{html.escape(name)} — {variant}</title>
<desc id="desc">หุ่นยนต์ CrewBot ต้นฉบับ สถานะ {variant} พื้นหลังโปร่งใส</desc>
<defs><linearGradient id="shell" x2="0.35" y2="1"><stop stop-color="{accent}"/><stop offset="0.38" stop-color="{color}"/><stop offset="1" stop-color="{color}"/></linearGradient></defs>
<style>{motion}@media(prefers-reduced-motion:reduce){{.bot,.pulse,.status{{animation:none!important}}}}</style>
<g stroke="#24354B" stroke-width="{'5' if compact else '4'}" stroke-linejoin="round" stroke-linecap="round">
<g class="bot">{body}<g fill="{color}">{antenna}</g><g fill="url(#shell)">{shapes[key]}</g>
<rect x="60" y="66" width="120" height="68" rx="{'20' if key != 'forge' else '12'}" fill="#152B42"/>
<g fill="none" stroke="#E5F8FF" stroke-width="{'6' if compact else '4'}">{eyes}{mouth}</g>
</g>{glyph}</g></svg>''', box


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    agents = []
    for key, name, role, runtime, color, accent in ROSTER:
        folder = OUT / key
        folder.mkdir(exist_ok=True)
        assets = {}
        for variant in VARIANTS:
            source, box = svg(key, name, color, accent, variant)
            data = source.encode("utf-8")
            (folder / f"{variant}.svg").write_bytes(data)
            assets[variant] = {"src": f"{key}/{variant}.svg", "format": "svg", "mimeType": "image/svg+xml", "viewBox": box, "sha256": hashlib.sha256(data).hexdigest(), "fallback": None}
        agents.append({"characterKey": key, "name": name, "role": role, "runtimeLabel": runtime, "primary": color, "accent": accent, "assets": assets})
    manifest = {"schemaVersion": 1, "product": "CrewNest", "family": "CrewBots", "generatedBy": "tools/build_crewbots.py", "licenseDocument": "../../docs/ASSET_LICENSES.md", "agents": agents}
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tokens = '\n'.join(f'.crewbot[data-character="{a[0]}"]{{--crewbot-primary:{a[4]};--crewbot-accent:{a[5]}}}' for a in ROSTER)
    (OUT / "crewbots.css").write_text('/* สีอัตลักษณ์ ไม่แทน semantic status tokens ของแอป */\n.crewbot{display:inline-block;object-fit:contain;flex-shrink:0;pointer-events:none}.crewbot--icon{width:32px;height:32px}.crewbot--portrait{width:96px;height:88px}.crewbot--full{width:180px;height:210px;max-width:100%}\n' + tokens + '\n', encoding="utf-8")
    rows = ""
    for agent in agents:
        cells = ''.join(f'<figure><img src="{agent["assets"][v]["src"]}" alt="{agent["name"]} {v}" width="120" height="140"><figcaption>{v}</figcaption></figure>' for v in VARIANTS)
        rows += f'<section><h2>{agent["name"]}</h2><p>{html.escape(agent["role"])} · {agent["runtimeLabel"]}</p><div class="variants">{cells}</div><p>UI icon: <img class="small" src="{agent["assets"]["icon"]["src"]}" alt="" width="24" height="24"> 24px <img class="small" src="{agent["assets"]["icon"]["src"]}" alt="" width="32" height="32"> 32px</p></section>'
    (OUT / "gallery.html").write_text('''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>CrewNest · CrewBots asset review</title><style>
:root{color-scheme:light dark;font-family:system-ui,sans-serif;background:light-dark(#F3F5FA,#0B1020);color:light-dark(#24354B,#F4F7FB)}body{max-width:1360px;margin:auto;padding:24px}h1{margin-bottom:8px}p{line-height:1.5}section{padding:20px;margin:20px 0;border:1px solid #74839966;border-radius:18px;background:light-dark(#fff,#151D2F)}h2{margin:0}.variants{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px}figure{margin:0;text-align:center;padding:12px 0;border-radius:12px;background:repeating-conic-gradient(light-dark(#EDF0F5,#202A40) 0% 25%,transparent 0% 50%) 0/16px 16px}img{object-fit:contain;max-width:100%}figcaption{font-size:12px;padding:4px;background:light-dark(#fff,#151D2F)}.small{vertical-align:middle}@media(max-width:400px){body{padding:12px}section{padding:12px}.variants{grid-template-columns:repeat(2,minmax(0,1fr))}}@media print{figure{break-inside:avoid}}
</style><h1>CrewNest · CrewBots</h1><p>Original SVG character system · 5 agents · 8 variants each. Transparent assets on a review checkerboard. Theme follows the system. Motion follows reduced-motion settings. This is an asset sheet, not the product application.</p>''' + rows + '</html>', encoding="utf-8")
    print(f"Generated {len(agents) * len(VARIANTS)} SVG assets, manifest, CSS and gallery")


if __name__ == "__main__":
    main()
