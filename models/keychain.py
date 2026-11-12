"""
Rounded rectangular keychain tag with a through-hole.
Edit the parameters below, then run:
    python -m models.keychain
All dimensions are millimetres.
"""
import cadquery as cq
from printlab.exporter import export_model

LENGTH = 55.0
WIDTH = 25.0
THICKNESS = 4.0
CORNER_RADIUS = 4.0
HOLE_DIAMETER = 5.0
HOLE_FROM_LEFT = 7.0


def build() -> cq.Workplane:
    if min(LENGTH, WIDTH, THICKNESS, HOLE_DIAMETER) <= 0:
        raise ValueError("Dimensions must be positive")
    if 2 * CORNER_RADIUS >= min(LENGTH, WIDTH):
        raise ValueError("Corner radius is too large")
    if HOLE_DIAMETER >= WIDTH - 2 * CORNER_RADIUS:
        raise ValueError("Hole is too large for the tag width")
    if HOLE_FROM_LEFT <= HOLE_DIAMETER / 2 or HOLE_FROM_LEFT >= LENGTH:
        raise ValueError("Hole position is outside the safe tag area")

    tag = (
        cq.Workplane("XY")
        .rect(LENGTH, WIDTH)
        .extrude(THICKNESS)
        .edges("|Z")
        .fillet(CORNER_RADIUS)
    )

    # Rectangle is centred at the origin; place the hole near the left end.
    hole_x = -LENGTH / 2 + HOLE_FROM_LEFT
    cutter = (
        cq.Workplane("XY")
        .center(hole_x, 0)
        .circle(HOLE_DIAMETER / 2)
        .extrude(THICKNESS)
    )
    return tag.cut(cutter)


if __name__ == "__main__":
    export_model(build(), "keychain_tag")
