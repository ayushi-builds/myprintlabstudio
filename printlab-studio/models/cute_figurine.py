"""
A simple, stylised geometric buddy figurine.
This is a beginner-friendly primitive model, NOT a detailed deity sculpt.
Edit the dimensions and proportions, then run:
    python -m models.cute_figurine
All dimensions are millimetres.
"""
import cadquery as cq
from printlab.exporter import export_model

BASE_RADIUS = 17.0
BASE_HEIGHT = 5.0
BODY_RADIUS = 13.0
BODY_HEIGHT = 25.0
HEAD_RADIUS = 14.0
EAR_RADIUS = 6.0
CROWN_HEIGHT = 12.0


def build() -> cq.Workplane:
    if min(
        BASE_RADIUS, BASE_HEIGHT, BODY_RADIUS, BODY_HEIGHT,
        HEAD_RADIUS, EAR_RADIUS, CROWN_HEIGHT
    ) <= 0:
        raise ValueError("All dimensions must be positive")

    base = cq.Workplane("XY").cylinder(
        BASE_HEIGHT, BASE_RADIUS, centered=(True, True, False)
    )

    body_z = BASE_HEIGHT
    body = (
        cq.Workplane("XY")
        .cylinder(BODY_HEIGHT, BODY_RADIUS, centered=(True, True, False))
        .translate((0, 0, body_z))
    )

    head_z = BASE_HEIGHT + BODY_HEIGHT + HEAD_RADIUS * 0.45
    head = (
        cq.Workplane("XY")
        .sphere(HEAD_RADIUS)
        .translate((0, 0, head_z))
    )

    ear_x = HEAD_RADIUS * 0.88
    ears = (
        cq.Workplane("XY")
        .sphere(EAR_RADIUS)
        .translate((-ear_x, 0, head_z))
        .union(
            cq.Workplane("XY")
            .sphere(EAR_RADIUS)
            .translate((ear_x, 0, head_z))
        )
    )

    crown = (
        cq.Workplane("XY")
        .cone(CROWN_HEIGHT, HEAD_RADIUS * 0.65, 0)
        .translate((0, 0, head_z + HEAD_RADIUS * 0.72))
    )

    # Union overlapping solids into one printable body.
    figure = base.union(body).union(head).union(ears).union(crown)
    return figure


if __name__ == "__main__":
    export_model(build(), "cute_geometric_figurine")
