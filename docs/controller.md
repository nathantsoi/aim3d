# Controller & Firmware Documentation

The aim3d Controller stack is specifically designed to leverage the NVIDIA Jetson Orin Nano. It relies on the Sensor Processing Engine (SPE) — an isolated ARM Cortex-R5 core — to guarantee hard real-time execution of step generation and safety interrupts (E-Stop).

## Architecture

1.  **Python Host Daemon**: Runs in user-space on the Jetson's main Linux OS (Ubuntu 24.04 / JetPack 7.2). It receives the Visual IR job from the frontend over the network, buffers it, and streams waypoints down to the SPE via an Inter-VM Communication (IVC) mailbox.
2.  **SPE Firmware (C)**: A bare-metal application running on the Cortex-R5. It polls the IVC mailbox for new position commands, runs a Bresenham/DDA algorithm to generate physical step/dir pulses on the GPIO pins, and handles instantaneous hardware E-Stops.
3.  **IVC Mailbox / Shared Memory**: The bridge between the non-real-time Linux host and the real-time SPE.

## Implementation Gaps & Limitations

Currently, the controller implementation has the following limitations:

1.  **Max Step Rate**: The maximum step frequency is strictly bound by the Cortex-R5 hardware timer resolution and the efficiency of the GPIO toggling loop. Very high micro-stepping on fast machines may exceed the processing loop capacity.
2.  **No Advanced Look-ahead**: The SPE firmware expects pre-calculated, dense waypoints from the Host. It does not perform S-curve acceleration blending or advanced jerk look-ahead on its own.
3.  **Closed-loop Feedback**: The system operates strictly open-loop (sending pulses to stepper drivers). It does not currently read encoder feedback to verify actual position or detect missed steps.
4.  **E-Stop Latency**: While the SPE handles the E-Stop interrupt immediately (stopping pulses), there is a non-zero latency propagating that state back up to the Host Linux daemon and eventually the UI over the network. Always trust the physical E-Stop switch over the software UI.
