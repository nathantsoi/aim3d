# aim3d User Guide & End-to-End Workflow

This guide walks you through the end-to-end process of designing a part, generating toolpaths, validating with the simulator, and executing the job on your CNC machine.

## 1. Navigating the UI

When you run `make run`, the Tauri desktop application will launch. The interface is divided into:
*   **Top Navbar**: Global controls (File, Export, Controller Connection).
*   **Left Panel (Feature Tree)**: Your CAD features (Sketches, Extrusions, Hole operations) and CAM operations (Toolpaths).
*   **Center Viewport**: A highly optimized WebGPU rendering of your part, stock material, and toolpath simulations.
*   **Right Panel (Properties)**: Context-sensitive settings for whatever is selected in the Left Panel.

## 2. Creating a 3D Design (CAD)

1.  Click **New Sketch** in the Feature Tree.
2.  Use the 2D drawing tools (Line, Rectangle, Circle) in the Viewport to draw your profile.
3.  Add constraints (Distance, Horizontal, Vertical) in the Properties Panel to fully define your sketch.
4.  Exit the sketch and click **Extrude**. Select your sketch profile and specify the depth to generate a 3D solid model.

## 3. Generating Toolpaths (CAM)

1.  Switch to the **CAM Workspace** via the top-left dropdown.
2.  Define your **Stock Material** dimensions in the Properties panel.
3.  Add a **New Setup** and define your Work Coordinate System (WCS) origin.
4.  Add a **2D Contour** or **Pocket** operation.
5.  Select the tool from your Tool Library and pick the edges/faces of your 3D model to machine.
6.  The system automatically compiles this into our internal **Visual IR** (Intermediate Representation) and generates the corresponding step/dir paths.

## 4. Validating via Simulation

Before running on hardware, you should validate the toolpaths:
1.  Click the **Simulate** button in the CAM toolbar.
2.  The Viewport will switch to Simulation Mode, displaying the stock material.
3.  Use the playback controls to step through the toolpath. The C++ Lightweight Simulator will subtract material in real-time.
4.  Visually inspect for gouges, rapid collisions, or uncut material.

## 5. Executing on the Controller

Once satisfied:
1.  Ensure your Jetson Orin Nano is connected to the network and the `aim3d` daemon is running.
2.  Click **Connect** in the Top Navbar and enter the Jetson's IP address.
3.  Click **Export & Run**. You can choose to export standard G-code, or our optimized Visual IR format.
4.  The application will push the job to the daemon, which sends waypoints to the Jetson SPE firmware.
5.  **Safety First**: Keep your hand on the physical E-Stop button while the machine is running!
