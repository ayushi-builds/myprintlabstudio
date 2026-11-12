from pathlib import Path
import cadquery as cq


PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = PROJECT_ROOT / "output"


def export_model(model: cq.Workplane, name: str) -> tuple[Path, Path]:
    """
    Validate a CadQuery model and export binary STL plus STEP files.
    All model dimensions in this project are in millimetres.
    """
    if not name or any(ch not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_" for ch in name):
        raise ValueError("name must contain only letters, numbers, hyphens or underscores")

    shape = model.val()
    if shape.isNull():
        raise ValueError(f"{name}: model is empty")
    if not shape.isValid():
        raise ValueError(f"{name}: model is not a valid solid/shape")
    if shape.Volume() <= 0:
        raise ValueError(f"{name}: model has no positive volume")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    stl_path = OUTPUT_DIR / f"{name}.stl"
    step_path = OUTPUT_DIR / f"{name}.step"

    # A smaller linear tolerance generally gives a finer STL mesh.
    shape.exportStl(
        str(stl_path),
        tolerance=0.08,
        angularTolerance=0.12,
        ascii=False,
    )
    cq.exporters.export(model, str(step_path), exportType="STEP")

    print(f"Model: {name}")
    print(f"Volume: {shape.Volume():.2f} mm³")
    print(f"STL:   {stl_path.relative_to(PROJECT_ROOT)}")
    print(f"STEP:  {step_path.relative_to(PROJECT_ROOT)}")
    return stl_path, step_path
