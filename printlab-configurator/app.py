from pathlib import Path
from flask import Flask, jsonify, render_template, request, send_file
import cadquery as cq
import math
import xml.etree.ElementTree as ET
from svgpathtools import parse_path

BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

app = Flask(__name__)


def point_inside_polygon(point, polygon):
    """Return True when a point lies inside a polygon."""
    x, y = point
    inside = False

    j = len(polygon) - 1

    for i in range(len(polygon)):
        xi, yi = polygon[i]
        xj, yj = polygon[j]

        intersects = (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (
            (yj - yi) or 1e-12
        ) + xi

        if intersects:
            inside = not inside

        j = i

    return inside


def polygon_area(points):
    """Calculate absolute polygon area."""
    area = 0

    for i in range(len(points)):
        x1, y1 = points[i]
        x2, y2 = points[(i + 1) % len(points)]
        area += x1 * y2 - x2 * y1

    return abs(area) / 2


def sample_svg_path(path_data):
    """Convert an SVG path into closed polygon contours."""
    parsed = parse_path(path_data)
    contours = []

    for subpath in parsed.continuous_subpaths():
        if not subpath:
            continue

        start = subpath[0].start
        end = subpath[-1].end

        if abs(start - end) > 0.01:
            raise ValueError(
                "SVG contains an open path. Please use closed, filled shapes."
            )

        points = []

        for segment in subpath:
            segment_length = segment.length(error=0.001)
            steps = max(2, min(200, math.ceil(segment_length / 0.5)))

            for step in range(steps):
                point = segment.point(step / steps)
                points.append((point.real, point.imag))

        if len(points) >= 3:
            contours.append(points)

    return contours


def make_logo_cutter(p):
    """Create a CadQuery solid that cuts the uploaded SVG logo."""

    svg_text = str(p.get("logo_svg", "")).strip()

    if not svg_text:
        return None

    if len(svg_text.encode("utf-8")) > 1024 * 1024:
        raise ValueError("SVG file must be smaller than 1 MB.")

    logo_width = float(p.get("logo_width", 25))
    logo_x = float(p.get("logo_x", 0))
    logo_y = float(p.get("logo_y", 0))
    logo_rotation = float(p.get("logo_rotation", 0))
    logo_depth = float(p.get("logo_depth", 0.6))

    if not (5 <= logo_width <= 60):
        raise ValueError("Logo width must be between 5 and 60 mm.")

    if not (-100 <= logo_x <= 100 and -100 <= logo_y <= 100):
        raise ValueError("Logo position is outside the supported range.")

    if not (0 <= logo_rotation <= 360):
        raise ValueError("Logo rotation must be between 0 and 360 degrees.")

    if not (0.2 <= logo_depth <= 1.5):
        raise ValueError("Logo engraving depth must be between 0.2 and 1.5 mm.")

    # Parse and validate SVG XML.
    try:
        root = ET.fromstring(svg_text)
    except ET.ParseError as exc:
        raise ValueError("The uploaded SVG is not valid XML.") from exc

    allowed_elements = {"svg", "g", "path", "title", "desc"}

    path_elements = []

    for element in root.iter():
        tag = element.tag.split("}")[-1]

        if tag not in allowed_elements:
            raise ValueError(
                f"Unsupported SVG element: {tag}. Please upload a path-based SVG."
            )

        if element.attrib.get("transform"):
            raise ValueError(
                "This SVG uses transforms. Please export it with transforms "
                "applied to the paths (flattened)."
            )

        if tag == "path":
            path_elements.append(element)

    view_box = root.attrib.get("viewBox")

    if not view_box:
        raise ValueError("SVG must contain a viewBox attribute.")

    try:
        view_box_values = [float(value) for value in view_box.replace(",", " ").split()]
    except ValueError as exc:
        raise ValueError("SVG viewBox is invalid.") from exc

    if len(view_box_values) != 4 or view_box_values[2] <= 0 or view_box_values[3] <= 0:
        raise ValueError("SVG viewBox dimensions are invalid.")

    if not path_elements:
        raise ValueError("No SVG path elements were found.")

    contours = []

    for element in path_elements:
        path_data = element.attrib.get("d", "").strip()

        if not path_data:
            continue

        fill = element.attrib.get("fill", "").strip().lower()
        style = element.attrib.get("style", "").replace(" ", "").lower()

        if fill == "none" or "fill:none" in style:
            continue

        if "url(" in style or "url(" in fill:
            raise ValueError("SVG gradients and external fills are not supported.")

        contours.extend(sample_svg_path(path_data))

    if not contours:
        raise ValueError("No closed, filled SVG paths were found.")

    # Find the complete logo bounding box.
    all_points = [point for contour in contours for point in contour]

    min_x = min(point[0] for point in all_points)
    max_x = max(point[0] for point in all_points)
    min_y = min(point[1] for point in all_points)
    max_y = max(point[1] for point in all_points)

    original_width = max_x - min_x

    if original_width <= 0:
        raise ValueError("SVG logo has invalid dimensions.")

    center_x = (min_x + max_x) / 2
    center_y = (min_y + max_y) / 2

    scale = logo_width / original_width

    angle = math.radians(logo_rotation)
    cos_a = math.cos(angle)
    sin_a = math.sin(angle)

    # Match the frontend preview:
    # center the SVG, invert its Y direction, scale uniformly,
    # rotate around its center, and position it on the tray.
    transformed_contours = []

    for contour in contours:
        transformed = []

        for x, y in contour:
            local_x = (x - center_x) * scale
            local_y = -(y - center_y) * scale

            rotated_x = local_x * cos_a - local_y * sin_a
            rotated_y = local_x * sin_a + local_y * cos_a

            transformed.append((rotated_x + logo_x, rotated_y + logo_y))

        transformed_contours.append(transformed)

    # Determine which contours are holes and which are filled islands.
    areas = [polygon_area(contour) for contour in transformed_contours]

    parents = [None] * len(transformed_contours)

    for i, contour in enumerate(transformed_contours):
        possible_parents = []

        for j, other in enumerate(transformed_contours):
            if i == j or areas[j] <= areas[i]:
                continue

            if point_inside_polygon(contour[0], other):
                possible_parents.append(j)

        if possible_parents:
            parents[i] = min(possible_parents, key=lambda index: areas[index])

    depths = [None] * len(transformed_contours)

    def get_depth(index):
        if depths[index] is not None:
            return depths[index]

        parent = parents[index]

        if parent is None:
            depths[index] = 0
        else:
            depths[index] = get_depth(parent) + 1

        return depths[index]

    for i in range(len(transformed_contours)):
        get_depth(i)

    # Create solid cutters. Even-depth contours are filled;
    # their immediate odd-depth children become holes.
    cutter_solids = []

    cut_start_z = float(p.get("base", 3)) - logo_depth
    cut_height = logo_depth + 0.1

    for i, contour in enumerate(transformed_contours):
        if depths[i] % 2 != 0:
            continue

        outer_points = [cq.Vector(x, y, cut_start_z) for x, y in contour]

        outer_wire = cq.Wire.makePolygon(outer_points, close=True)

        hole_wires = []

        for j, hole in enumerate(transformed_contours):
            if parents[j] == i and depths[j] == depths[i] + 1:
                hole_points = [cq.Vector(x, y, cut_start_z) for x, y in hole]

                hole_wires.append(cq.Wire.makePolygon(hole_points, close=True))

        solid = cq.Solid.extrudeLinear(
            outer_wire, hole_wires, cq.Vector(0, 0, cut_height)
        )

        cutter_solids.append(solid)

    if not cutter_solids:
        raise ValueError("Could not create engraving geometry from this SVG.")

    cutter = cq.Workplane("XY").newObject(cutter_solids)

    return cutter


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

    # =========================================================
    # LOGO ENGRAVING: SVG converted into actual 3D geometry
    # =========================================================
    logo_cutter = make_logo_cutter(p)

    if logo_cutter is not None:
        logo_depth = float(p.get("logo_depth", 0.6))

        if logo_depth > base - 0.4:
            raise ValueError("Logo engraving depth must leave at least 0.4 mm of base.")

        tray = tray.cut(logo_cutter)

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
