import time
import numpy as np
from api.image_utils import decode_image
from core.config import get_settings
from core.db import SessionLocal
from services.face_service import FaceService, get_face_app
from services.attendance_service import AttendanceService
from services.tracker import CentroidTracker

class StreamSession:
    def __init__(self, camera_id: str):
        settings = get_settings()
        self.camera_id = camera_id
        self.settings = settings
        self.tracker = CentroidTracker(
            max_disappeared=12,
            sample_every_n=settings.sample_every_n,
            max_vote_buffer=10,
            max_active_tracks=settings.max_active_tracks,
        )

    def process_frame(self, binary_data: bytes) -> list[dict]:
        """
        Fully synchronous — runs inside a ThreadPoolExecutor thread.
        The async event loop never blocks on this call.

        Returns a list of event dicts to push back to the client over
        the WebSocket. Empty list means nothing to report yet.
        """
        t_start = time.perf_counter() if self.settings.log_frame_timing else None

        frame = decode_image(binary_data)
        if frame is None:
            return []

        # Stage 1: detect every frame
        raw_results = get_face_app().get(frame)
        bboxes = [np.asarray(r["bbox"], dtype=float) for r in raw_results]

        # tage 2: track every frame
        active_tracks = self.tracker.update(bboxes)

        # Pair each track's current bbox back to a detection index by best IOU,
        # so we can recover the embedding for the face the tracker is following.
        def best_det_index(track_bbox: np.ndarray) -> int:
            best_idx, best_iou = -1, 0.0
            for i, det_bbox in enumerate(bboxes):
                iou = CentroidTracker._iou(track_bbox, det_bbox)
                if iou > best_iou:
                    best_iou, best_idx = iou, i
            return best_idx if best_iou >= 0.3 else -1

        events = []

        for track_id, track in active_tracks.items():
            # Skip tracks not updated this frame (occluded / disappearing)
            if track.frames_since_seen > 0:
                continue

            # ── Stage 3: sample gate ─────────────────────────────────────────
            # Only every N frames per track do we run the expensive stages.
            if not self.tracker.should_sample(track_id):
                continue

            det_idx = best_det_index(track.bbox)
            if det_idx < 0 or det_idx >= len(raw_results):
                continue

            embedding = raw_results[det_idx]["embedding"]

            # ── Stage 4: match (sampled frames only) ─────────────────────────
            with SessionLocal() as db:
                face_svc = FaceService(db)
                attendance_svc = AttendanceService(db)

                employee, confidence = face_svc.match_embedding(embedding)
                self.tracker.record_vote(
                    track_id,
                    employee.id if employee else None,
                    confidence,
                )

                # ── Stage 5: temporal vote ────────────────────────────────────
                verdict = self.tracker.get_majority_verdict(track_id)
                if verdict is None:
                    continue   # not enough votes yet — keep sampling

                employee_id, avg_confidence = verdict

                # ── Stage 6: commit (once per track) ─────────────────────────
                # mark_committed is checked inside should_sample, so this
                # block can only fire once per physical person per crossing.
                if track.committed:
                    continue

                if employee_id is None:
                    event = attendance_svc.handle_unknown(
                        self.camera_id,
                        avg_confidence,
                        "No confident match after temporal voting",
                    )
                    events.append({
                        "track_id": track_id,
                        "employee": "Unknown",
                        "event_type": event.event_type,
                        "confidence": round(avg_confidence, 3),
                    })
                else:
                    # AttendanceService.handle_detection() queries the DB for
                    # the employee's current open session — this is what makes
                    # crash/reconnect recovery self-healing. No in-memory
                    # session state is trusted here.
                    event = attendance_svc.handle_detection(
                        employee_id, self.camera_id, avg_confidence
                    )
                    events.append({
                        "track_id": track_id,
                        "employee": employee_id,
                        "event_type": event.event_type,
                        "confidence": round(avg_confidence, 3),
                    })

                self.tracker.mark_committed(track_id)

        if self.settings.log_frame_timing:
            elapsed = (time.perf_counter() - t_start) * 1000
            active = len(active_tracks)
            print(f"[timing] {elapsed:.1f}ms | tracks={active} | events={len(events)}")

        return events