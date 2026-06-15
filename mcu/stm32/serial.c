#include "serial.h"
#include "stepper.h"
#include <string.h>

// Global tick counter
volatile uint32_t g_millis = 0;
static uint32_t m_last_watchdog_feed = 0;
static bool m_watchdog_fault = false;

// Last sequence numbers
static uint32_t m_last_rx_seq = 0;
static uint32_t m_tx_seq = 0;

// Parser state machine variables
typedef enum {
    RX_STATE_START = 0,
    RX_STATE_SEQ = 1,
    RX_STATE_CMD_TYPE = 2,
    RX_STATE_PAYLOAD_LEN = 3,
    RX_STATE_PAYLOAD = 4,
    RX_STATE_CHECKSUM = 5,
    RX_STATE_END = 6
} RxState;

static RxState m_rx_state = RX_STATE_START;
static uint8_t m_rx_seq_bytes[4];
static uint8_t m_rx_len_bytes[2];
static uint32_t m_rx_seq = 0;
static uint8_t m_rx_cmd_type = 0;
static uint16_t m_rx_payload_len = 0;
static uint8_t m_rx_payload[128];
static uint16_t m_rx_payload_idx = 0;
static uint8_t m_rx_checksum = 0;
static uint8_t m_rx_computed_checksum = 0;
static uint8_t m_rx_count = 0;

// UART IO helpers
static void serial_write_byte(uint8_t b) {
    // Wait for TXE (Transmit data register empty)
    while (!(USART1->SR & (1 << 7)));
    USART1->DR = b;
}

static void serial_write_bytes(const uint8_t* data, uint32_t len) {
    for (uint32_t i = 0; i < len; ++i) {
        serial_write_byte(data[i]);
    }
}

void serial_init(void) {
    // 1. Enable Clocks:
    // IOPAEN (bit 2) = 1, USART1EN (bit 14) = 1
    RCC_APB2ENR |= (1 << 2) | (1 << 14);

    // 2. Configure PA9 (TX) and PA10 (RX):
    // PA9: Alternate function push-pull 50MHz (value 0xB)
    // PA10: Input floating (value 0x4)
    // CRH bits 4-11 control PA9, PA10
    GPIOA->CRH = (GPIOA->CRH & 0xFFFFF00F) | 0x000004B0;

    // 3. Configure USART1:
    // Baud rate = 115200. HSI is 8 MHz.
    // USART_BRR = 8000000 / 115200 = 69.44 => mantissa = 69 (0x45), fraction = 0.44 * 16 = 7 (0x7)
    // BRR = 0x457
    USART1->BRR = 0x457;

    // Control registers:
    // CR1: Enable USART (UE=bit 13), Transmit (TE=bit 3), Receive (RE=bit 2)
    USART1->CR1 = (1 << 13) | (1 << 3) | (1 << 2);

    m_last_watchdog_feed = g_millis;
    m_watchdog_fault = false;
    m_rx_state = RX_STATE_START;
}

void serial_feed_watchdog(void) {
    m_last_watchdog_feed = g_millis;
    m_watchdog_fault = false;
}

bool serial_is_watchdog_ok(void) {
    if (m_watchdog_fault) return false;

    if (g_millis - m_last_watchdog_feed > 500) {
        m_watchdog_fault = true;
        stepper_set_state(SPE_STATE_FAULT);
    }
    return !m_watchdog_fault;
}

static void process_packet(void) {
    // Verify sequence number
    if (m_rx_seq <= m_last_rx_seq && m_last_rx_seq != 0) {
        // Legacy/duplicate sequence, ignore but send telemetry acknowledgement
        serial_send_telemetry();
        return;
    }
    m_last_rx_seq = m_rx_seq;

    // Process commands
    if (m_rx_cmd_type == 0x01) {
        // Movement segment
        if (m_rx_payload_len == sizeof(SpeSegmentMcu)) {
            SpeSegmentMcu seg;
            memcpy(&seg, m_rx_payload, sizeof(SpeSegmentMcu));
            
            // Push segment to stepper execution queue
            if (stepper_queue_push(&seg)) {
                // If armed, start running!
                if (stepper_get_state() == SPE_STATE_ARMED) {
                    stepper_set_state(SPE_STATE_RUNNING);
                }
            }
        }
    } else if (m_rx_cmd_type == 0x02) {
        // Immediate command
        if (m_rx_payload_len >= 1) {
            SpeMcuCommand cmd = (SpeMcuCommand)m_rx_payload[0];
            switch (cmd) {
                case SPE_CMD_ARM:
                    stepper_set_state(SPE_STATE_ARMED);
                    break;
                case SPE_CMD_DISARM:
                    stepper_set_state(SPE_STATE_DISARMED);
                    break;
                case SPE_CMD_FEEDHOLD:
                    stepper_set_state(SPE_STATE_FEEDHOLD);
                    break;
                case SPE_CMD_RESUME:
                    if (stepper_get_state() == SPE_STATE_FEEDHOLD) {
                        stepper_set_state(SPE_STATE_RUNNING);
                    }
                    break;
                case SPE_CMD_STOP:
                    stepper_clear_queue();
                    stepper_set_state(SPE_STATE_ARMED);
                    break;
                case SPE_CMD_ESTOP_RESET:
                    stepper_set_state(SPE_STATE_DISARMED);
                    break;
                case SPE_CMD_HOME:
                    stepper_set_position(0, 0, 0);
                    stepper_set_state(SPE_STATE_ARMED);
                    break;
                case SPE_CMD_JOG:
                    if (m_rx_payload_len >= 13) {
                        int32_t steps[3];
                        memcpy(steps, m_rx_payload + 1, sizeof(steps));
                        
                        SpeSegmentMcu jogSeg;
                        jogSeg.deltaSteps[0] = steps[0];
                        jogSeg.deltaSteps[1] = steps[1];
                        jogSeg.deltaSteps[2] = steps[2];
                        jogSeg.durationUsec = 100000; // 100ms jog duration
                        jogSeg.flags = 0;
                        jogSeg.padding = 0;
                        jogSeg.sourceLine = 0;
                        
                        stepper_queue_push(&jogSeg);
                        stepper_set_state(SPE_STATE_RUNNING);
                    }
                    break;
                default:
                    break;
            }
        }
    }

    // Send updated status packet back to host
    serial_send_telemetry();
}

