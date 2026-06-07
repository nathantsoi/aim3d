CROSS_COMPILE ?= arm-none-eabi-
CC = $(CROSS_COMPILE)gcc
OBJCOPY = $(CROSS_COMPILE)objcopy

CFLAGS = -mcpu=cortex-r5 -mthumb -mfloat-abi=hard -O2 -Wall
LDFLAGS = -nostartfiles -T linker.ld

TARGET = aim3d_spe
SRC = main.c
OBJ = $(SRC:.c=.o)

all: $(TARGET).bin

$(TARGET).elf: $(OBJ)
	$(CC) $(CFLAGS) $(LDFLAGS) -o $@ $^

$(TARGET).bin: $(TARGET).elf
	$(OBJCOPY) -O binary $< $@

clean:
	rm -f *.o *.elf *.bin
