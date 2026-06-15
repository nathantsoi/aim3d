# Makefile for aim3d STM32F103 Controller Firmware

CROSS_COMPILE ?= arm-none-eabi-
CC = $(CROSS_COMPILE)gcc
OBJCOPY = $(CROSS_COMPILE)objcopy
SIZE = $(CROSS_COMPILE)size

TARGET = firmware
BUILD_DIR = build

SRCS = main.c serial.c stepper.c
OBJS = $(addprefix $(BUILD_DIR)/, $(SRCS:.c=.o))

CFLAGS = -mcpu=cortex-m3 -mthumb -g -Os -Wall -Wextra -std=gnu11 -I.
LDFLAGS = -mcpu=cortex-m3 -mthumb -nostartfiles -T linker.ld -Wl,-Map=$(BUILD_DIR)/$(TARGET).map -Wl,--gc-sections

.PHONY: all clean flash

all: $(BUILD_DIR)/$(TARGET).bin

$(BUILD_DIR)/%.o: %.c | $(BUILD_DIR)
	@echo "  CC    $<"
	@$(CC) $(CFLAGS) -c $< -o $@

$(BUILD_DIR)/$(TARGET).elf: $(OBJS)
	@echo "  LD    $@"
	@$(CC) $(OBJS) $(LDFLAGS) -o $@
	@$(SIZE) $@

$(BUILD_DIR)/$(TARGET).bin: $(BUILD_DIR)/$(TARGET).elf
	@echo "  OBJCOPY $@"
	@$(OBJCOPY) -O binary $< $@
	@echo "Build complete: $@"

$(BUILD_DIR):
	@mkdir -p $(BUILD_DIR)

clean:
	@rm -rf $(BUILD_DIR)
	@echo "Clean complete."

# Flashing utility stubs matching klipper flashing tools
flash: $(BUILD_DIR)/$(TARGET).bin
	@echo "Flashing $(BUILD_DIR)/$(TARGET).bin via stm32flash..."
	stm32flash -w $(BUILD_DIR)/$(TARGET).bin -v -g 0 /dev/ttyUSB0
