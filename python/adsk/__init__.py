"""
adsk compatibility facade for aim3d
"""

class Aim3dUnsupportedFeatureError(Exception):
    """
    Raised when an unsupported legacy Fusion 360 feature is invoked.
    """
    def __init__(self, feature_name, alternative=""):
        self.feature_name = feature_name
        self.alternative = alternative
        message = f"Fusion 360 feature '{feature_name}' is not supported by aim3d."
        if alternative:
            message += f" Please use alternative: '{alternative}'."
        super().__init__(message)

from . import core
from . import fusion
from . import cam