// ----------------------------------------------------
// Poll incoming USART bytes and feed the RX packetizer
// ----------------------------------------------------
void serial_poll(void) {
    // Periodic watchdog check
    serial_is_watchdog_ok();

    // Check if USART1 RX data register not empty (bit 5)
    while (USART1->SR & (1 << 5)) {
        uint8_t b = USART1->DR;

        switch (m_rx_state) {
            case RX_STATE_START:
                if (b == 0x7E) {
                    m_rx_state = RX_STATE_SEQ;
                    m_rx_count = 0;
                    m_rx_computed_checksum = 0;
                }
                break;

            case RX_STATE_SEQ:
                m_rx_seq_bytes[m_rx_count++] = b;
                m_rx_computed_checksum ^= b;
                if (m_rx_count == 4) {
                    m_rx_seq = (m_rx_seq_bytes[0] << 24) | (m_rx_seq_bytes[1] << 16) | (m_rx_seq_bytes[2] << 8) | m_rx_seq_bytes[3];
                    m_rx_state = RX_STATE_CMD_TYPE;
                }
                break;

            case RX_STATE_CMD_TYPE:
                m_rx_cmd_type = b;
                m_rx_computed_checksum ^= b;
                m_rx_state = RX_STATE_PAYLOAD_LEN;
                m_rx_count = 0;
                break;

            case RX_STATE_PAYLOAD_LEN:
                m_rx_len_bytes[m_rx_count++] = b;
                m_rx_computed_checksum ^= b;
                if (m_rx_count == 2) {
                    m_rx_payload_len = (m_rx_len_bytes[0] << 8) | m_rx_len_bytes[1];
                    m_rx_payload_idx = 0;
                    if (m_rx_payload_len > 0 && m_rx_payload_len <= 128) {
                        m_rx_state = RX_STATE_PAYLOAD;
                    } else if (m_rx_payload_len == 0) {
                        m_rx_state = RX_STATE_CHECKSUM;
                    } else {
                        // Length error, drop packet
                        m_rx_state = RX_STATE_START;
                    }
                }
                break;

            case RX_STATE_PAYLOAD:
                m_rx_payload[m_rx_payload_idx++] = b;
                m_rx_computed_checksum ^= b;
                if (m_rx_payload_idx == m_rx_payload_len) {
                    m_rx_state = RX_STATE_CHECKSUM;
                }
                break;

            case RX_STATE_CHECKSUM:
                m_rx_checksum = b;
                m_rx_state = RX_STATE_END;
                break;

            case RX_STATE_END:
                if (b == 0x7F && m_rx_checksum == m_rx_computed_checksum) {
                    // Packet successfully validated!
                    serial_feed_watchdog();
                    process_packet();
                }
                m_rx_state = RX_STATE_START;
                break;
        }
    }
}

// ----------------------------------------------------
// Sends status back to host using SpeStatusMailbox layout
// ----------------------------------------------------
void serial_send_telemetry(void) {
    uint8_t packet[70];
    uint32_t idx = 0;

    packet[idx++] = 0x7E; // Start byte

    // Sequence
    uint32_t seq = ++m_tx_seq;
    packet[idx++] = (seq >> 24) & 0xFF;
    packet[idx++] = (seq >> 16) & 0xFF;
    packet[idx++] = (seq >> 8) & 0xFF;
    packet[idx++] = seq & 0xFF;

    packet[idx++] = 0x03; // Telemetry response packet type

    // Payload length (sizeof(SpeStatusMailboxMcu) = 48)
    uint16_t len = sizeof(SpeStatusMailboxMcu);
    packet[idx++] = (len >> 8) & 0xFF;
    packet[idx++] = len & 0xFF;

    // Pack SpeStatusMailboxMcu
    SpeStatusMailboxMcu status;
    status.state = (uint32_t)stepper_get_state();
    status.padding1 = 0;
    stepper_get_position(status.positionSteps);

    status.heartbeatOk = !m_watchdog_fault;
    
    // Read GPIOA pins for Estop and limits
    uint32_t idr = GPIOA->IDR;
    status.estopActive = !(idr & (1 << 0)) ? 1 : 0;
    status.limitActive = (!(idr & (1 << 1)) || !(idr & (1 << 2)) || !(idr & (1 << 3))) ? 1 : 0;
    status.watchdogFault = m_watchdog_fault ? 1 : 0;
    status.padding2 = 0;
    status.queuedSegments = stepper_queue_size();

    memcpy(packet + idx, &status, sizeof(SpeStatusMailboxMcu));
    idx += sizeof(SpeStatusMailboxMcu);

    // Compute checksum
    uint8_t checksum = 0;
    for (uint32_t i = 1; i < idx; ++i) {
        checksum ^= packet[i];
    }
    packet[idx++] = checksum;
    packet[idx++] = 0x7F; // End byte

    serial_write_bytes(packet, idx);
}
