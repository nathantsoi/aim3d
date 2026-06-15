#ifndef MCU_H
#define MCU_H

#include <stdint.h>

// RCC (Reset and Clock Control)
#define RCC_BASE      0x40021000
#define RCC_APB2ENR   (*(volatile uint32_t*)(RCC_BASE + 0x18))
#define RCC_APB1ENR   (*(volatile uint32_t*)(RCC_BASE + 0x1C))

// GPIO Ports
#define GPIOA_BASE    0x40010800
#define GPIOB_BASE    0x40010C00
#define GPIOC_BASE    0x40011000

typedef struct {
    volatile uint32_t CRL;
    volatile uint32_t CRH;
    volatile uint32_t IDR;
    volatile uint32_t ODR;
    volatile uint32_t BSRR;
    volatile uint32_t BRR;
    volatile uint32_t LCKR;
} GPIO_TypeDef;

#define GPIOA         ((GPIO_TypeDef*)GPIOA_BASE)
#define GPIOB         ((GPIO_TypeDef*)GPIOB_BASE)
#define GPIOC         ((GPIO_TypeDef*)GPIOC_BASE)

// USART1
#define USART1_BASE   0x40013800
typedef struct {
    volatile uint32_t SR;
    volatile uint32_t DR;
    volatile uint32_t BRR;
    volatile uint32_t CR1;
    volatile uint32_t CR2;
    volatile uint32_t CR3;
    volatile uint32_t GTPR;
} USART_TypeDef;

#define USART1        ((USART_TypeDef*)USART1_BASE)

// TIM2 (General Purpose Timer)
#define TIM2_BASE     0x40000000
typedef struct {
    volatile uint32_t CR1;
    volatile uint32_t CR2;
    volatile uint32_t SMCR;
    volatile uint32_t DIER;
    volatile uint32_t SR;
    volatile uint32_t EGR;
    volatile uint32_t CCMR1;
    volatile uint32_t CCMR2;
    volatile uint32_t CCER;
    volatile uint32_t CNT;
    volatile uint32_t PSC;
    volatile uint32_t ARR;
    volatile uint32_t RCR;
    volatile uint32_t CCR1;
    volatile uint32_t CCR2;
    volatile uint32_t CCR3;
    volatile uint32_t CCR4;
    volatile uint32_t BDTR;
    volatile uint32_t DCR;
    volatile uint32_t DMAR;
} TIM_TypeDef;

#define TIM2          ((TIM_TypeDef*)TIM2_BASE)

// NVIC (Nested Vectored Interrupt Controller)
#define NVIC_BASE     0xE000E100
#define NVIC_ISER0    (*(volatile uint32_t*)(NVIC_BASE + 0x00))

// ----------------------------------------------------
// Struct mappings matching the aim3d core G-code host
// ----------------------------------------------------

typedef enum {
    SPE_STATE_DISARMED = 0,
    SPE_STATE_ARMED = 1,
    SPE_STATE_RUNNING = 2,
    SPE_STATE_FEEDHOLD = 3,
    SPE_STATE_FAULT = 4
} SpeMcuState;

typedef enum {
    SPE_CMD_NONE = 0,
    SPE_CMD_ARM = 1,
    SPE_CMD_DISARM = 2,
    SPE_CMD_FEEDHOLD = 3,
    SPE_CMD_RESUME = 4,
    SPE_CMD_STOP = 5,
    SPE_CMD_ESTOP_RESET = 6,
    SPE_CMD_HOME = 7,
    SPE_CMD_JOG = 8
} SpeMcuCommand;

#pragma pack(push, 1)

// SpeSegment representation matching 64-bit host memory layout
typedef struct {
    int32_t deltaSteps[3]; // X, Y, Z delta step counts
    uint32_t durationUsec; // Move duration in microseconds
    uint32_t flags;        // Command flags (e.g. Spindle On)
    uint32_t padding;      // Align sourceLine to 8-byte boundary
    uint64_t sourceLine;   // Source line number
} SpeSegmentMcu;

// SpeStatusMailbox representation matching 64-bit host layout
typedef struct {
    uint32_t state;           // SpeState
    uint32_t padding1;        // Alignment padding
    int64_t positionSteps[3]; // X, Y, Z absolute step coordinates
    uint8_t heartbeatOk;      // Heartbeat signal state
    uint8_t estopActive;      // Estop signal state
    uint8_t limitActive;      // Limit switch state
    uint8_t watchdogFault;    // Watchdog signal status
    uint32_t padding2;        // Alignment padding
    uint64_t queuedSegments;  // Current size of ring buffer queue
} SpeStatusMailboxMcu;

#pragma pack(pop)

#endif // MCU_H
