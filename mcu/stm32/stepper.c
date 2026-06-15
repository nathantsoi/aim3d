#include "stepper.h"
#include <stdlib.h>
#include <string.h>

// Coordinate tracking
static int64_t m_position_steps[3] = {0, 0, 0};
static SpeMcuState m_state = SPE_STATE_DISARMED;

// Queue definitions
static SpeSegmentMcu m_queue[SEGMENT_QUEUE_CAPACITY];
static uint32_t m_head = 0;
static uint32_t m_tail = 0;
static uint32_t m_count = 0;

// Current execution state
static SpeSegmentMcu m_current_segment;
static bool m_segment_active = false;
static uint32_t m_timer_ticks_total = 0;
static uint32_t m_timer_ticks_count = 0;

static uint32_t m_step_count_abs[3] = {0, 0, 0};
static int32_t m_step_accumulator[3] = {0, 0, 0};
static int8_t m_step_dir[3] = {1, 1, 1};

void stepper_init(void) {
    // Enable GPIOA, GPIOB, and TIM2 clocks
    // APB2ENR: IOPBEN (bit 3) = 1, IOPAEN (bit 2) = 1
    RCC_APB2ENR |= (1 << 3) | (1 << 2);
    // APB1ENR: TIM2EN (bit 0) = 1
    RCC_APB1ENR |= (1 << 0);

    // Pin configurations:
    // X STEP = PB12, DIR = PB13
    // Y STEP = PB14, DIR = PB15
    // Configure PB12-PB15 as Output Push-Pull 50MHz (value 0x3)
    // CRH bits 16-31 control PB12-PB15
    GPIOB->CRH = (GPIOB->CRH & 0x0000FFFF) | 0x33330000;

    // Z STEP = PA8, DIR = PA9
    // Configure PA8, PA9 as Output Push-Pull 50MHz (value 0x3)
    // CRH bits 0-7 control PA8, PA9
    GPIOA->CRH = (GPIOA->CRH & 0xFFFFFF00) | 0x00000033;

    // Limit switches: PA1 (X), PA2 (Y), PA3 (Z) as Input with Pull-up
    // E-Stop: PA0 as Input with Pull-up
    // CRL bits 0-15 control PA0-PA3
    // Input Pull-Up/Down is CNF = 0x2, MODE = 0x0 (value 0x8)
    GPIOA->CRL = (GPIOA->CRL & 0xFFFF0000) | 0x00008888;
    // Set ODR bits 0-3 to enable pull-up resistor
    GPIOA->ODR |= 0x000F;

    // Configure TIM2 for 100 kHz (10 microsecond ticks)
    // STM32F103 default HSI clock is 8 MHz
    TIM2->PSC = 79;        // Prescaler = 80 (8 MHz / 80 = 100,000 Hz)
    TIM2->ARR = 0;         // Auto-reload to 0 (generate interrupt every tick)
    TIM2->DIER |= (1 << 0); // Enable update interrupt
    TIM2->CR1 |= (1 << 0);  // Enable TIM2 counter

    // Enable TIM2 Interrupt in NVIC
    // TIM2 interrupt is position 28
    NVIC_ISER0 |= (1 << 28);

    stepper_clear_queue();
    m_position_steps[0] = 0;
    m_position_steps[1] = 0;
    m_position_steps[2] = 0;
}

bool stepper_queue_push(const SpeSegmentMcu* segment) {
    if (m_count >= SEGMENT_QUEUE_CAPACITY) {
        return false;
    }
    m_queue[m_head] = *segment;
    m_head = (m_head + 1) % SEGMENT_QUEUE_CAPACITY;
    m_count++;
    return true;
}

bool stepper_queue_pop(SpeSegmentMcu* segment) {
    if (m_count == 0) {
        return false;
    }
    *segment = m_queue[m_tail];
    m_tail = (m_tail + 1) % SEGMENT_QUEUE_CAPACITY;
    m_count--;
    return true;
}

uint32_t stepper_queue_size(void) {
    return m_count;
}

void stepper_clear_queue(void) {
    m_head = 0;
    m_tail = 0;
    m_count = 0;
    m_segment_active = false;
}

void stepper_set_state(SpeMcuState state) {
    m_state = state;
    if (state == SPE_STATE_DISARMED || state == SPE_STATE_FAULT) {
        stepper_clear_queue();
    }
}

SpeMcuState stepper_get_state(void) {
    return m_state;
}

