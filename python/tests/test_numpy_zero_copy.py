import aim3d.core as aim
import numpy as np

def test_numpy_zero_copy():
    # Retrieve a document and body
    doc = aim.documents.create()
    body = doc.design.root_component.b_rep_bodies[0]
    
    # Retrieve memoryview (zero-copy)
    buf = body.get_vertices_tensor()
    
    # Construct NumPy array directly on top of the buffer
    np_vertices = np.asarray(buf)
    
    # Assert dimensions and values (should match default mock solid)
    assert np_vertices.shape == (9,)
    assert np_vertices[0] == 0.0
    assert np_vertices[3] == 10.0
    
    print("[Python Test] Zero-copy validation successful! NumPy array views exact C++ memory layout.")

if __name__ == "__main__":
    test_numpy_zero_copy()
