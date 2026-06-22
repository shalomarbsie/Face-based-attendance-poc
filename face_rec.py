import cv2
import numpy as np
from sklearn.metrics import pairwise

from services.face_service import get_face_app


def ml_search_algorithm(dataframe, feature_column, test_vector, name_role=None, thresh=0.5):
    """Compatibility helper for tests and local experiments.

    Production matching now uses Postgres + pgvector through FaceService.
    """
    name_role = name_role or ["Name", "Role"]
    if dataframe.empty or feature_column not in dataframe:
        return "Unknown", "Unknown"
    X = np.vstack(dataframe[feature_column].values)
    similar = pairwise.cosine_similarity(X, test_vector.reshape(1, -1)).flatten()
    mask = similar >= thresh
    if mask.any():
        idx = similar[mask].argmax()
        return dataframe.loc[mask].iloc[idx][name_role]
    return "Unknown", "Unknown"


class RegistrationForm:
    def __init__(self):
        self.sample = 0

    def reset(self):
        self.sample = 0

    def get_embedding(self, frame):
        results = get_face_app().get(frame, max_num=1)
        embeddings = None
        for res in results:
            self.sample += 1
            bbox = res["bbox"].astype(int)
            cv2.rectangle(frame, (bbox[0], bbox[1]), (bbox[2], bbox[3]), (0, 255, 0), 1)
            embeddings = res["embedding"]
        return frame, embeddings


class RealTimePred:
    def __init__(self):
        self.last_log_time = {}

    def should_log_person(self, person_name, current_time):
        if person_name == "Unknown":
            return False
        last_time = self.last_log_time.get(person_name)
        if last_time is None:
            self.last_log_time[person_name] = current_time
            return True
        if (current_time - last_time).total_seconds() >= 10:
            self.last_log_time[person_name] = current_time
            return True
        return False
