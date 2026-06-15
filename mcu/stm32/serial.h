#ifndef SERIAL_H
#define SERIAL_H

#include "mcu.h"
#include <stdbool.h>

void serial_init(void);
void serial_poll(void);
void serial_send_telemetry(void);
void serial_feed_watchdog(void);
bool serial_is_watchdog_ok(void);

#endif // SERIAL_H
