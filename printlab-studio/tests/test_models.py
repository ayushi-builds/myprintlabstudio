import pytest

from models.jewelry_tray import build as build_tray
from models.keychain import build as build_keychain
from models.cute_figurine import build as build_figurine


@pytest.mark.parametrize(
    "builder",
    [build_tray, build_keychain, build_figurine],
)
def test_model_is_valid_and_has_volume(builder):
    model = builder()
    shape = model.val()
    assert not shape.isNull()
    assert shape.isValid()
    assert shape.Volume() > 0
