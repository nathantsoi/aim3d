# aim3d STM32 Controller Firmware

This subproject implements the microcontroller firmware designed to run on an STM32F103 (Cortex-M3) target (e.g. standard Blue Pill board) and control physical stepper motors. The host-to-MCU serial protocol is modeled on Klipper.

## Pin Configurations

- **Status LED**: PC13 (Active Low, standard Blue Pill LED)
- **Emergency Stop (E-Stop)**: PA0 (Input, Pull-up, Active Low)
- **Limit Switches**: PA1 (X), PA2 (Y), PA3 (Z) (Input, Pull-up, Active Low)
- **X Axis**:
  - Step: PB12
  - Dir: PB13
- **Y Axis**:
  - Step: PB14
  - Dir: PB15
- **Z Axis**:
  - Step: PA8
  - Dir: PA9
- **Serial Communication**: USART1 (PA9 = TX, PA10 = RX) @ 115200 8N1

## Build Instructions

To build the firmware binary, you need the standard GNU Arm Embedded Toolchain (`arm-none-eabi-gcc`):

```bash
cd aim3d/mcu/stm32
make
```

The build output will be located in the `build/` directory:
- `build/firmware.elf`: ELF executable
- `build/firmware.bin`: Raw binary suitable for flashing

## Flashing

To flash the compiled binary to the STM32F103 board via a serial adapter (e.g., USB-to-UART connected to USART1 PA9/PA10, with BOOT0 set to 1):

```bash
make flash
```

Alternatively, you can flash the `.bin` file using open-source utilities like OpenOCD (via SWD debugger) or stlink.
