from sqlalchemy import select

from db.models import Camera


class CameraRepository:
    def __init__(self, session):
        self.session = session

    def get(self, camera_id: str) -> Camera | None:
        return self.session.get(Camera, camera_id)

    def list_active(self) -> list[Camera]:
        from db.models import Camera
        return self.session.query(Camera).filter(
            Camera.is_active.is_(True)
        ).all()

    def upsert(self, camera_id: str, name: str, direction: str, location: str | None = None) -> Camera:
        camera = self.get(camera_id)
        if camera is None:
            camera = Camera(id=camera_id, name=name, direction=direction, location=location)
            self.session.add(camera)
        else:
            camera.name = name
            camera.direction = direction
            camera.location = location
            camera.is_active = True
        self.session.flush()
        return camera
