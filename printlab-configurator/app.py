from pathlib import Path
from flask import Flask, jsonify, render_template, request, send_file
import cadquery as cq
import math

BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

app = Flask(__name__)


def make_tray(p):
    # Existing parameters
    length = float(p.get("length", 120))
    width = float(p.get("width", 80))
    height = float(p.get("height", 15))
    wall = float(p.get("wall", 2.5))
    base = float(p.get("base", 3))
    radius = float(p.get("radius", 6))
    columns = int(p.get("columns", 3))
    rows = int(p.get("rows", 2))
    divider = float(p.get("divider", 2))

    # New shape parameters
    tray_shape = str(p.get("trayShape", "rectangle")).lower()
    diameter = float(p.get("diameter", 120))

    # Existing engraving parameters
    brand_text = str(p.get("brand_text", "")).strip()[:24]
    engraving_depth = float(p.get("engraving_depth", 0.6))
    engraving_size = float(p.get("engraving_size", 5))
    engraving_x = float(p.get("engraving_x", 0))
    engraving_y = float(p.get("engraving_y", 0))
    engraving_rotation = float(p.get("engravingRotation", 0))

    # Validate selected shape
    if tray_shape not in ("rectangle", "circle", "bubble"):
        raise ValueError("Invalid tray shape selected.")

    # Common dimensional checks
    if not (8 <= height <= 60 and 1.2 <= wall <= 8 and 1.2 <= base <= height - 2):
        raise ValueError("Check height, wall and base thickness values.")

    if not (0.2 <= engraving_depth <= min(1.5, base - 0.4)):
        raise ValueError(
            "Engraving depth must be 0.2 mm or greater and leave at least 0.4 mm of base."
        )

    if not (2 <= engraving_size <= 12):
        raise ValueError("Engraving size must be between 2 and 12 mm.")

    if any(ord(ch) > 127 for ch in brand_text):
        raise ValueError(
            "For this first version, use English letters, numbers and basic punctuation."
        )

    if not (0 <= engraving_rotation <= 360):
        raise ValueError("Text rotation must be between 0 and 360 degrees.")

    # =========================================================
    # RECTANGLE: Original working geometry preserved
    # =========================================================
    if tray_shape == "rectangle":

        if not (40 <= length <= 250 and 40 <= width <= 200):
            raise ValueError("Length must be 40–250 mm and width 40–200 mm.")

        if not (0 <= radius <= min(length, width) / 2 - wall):
            raise ValueError("Corner radius is too large.")

        if not (1 <= columns <= 6 and 1 <= rows <= 6):
            raise ValueError("Rows and columns must be between 1 and 6.")

        if not (1 <= divider <= 6):
            raise ValueError("Divider thickness must be 1–6 mm.")

        if columns > 1 and divider >= (length - 2 * wall) / columns:
            raise ValueError("Divider is too thick for the selected number of columns.")

        if rows > 1 and divider >= (width - 2 * wall) / rows:
            raise ValueError("Divider is too thick for the selected number of rows.")

        outer = (
            cq.Workplane("XY")
            .box(length, width, height, centered=(True, True, False))
            .edges("|Z")
            .fillet(radius)
        )

        inner_l = length - 2 * wall
        inner_w = width - 2 * wall
        inner_r = max(0.1, radius - wall)
        cavity_h = height - base + 0.05

        cavity = (
            cq.Workplane("XY")
            .box(inner_l, inner_w, cavity_h, centered=(True, True, False))
            .edges("|Z")
            .fillet(inner_r)
            .translate((0, 0, base))
        )

        tray = outer.cut(cavity)

        # Original dividers
        divider_h = height - base

        if columns > 1:
            for i in range(1, columns):
                x = -inner_l / 2 + i * inner_l / columns

                part = (
                    cq.Workplane("XY")
                    .box(divider, inner_w, divider_h, centered=(True, True, False))
                    .translate((x, 0, base))
                )

                tray = tray.union(part)

        if rows > 1:
            for i in range(1, rows):
                y = -inner_w / 2 + i * inner_w / rows

                part = (
                    cq.Workplane("XY")
                    .box(inner_l, divider, divider_h, centered=(True, True, False))
                    .translate((0, y, base))
                )

                tray = tray.union(part)

    # =========================================================
    # CIRCLE: Circular dish with continuous raised wall
    # =========================================================
    elif tray_shape == "circle":

        if not (40 <= diameter <= 250):
            raise ValueError("Diameter must be between 40 and 250 mm.")

        outer_radius = diameter / 2
        inner_radius = outer_radius - wall

        outer = cq.Workplane("XY").circle(outer_radius).extrude(height)

        cavity = (
            cq.Workplane("XY")
            .circle(inner_radius)
            .extrude(height - base + 0.05)
            .translate((0, 0, base))
        )

        tray = outer.cut(cavity)

    # =========================================================
    # BUBBLE: Circular base with individual spherical beads
    # No continuous wall and no compartments
    # =========================================================
    elif tray_shape == "bubble":

        if not (40 <= diameter <= 250):
            raise ValueError("Diameter must be between 40 and 250 mm.")

        outer_radius = diameter / 2

        # Keep these calculations identical to the JS preview.
        bead_radius = min(6, max(1.5, (height - base) / 1.85))

        bead_ring_radius = outer_radius - bead_radius
        base_radius = outer_radius - bead_radius * 1.4

        if base_radius <= 0:
            raise ValueError("Diameter is too small for the selected bubble design.")

        # Flat circular base only
        tray = cq.Workplane("XY").circle(base_radius).extrude(base)

        # Same bead count as the live preview
        bead_count = max(
            20, round((2 * math.pi * bead_ring_radius) / (bead_radius * 1.75))
        )

        # Same vertical positioning as the live preview
        bead_center_z = base + bead_radius * 0.85

        # Add and fuse individual spherical beads to the base
        for i in range(bead_count):
            angle = (2 * math.pi * i) / bead_count

            x = bead_ring_radius * math.cos(angle)
            y = bead_ring_radius * math.sin(angle)

            bead = (
                cq.Workplane("XY").sphere(bead_radius).translate((x, y, bead_center_z))
            )

            tray = tray.union(bead)

        tray = tray.clean()

    # =========================================================
    # ENGRAVING: Shared by all three shapes
    # =========================================================
    if brand_text:
        text_cutter = (
            cq.Workplane("XY")
            .text(
                brand_text,
                engraving_size,
                engraving_depth + 0.2,
                font="Arial",
                kind="regular",
                halign="center",
                valign="center",
                combine=True,
            )
            .rotate((0, 0, 0), (0, 0, 1), engraving_rotation)
            .translate((engraving_x, engraving_y, base - engraving_depth))
        )

        tray = tray.cut(text_cutter)

    return tray.clean()


@app.get("/")
def index():
    return render_template("index.html")


@app.post("/api/generate")
def generate():
    try:
        params = request.get_json(force=True)
        model = make_tray(params)

        stl_path = OUTPUT_DIR / "custom_tray.stl"

        cq.exporters.export(
            model, str(stl_path), exportType="STL", tolerance=0.08, angularTolerance=0.1
        )

        return jsonify({"ok": True, "download": "/download/custom_tray.stl"})

    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400


@app.get("/download/<filename>")
def download(filename):
    if filename != "custom_tray.stl":
        return "Not found", 404

    path = OUTPUT_DIR / filename

    if not path.exists():
        return "Generate a model first.", 404

    return send_file(path, as_attachment=True, download_name=filename)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
