from adsk import Aim3dUnsupportedFeatureError


class VolumetricModel:
    @staticmethod
    def cast(value):
        raise Aim3dUnsupportedFeatureError("adsk.volume.VolumetricModel", "aim3d.diff or aim3d simulation APIs")
