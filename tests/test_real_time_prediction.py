import pytest

from face_rec import RealTimePred

@pytest.fixture
def real_time_pred():
    return RealTimePred()

def test_should_log_person(real_time_pred):
    from datetime import datetime, timedelta
    
    current_time = datetime.now()
    assert real_time_pred.should_log_person("John Doe", current_time) == True

    real_time_pred.last_log_time["John Doe"] = current_time
    assert real_time_pred.should_log_person("John Doe", current_time + timedelta(seconds=5)) == False
    assert real_time_pred.should_log_person("John Doe", current_time + timedelta(seconds=15)) == True


def test_should_not_log_unknown(real_time_pred):
    from datetime import datetime

    assert real_time_pred.should_log_person("Unknown", datetime.now()) is False
