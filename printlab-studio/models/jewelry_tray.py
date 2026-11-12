"""
Parametric open-top jewellery tray.
Edit the parameters below, then run:
    python -m models.jewelry_tray
All dimensions are millimetres.
"""

import cadquery as cq
from printlab.exporter import export_model

LENGTH = 120.0
WIDTH = 80.0
HEIGHT = 15.0
WALL = 2.5
FLOOR = 3.0


def build() -> cq.Workplane:
    if min(LENGTH, WIDTH, HEIGHT, WALL, FLOOR) <= 0:
        raise ValueError("All dimensions must be positive")
    if 2 * WALL >= min(LENGTH, WIDTH):
        raise ValueError("Walls are too thick for the tray dimensions")
    if FLOOR >= HEIGHT:
        raise ValueError("Floor thickness must be less than tray height")

    outer = cq.Workplane("XY").box(LENGTH, WIDTH, HEIGHT, centered=(True, True, False))
    cavity = (
        cq.Workplane("XY")
        .box(
            LENGTH - 2 * WALL,
            WIDTH - 2 * WALL,
            HEIGHT,
            centered=(True, True, False),
        )
        .translate((0, 0, FLOOR))
    )
    return outer.cut(cavity)


if __name__ == "__main__":
    export_model(build(), "jewelry_tray")
