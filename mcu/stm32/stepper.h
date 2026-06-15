#ifndef STEPPER_H
#define STEPPER_H

#include "mcu.h"
#include <stdbool.h>

#define SEGMENT_QUEUE_CAPACITY 16

void stepper_init(void);
bool stepper_queue_push(const SpeSegmentMcu* segment);
bool stepper_queue_pop(SpeSegmentMcu* segment);
uint32_t stepper_queue_size(void);
void stepper_clear_queue(void);

void stepper_set_state(SpeMcuState state);
SpeMcuState stepper_get_state(void);

void stepper_get_position(int64_t pos[3]);
void stepper_set_position(int64_t x, int64_t y, int64_t z);

void stepper_tick(void); // TIM2 ISR worker

#endif // STEPPER_H
