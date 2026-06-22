import pytest
import numpy as np
from unittest.mock import patch

from face_rec import RegistrationForm

@pytest.fixture
def registration_form():
    return RegistrationForm()

def test_get_embedding(registration_form):
    fake_image = np.zeros((100, 100, 3), dtype=np.uint8)

    with patch("face_rec.get_face_app") as mock_get_face_app:
        mock_get_face_app.return_value.get.return_value = []
        frame, embedding = registration_form.get_embedding(fake_image)

    assert isinstance(frame, np.ndarray)
    assert embedding is None


def test_reset(registration_form):
    registration_form.sample = 3
    registration_form.reset()

    assert registration_form.sample == 0
