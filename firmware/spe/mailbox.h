#ifndef AIM3D_MAILBOX_H
#define AIM3D_MAILBOX_H

#include <stdint.h>

#define IVC_QUEUE_SIZE 64

// Hardware states
typedef enum {
    STATE_IDLE = 0,
    STATE_RUNNING = 1,
    STATE_ESTOP = 2,
    STATE_ERROR = 3
} SPE_State;

// A single movement waypoint
typedef struct __attribute__((packed)) {
    uint32_t step_count_x;
    uint32_t step_count_y;
    uint32_t step_count_z;
    uint8_t dir_x;
    uint8_t dir_y;
    uint8_t dir_z;
    uint32_t delay_ticks; // Feedrate representation
} MotionCommand;

// Shared memory block between Linux Host and Cortex-R5 SPE
typedef struct {
    // Host -> SPE
    MotionCommand command_queue[IVC_QUEUE_SIZE];
    volatile uint32_t head;
    volatile uint32_t tail;
    volatile uint8_t estop_request;

    // SPE -> Host
    volatile SPE_State current_state;
    volatile uint32_t steps_executed;
} IVC_Mailbox;

#endif // AIM3D_MAILBOX_H
