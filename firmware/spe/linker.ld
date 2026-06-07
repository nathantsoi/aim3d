MEMORY
{
    TCM (rwx) : ORIGIN = 0x00000000, LENGTH = 256K
}

SECTIONS
{
    .text : { *(.text*) } > TCM
    .data : { *(.data*) } > TCM
    .bss  : { *(.bss*)  *(COMMON) } > TCM
}
