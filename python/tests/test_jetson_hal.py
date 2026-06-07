import pytest
from aim3d.jetson_hal import JetsonHAL, IVC_QUEUE_SIZE

def test_jetson_hal_mock_init():
    hal = JetsonHAL(mock=True)
    assert hal.mock is True
    state = hal.get_state()
    assert state["state"] == 0
    assert state["steps_executed"] == 0
    assert state["queue_depth"] == 0

def test_jetson_hal_enqueue():
    hal = JetsonHAL(mock=True)
    
    # Enqueue one
    success = hal.enqueue_waypoint(10, 20, 30, 1, 0, 1, 500)
    assert success is True
    
    state = hal.get_state()
    assert state["queue_depth"] == 1
    
    # Check the actual struct memory
    cmd = hal.mailbox.command_queue[0]
    assert cmd.step_count_x == 10
    assert cmd.step_count_y == 20
    assert cmd.step_count_z == 30
    assert cmd.dir_x == 1
    assert cmd.dir_y == 0
    assert cmd.dir_z == 1
    assert cmd.delay_ticks == 500

def test_jetson_hal_queue_full():
    hal = JetsonHAL(mock=True)
    
    # Fill queue (queue size is 64, but ring buffer full condition is head + 1 == tail, so it holds 63)
    for _ in range(IVC_QUEUE_SIZE - 1):
        assert hal.enqueue_waypoint(1, 1, 1, 1, 1, 1, 100) is True
        
    # Next one should fail
    assert hal.enqueue_waypoint(1, 1, 1, 1, 1, 1, 100) is False

def test_jetson_hal_estop():
    hal = JetsonHAL(mock=True)
    assert hal.mailbox.estop_request == 0
    hal.trigger_estop()
    assert hal.mailbox.estop_request == 1