void stepper_get_position(int64_t pos[3]) {
    pos[0] = m_position_steps[0];
    pos[1] = m_position_steps[1];
    pos[2] = m_position_steps[2];
}

void stepper_set_position(int64_t x, int64_t y, int64_t z) {
    m_position_steps[0] = x;
    m_position_steps[1] = y;
    m_position_steps[2] = z;
}

// -----------------------------------------------------------------
// TIM2 ISR Stepper tick handler
// Called at 100 kHz to generate step pulses and check safety limits
// -----------------------------------------------------------------
void stepper_tick(void) {
    // 1. Safety Checks (E-stop & Limit Switches)
    // Read GPIOA Inputs (bit 0 = Estop, bits 1-3 = Limits)
    uint32_t idr = GPIOA->IDR;
    bool estop_triggered = !(idr & (1 << 0)); // Active Low
    bool limit_triggered = !(idr & (1 << 1)) || !(idr & (1 << 2)) || !(idr & (1 << 3)); // Active Low

    if (estop_triggered || limit_triggered) {
        stepper_set_state(SPE_STATE_FAULT);
        // Clear all step pins immediately
        GPIOB->BRR = (1 << 12) | (1 << 14); // Clear PB12, PB14
        GPIOA->BRR = (1 << 8);              // Clear PA8
        return;
    }

    if (m_state != SPE_STATE_RUNNING) {
        // Disarm state or paused state: ensure step outputs are low
        GPIOB->BRR = (1 << 12) | (1 << 14);
        GPIOA->BRR = (1 << 8);
        return;
    }

    // 2. Linear Step Generator state machine
    if (!m_segment_active) {
        if (stepper_queue_pop(&m_current_segment)) {
            m_segment_active = true;
            m_timer_ticks_total = m_current_segment.durationUsec / 10;
            if (m_timer_ticks_total == 0) {
                m_timer_ticks_total = 1;
            }
            m_timer_ticks_count = 0;

            // Set Direction Pins:
            // X DIR = PB13
            if (m_current_segment.deltaSteps[0] >= 0) {
                GPIOB->BSRR = (1 << 13);
                m_step_dir[0] = 1;
            } else {
                GPIOB->BSRR = (1 << (13 + 16)); // Clear via upper BSRR word
                m_step_dir[0] = -1;
            }
            // Y DIR = PB15
            if (m_current_segment.deltaSteps[1] >= 0) {
                GPIOB->BSRR = (1 << 15);
                m_step_dir[1] = 1;
            } else {
                GPIOB->BSRR = (1 << (15 + 16));
                m_step_dir[1] = -1;
            }
            // Z DIR = PA9
            if (m_current_segment.deltaSteps[2] >= 0) {
                GPIOA->BSRR = (1 << 9);
                m_step_dir[2] = 1;
            } else {
                GPIOA->BSRR = (1 << (9 + 16));
                m_step_dir[2] = -1;
            }

            // Init Bresenham accumulators
            for (int i = 0; i < 3; ++i) {
                m_step_count_abs[i] = abs(m_current_segment.deltaSteps[i]);
                m_step_accumulator[i] = 0;
            }
        } else {
            // No segment remaining: transit to idle armed state
            stepper_set_state(SPE_STATE_ARMED);
            GPIOB->BRR = (1 << 12) | (1 << 14);
            GPIOA->BRR = (1 << 8);
            return;
        }
    }

    // 3. Bresenham Pulse Generation
    // Clear STEP Pins to end the pulse from the previous tick
    GPIOB->BRR = (1 << 12) | (1 << 14); // Clear PB12, PB14
    GPIOA->BRR = (1 << 8);              // Clear PA8

    // Coordinate steps timing
    for (int i = 0; i < 3; ++i) {
        if (m_step_count_abs[i] == 0) continue;

        m_step_accumulator[i] += m_step_count_abs[i];
        if (m_step_accumulator[i] >= (int32_t)m_timer_ticks_total) {
            m_step_accumulator[i] -= m_timer_ticks_total;
            m_position_steps[i] += m_step_dir[i];

            // Set STEP pin high
            if (i == 0) {
                GPIOB->BSRR = (1 << 12); // PB12
            } else if (i == 1) {
                GPIOB->BSRR = (1 << 14); // PB14
            } else if (i == 2) {
                GPIOA->BSRR = (1 << 8);  // PA8
            }
        }
    }

    m_timer_ticks_count++;
    if (m_timer_ticks_count >= m_timer_ticks_total) {
        m_segment_active = false;
    }
}
