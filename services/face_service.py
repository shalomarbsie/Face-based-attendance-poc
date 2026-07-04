import onnxruntime as ort
from functools import lru_cache

import cv2
import numpy as np
from insightface.app import FaceAnalysis

from core.config import get_settings
from db.repositories.embedding_repository import EmbeddingRepository


@lru_cache(maxsize=1)
def get_face_app() -> FaceAnalysis:
    settings = get_settings()
    
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = settings.intra_op_num_threads
    opts.inter_op_num_threads = settings.inter_op_num_threads

    app = FaceAnalysis(
        name="buffalo_sc", 
        root="insightface_model", 
        providers=["CPUExecutionProvider"],
        session_opts = opts,
    )
    
    app.prepare(
        ctx_id=0, 
        det_size=(settings.det_size, settings.det_size), 
        det_thresh=0.5
    )
    return app


class FaceService:
    def __init__(self, session):
        self.session = session
        self.embeddings = EmbeddingRepository(session)
        self.settings = get_settings()

    def extract_one_embedding(self, frame):
        results = get_face_app().get(frame, max_num=1)
        if not results:
            return frame, None
        res = results[0]
        bbox = res["bbox"].astype(int)
        cv2.rectangle(frame, (bbox[0], bbox[1]), (bbox[2], bbox[3]), (0, 255, 0), 1)
        return frame, res["embedding"].astype(np.float32)

    def detect_faces(self, frame):
        return get_face_app().get(frame)

    def match_embedding(self, embedding):
        vector = np.asarray(embedding, dtype=np.float32).tolist()
        match = self.embeddings.find_nearest_employee(vector)
        if match is None:
            return None, 0.0
        employee, confidence = match
        if confidence < self.settings.face_match_threshold:
            return None, confidence
        return employee, confidence
