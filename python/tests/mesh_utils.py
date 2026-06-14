import os

def write_obj_mesh(filepath, mesh):
    positions = mesh.get("positions", [])
    indices = mesh.get("indices", [])
    
    with open(filepath, "w") as f:
        # Write vertices
        for i in range(0, len(positions), 3):
            f.write(f"v {positions[i]} {positions[i+1]} {positions[i+2]}\n")
            
        # Write faces (1-indexed)
        for i in range(0, len(indices), 3):
            f.write(f"f {indices[i]+1} {indices[i+1]+1} {indices[i+2]+1}\n")
