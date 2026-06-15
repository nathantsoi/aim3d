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

---

## Setup & Deployment Guide

The `aim3d` controller environment consists of a Python Host Daemon running on the local PC/Jetson and a microcontroller firmware running on the STM32 target.

### 1. Python Host Daemon Installation
The host daemon handles visual IR parsing, trajectory planning, and coordinates serial packet exchange with the STM32.

1. Install Python prerequisites inside the virtual environment:
   ```bash
   pip install pyserial
   ```
2. Start the daemon and specify the serial interface parameters:
   ```bash
   python python/aim3d/daemon.py --port /dev/ttyUSB0 --baud 115200
   ```
   *(Replace `/dev/ttyUSB0` with your serial device port, e.g. `/dev/cu.usbserial-xxx` on macOS or `COM3` on Windows)*

### 2. STM32 Firmware Installation
The STM32 firmware acts as the step execution driver, generating step pulses and monitoring safety signals in real-time.

1. **Install Prerequisites**:
   Ensure you have the Arm toolchain and serial flashing tool:
   - GCC compiler: `arm-none-eabi-gcc`
   - Flashing utility: `stm32flash`
2. **Build the Firmware**:
   ```bash
   cd mcu/stm32
   make
   ```
   This generates `build/firmware.bin` and `build/firmware.elf`.
3. **Pin Configuration**:
   - **X Axis**: STEP = `PB12`, DIR = `PB13`
   - **Y Axis**: STEP = `PB14`, DIR = `PB15`
   - **Z Axis**: STEP = `PA8`, DIR = `PA9`
   - **Serial USART1**: TX = `PA9`, RX = `PA10` (connect to USB-to-UART adapter RX/TX crosswise)
   - **E-Stop**: `PA0` (pulls low to trigger fault)
   - **Limit Switches**: `PA1` (X), `PA2` (Y), `PA3` (Z) (pulls low to trigger fault)
   - **Status LED**: `PC13`
4. **Flash the Target Microcontroller**:
   Set the BOOT0 pin of the STM32F103 board to `1` (High), connect a USB-to-UART serial interface, and run:
   ```bash
   make flash
   ```
   *(Once flashed, remember to reset BOOT0 back to `0` and power-cycle the board)*

