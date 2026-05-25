import aim3d.core as aim
import numpy as np

def test_numpy_zero_copy():
    doc = aim.documents.create()
    body = doc.design.root_component.b_rep_bodies[0]

    buf = body.get_vertices_tensor()
    np_vertices = np.asarray(buf)

    assert np_vertices.shape == (3, 3)
    assert np_vertices.dtype == np.float32
    assert np_vertices.__array_interface__["data"][0] == buf.pointer
    assert np_vertices[0, 0] == 0.0
    assert np_vertices[1, 0] == 10.0

if __name__ == "__main__":
    test_numpy_zero_copy()
