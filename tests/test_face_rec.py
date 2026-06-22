import numpy as np
import pandas as pd

from face_rec import ml_search_algorithm


def test_ml_search_algorithm_returns_best_match():
    john = np.ones(512, dtype=np.float32)
    jane = np.zeros(512, dtype=np.float32)
    fake_dataframe = pd.DataFrame({
        "Name": ["John Doe", "Jane Doe"],
        "Role": ["employee", "employee"],
        "facial_features": [john, jane],
    })

    name, role = ml_search_algorithm(fake_dataframe, "facial_features", john, ["Name", "Role"], 0.9)

    assert name == "John Doe"
    assert role == "employee"


def test_ml_search_algorithm_handles_empty_registry():
    fake_dataframe = pd.DataFrame(columns=["Name", "Role", "facial_features"])

    name, role = ml_search_algorithm(fake_dataframe, "facial_features", np.ones(512), ["Name", "Role"], 0.5)

    assert name == "Unknown"
    assert role == "Unknown"
