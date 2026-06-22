from core.security import hash_password, verify_password


def test_password_hash_roundtrip():
    password_hash = hash_password("secret")

    assert verify_password("secret", password_hash) is True
    assert verify_password("wrong", password_hash) is False
