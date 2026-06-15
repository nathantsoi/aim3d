#include "mcu.h"
#include "serial.h"
#include "stepper.h"

// SysTick registers
#define SYSTICK_CTRL   (*(volatile uint32_t*)0xE000E010)
#define SYSTICK_LOAD   (*(volatile uint32_t*)0xE000E014)
#define SYSTICK_VAL    (*(volatile uint32_t*)0xE000E018)

// Global milli tick counter (defined in serial.c)
extern volatile uint32_t g_millis;

// Linker script markers
extern uint32_t _estack;
extern uint32_t _sidata;
extern uint32_t _sdata;
extern uint32_t _edata;
extern uint32_t _sbss;
extern uint32_t _ebss;

// Reset handler (sets up RAM data sections and triggers main)
void Reset_Handler(void) {
    // Copy initialized data from flash to SRAM
    uint32_t *src = &_sidata;
    uint32_t *dst = &_sdata;
    while (dst < &_edata) {
        *dst++ = *src++;
    }

    // Zero-initialize the uninitialized BSS section
    dst = &_sbss;
    while (dst < &_ebss) {
        *dst++ = 0;
    }

    // Call entry point
    main();

    // Trap if main returns
    while (1);
}

// Exception handlers (Stubs)
void NMI_Handler(void) { while (1); }
void HardFault_Handler(void) { while (1); }
void SVC_Handler(void) { while (1); }
void PendSV_Handler(void) { while (1); }

// SysTick interrupt handler (fires every 1ms)
void SysTick_Handler(void) {
    g_millis++;
}

// Timer 2 interrupt handler (fires at 100 kHz for stepper timing)
void TIM2_IRQHandler(void) {
    if (TIM2->SR & (1 << 0)) { // Update interrupt flag
        TIM2->SR &= ~(1 << 0); // Clear interrupt flag
        stepper_tick();
    }
}

// ----------------------------------------------------
// Vector Table Section (mapped to address 0x08000000)
// ----------------------------------------------------
__attribute__((section(".isr_vector")))
void (* const g_pfnVectors[])(void) = {
    (void (*)(void))&_estack,  // Stack pointer
    Reset_Handler,             // Reset
    NMI_Handler,               // NMI
    HardFault_Handler,         // Hard Fault
    0, 0, 0, 0, 0, 0, 0,       // Reserved
    SVC_Handler,               // SVCall
    0, 0,                      // Reserved
    PendSV_Handler,            // PendSV
    SysTick_Handler,           // SysTick
    // External Interrupts
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0-9
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 10-19
    0, 0, 0, 0, 0, 0, 0, 0, TIM2_IRQHandler, 0, // 20-29 (TIM2 IRQ is position 28)
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 30-39
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 40-49
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0  // 50-59
};

// ----------------------------------------------------
// Main firmware loop
// ----------------------------------------------------
int main(void) {
    // 1. Initialize SysTick for 1ms interrupt
    // Default clock is HSI 8 MHz. 1ms reload = 8,000,000 / 1000 = 8000 ticks.
    SYSTICK_VAL = 0;
    SYSTICK_LOAD = 8000 - 1;
    SYSTICK_CTRL = (1 << 2) | (1 << 1) | (1 << 0); // clock source = CPU, enable interrupt, enable counter

    // 2. Initialize Peripherals
    stepper_init();
    serial_init();

    // Set Status LED Pin: PC13 as Output Push-Pull 2MHz (value 0x2)
    // CRH bits 20-23 control PC13
    RCC_APB2ENR |= (1 << 4); // Enable GPIOC clock
    GPIOC->CRH = (GPIOC->CRH & 0xFF0FFFFF) | 0x00200000;
    GPIOC->BSRR = (1 << 13); // Turn off LED initially

    uint32_t last_led_toggle = 0;

    // 3. Infinite Execution Loop
    while (1) {
        // Poll incoming USART bytes and dispatch
        serial_poll();

        // Blink Status LED every 500ms when armed/running, or keep it constant otherwise
        if (g_millis - last_led_toggle > 500) {
            last_led_toggle = g_millis;
            
            SpeMcuState current_state = stepper_get_state();
            if (current_state == SPE_STATE_RUNNING || current_state == SPE_STATE_ARMED) {
                // Toggle PC13 LED
                if (GPIOC->ODR & (1 << 13)) {
                    GPIOC->BRR = (1 << 13); // On
                } else {
                    GPIOC->BSRR = (1 << 13); // Off
                }
            } else if (current_state == SPE_STATE_FAULT) {
                // Flash rapidly
                GPIOC->BRR = (1 << 13); // On
            } else {
                GPIOC->BSRR = (1 << 13); // Off
            }
        }
    }

    return 0;
}
