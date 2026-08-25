import numpy as np
from collections import Counter
from dataclasses import dataclass, field

@dataclass
class Track:
    track_id: int
    bbox: np.ndarray          # [x1, y1, x2, y2]
    frames_since_seen: int = 0
    sample_counter: int = 0
    vote_buffer: list = field(default_factory=list)
    committed: bool = False


class CentroidTracker:
    def __init__(self, max_disappeared: int = 10, sample_every_n: int = 15,
                 max_vote_buffer: int = 10, max_active_tracks: int = 3,
                 min_votes: int = 3):
        self.max_disappeared = max_disappeared
        self.sample_every_n = sample_every_n
        self.max_vote_buffer = max_vote_buffer
        self.max_active_tracks = max_active_tracks
        self.min_votes = min_votes
        self._next_id = 0
        self.tracks: dict[int, Track] = {}

    @staticmethod
    def _iou(boxA: np.ndarray, boxB: np.ndarray) -> float:
        xA = max(boxA[0], boxB[0])
        yA = max(boxA[1], boxB[1])
        xB = min(boxA[2], boxB[2])
        yB = min(boxA[3], boxB[3])
        inter = max(0.0, xB - xA) * max(0.0, yB - yA)
        areaA = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
        areaB = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])
        union = areaA + areaB - inter
        return inter / union if union > 0 else 0.0

    def update(self, detections: list[np.ndarray]) -> dict[int, Track]:
        """
        Call once per frame with a list of bbox arrays [x1,y1,x2,y2].
        Returns the current active tracks dict.
        """
        unmatched_track_ids = set(self.tracks.keys())

        if detections:
            matched_det_indices = set()

            for track_id, track in self.tracks.items():
                best_iou, best_idx = 0.0, -1
                for i, det in enumerate(detections):
                    if i in matched_det_indices:
                        continue
                    iou = self._iou(track.bbox, np.asarray(det))
                    if iou > best_iou:
                        best_iou, best_idx = iou, i

                if best_iou >= 0.3:
                    track.bbox = np.asarray(detections[best_idx])
                    track.frames_since_seen = 0
                    track.sample_counter += 1
                    unmatched_track_ids.discard(track_id)
                    matched_det_indices.add(best_idx)

            # Spawn new tracks for unmatched detections,
            # capped at max_active_tracks for laptop budget
            for i, det in enumerate(detections):
                if i not in matched_det_indices:
                    if len(self.tracks) < self.max_active_tracks:
                        self.tracks[self._next_id] = Track(
                            track_id=self._next_id,
                            bbox=np.asarray(det),
                        )
                        self._next_id += 1

        for tid in unmatched_track_ids:
            self.tracks[tid].frames_since_seen += 1

        # Purge dead tracks
        self.tracks = {
            tid: t for tid, t in self.tracks.items()
            if t.frames_since_seen <= self.max_disappeared
        }

        return self.tracks

    def should_sample(self, track_id: int) -> bool:
        track = self.tracks.get(track_id)
        if track is None or track.committed or track.frames_since_seen > 0:
            return False
        return track.sample_counter % self.sample_every_n == 0

    def record_vote(self, track_id: int, employee_id: str | None, confidence: float):
        track = self.tracks.get(track_id)
        if track is None:
            return
        track.vote_buffer.append((employee_id, confidence))
        if len(track.vote_buffer) > self.max_vote_buffer:
            track.vote_buffer.pop(0)

    def get_majority_verdict(self, track_id: int) -> tuple[str | None, float] | None:
        """
        Returns (employee_id, avg_confidence) once the buffer has at least 3
        votes and one candidate holds 34%+ of them. Returns None otherwise.
        """
        track = self.tracks.get(track_id)
        if track is None or len(track.vote_buffer) < self.min_votes:
            return None
        votes = [v[0] for v in track.vote_buffer]
        top_id, top_count = Counter(votes).most_common(1)[0]
        if top_count / len(votes) < 0.5:
            return None
        confidences = [v[1] for v in track.vote_buffer if v[0] == top_id]
        return top_id, float(np.mean(confidences))

    def mark_committed(self, track_id: int):
        if track_id in self.tracks:
            self.tracks[track_id].committed = True