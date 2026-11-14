# PrintLab Studio — Visual Tray Configurator

A browser-based parametric jewellery tray configurator. Python + CadQuery generates the actual STL; Three.js provides the interactive preview.

## Run in GitHub Codespaces

1. Install Linux libraries if they are not already present:

   ```bash
   sudo apt-get update
   sudo apt-get install -y libgl1 libglib2.0-0
   ```

2. Install Python dependencies:

   ```bash
   pip install -r requirements.txt
   ```

3. Start the app:

   ```bash
   python app.py
   ```

4. Open the **Ports** tab and open forwarded port **8000** in your browser.

5. Change the controls, then click **Generate printable STL**. Download the STL when generation succeeds.

## Notes

- All dimensions are millimetres.
- The live preview is an approximate Three.js representation. After generating, the viewer loads the actual exported STL.
- Validate the STL in your slicer before printing. Check dimensions, wall/base thickness, mesh integrity and printer tolerances.
- The first version configures rectangular trays with evenly spaced dividers.


## Brand engraving

The configurator supports optional recessed brand text on the inside floor:
- Enter up to 24 basic English characters.
- Set letter height and engraving depth.
- Generate the STL to apply the engraving to the actual CAD solid.
- Keep at least 0.4 mm of material below the engraving; the app validates this.
- For a visible result, use a sufficiently large font and inspect the generated STL in your slicer.


## Viewer interaction and layout fixes

- The CAD model is converted from CadQuery Z-up to Three.js Y-up, so it rests flat on the ground grid.
- Left mouse drag orbits; right mouse drag pans; middle drag / wheel zooms.
- The left settings panel has its own scrollbar on desktop.
- The 3D workspace stays visible in the initial viewport.
