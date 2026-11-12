# PrintLab Studio

A Python-first, browser-based 3D modelling starter project for GitHub Codespaces.
Create parametric models with CadQuery and export STL files for 3D printing.

## 1. Create the Codespace

1. Create a GitHub repository named `printlab-studio`.
2. Upload/push this project to the repository.
3. Open the repository on GitHub.
4. Select **Code → Codespaces → Create codespace on main**.
5. Wait for the dev container to finish installing the Python dependencies.

The dev container uses Python 3.11 and installs CadQuery from PyPI.

## 2. Generate your first STL

Open the Codespaces terminal and run:

```bash
python -m models.jewelry_tray
```

This generates:

- `output/jewelry_tray.stl` — for your slicer
- `output/jewelry_tray.step` — editable CAD exchange format

Other starter models:

```bash
python -m models.keychain
python -m models.cute_figurine
```

## 3. Customise a model

Open the relevant file under `models/`.

For example, in `models/jewelry_tray.py`, change:

```python
LENGTH = 120.0
WIDTH = 80.0
HEIGHT = 15.0
WALL = 2.5
FLOOR = 3.0
```

Save the file and rerun the command. The output files are regenerated.

**Units:** All model dimensions are in millimetres.

## 4. Run geometry checks

```bash
pytest -q
```

The tests check that each starter model is non-empty, valid and has positive volume.
These checks are a useful first filter, not a guarantee that every mesh will print successfully.

## 5. Download your STL

In the Codespaces Explorer, open the `output` folder. Right-click the `.stl` file and choose **Download**. Import it into your printer's slicer.

You can also download files from the terminal using the Codespaces file explorer.

## 6. Printing checklist

Before printing, inspect the STL in your slicer:

- Confirm the dimensions and units.
- Check for mesh errors and non-manifold edges.
- Check wall and floor thickness against your nozzle and material.
- Check overhangs, supports, bed adhesion and orientation.
- Preview every layer before sending the job to the printer.

A valid CAD solid is not automatically a successful print.

## Project layout

```text
.devcontainer/   Codespaces environment configuration
printlab/        Shared export and validation helpers
models/          One Python file per model
output/          Generated STL and STEP files
tests/           Basic geometry tests
```

## Current scope and limitations

- CadQuery is best suited to precise, parametric, mostly solid geometry.
- The tray and keychain are functional starter models.
- The figurine is intentionally primitive and geometric. Detailed faces, hands, clothing folds, jewellery and complex deity sculptures require a more advanced mesh/sculpting workflow.
- Generated manufacturing files are ignored by Git by default to keep the repository small. Download or separately back up models you want to keep.

## References

- [CadQuery documentation](https://cadquery.readthedocs.io/)
- [CadQuery installation](https://cadquery.readthedocs.io/en/latest/installation.html)
- [GitHub Codespaces Python setup](https://docs.github.com/en/codespaces/setting-up-your-project-for-codespaces/setting-up-your-python-project-for-codespaces)
