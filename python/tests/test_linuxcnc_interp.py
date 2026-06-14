import os
import re
import math
import pytest
from aim3d.controller import simulate_program_mesh

def evaluate_expression(expr_str):
    s = expr_str.lower()
    s = re.sub(r'sqrt\s*\[', 'math.sqrt(', s)
    s = s.replace('[', '(').replace(']', ')')
    allowed_names = {'math': math, 'sqrt': math.sqrt}
    return eval(s, {"__builtins__": None}, allowed_names)

def preprocess_gcode(gcode_text):
    out = []
    i = 0
    n = len(gcode_text)
    while i < n:
        if i + 1 < n and gcode_text[i].isalpha() and gcode_text[i+1] == '[':
            letter = gcode_text[i]
            start = i + 1
            bracket_count = 1
            j = start + 1
            while j < n and bracket_count > 0:
                if gcode_text[j] == '[':
                    bracket_count += 1
                elif gcode_text[j] == ']':
                    bracket_count -= 1
                j += 1
            if bracket_count == 0:
                expr_content = gcode_text[start+1:j-1]
                val = evaluate_expression(expr_content)
                out.append(f"{letter}{val:.6f}")
                i = j
                continue
        out.append(gcode_text[i])
        i += 1
    return "".join(out)

def parse_expected_min_z(expected_path):
    min_z = 0.0
    if not os.path.exists(expected_path):
        return min_z
        
    with open(expected_path, 'r') as f:
        lines = f.readlines()
        
    is_inches = False
    for line in lines:
        if "USE_LENGTH_UNITS(CANON_UNITS_INCHES)" in line:
            is_inches = True
        elif "USE_LENGTH_UNITS(CANON_UNITS_MM)" in line:
            is_inches = False
            
        # Find all STRAIGHT_FEED(x, y, z, ...) or STRAIGHT_TRAVERSE(x, y, z, ...)
        m = re.search(r'(STRAIGHT_FEED|STRAIGHT_TRAVERSE)\(([^)]+)\)', line)
        if m:
            args = [float(x.strip()) for x in m.group(2).split(',') if x.strip()]
            if len(args) >= 3:
                z = args[2] * (25.4 if is_inches else 1.0)
                if z < min_z:
                    min_z = z
                    
        # Handle ARC_FEED(first_end, second_end, first_axis_offset, second_axis_offset, rotation, axis_end_point, ...)
        arc_m = re.search(r'ARC_FEED\(([^)]+)\)', line)
        if arc_m:
            args = [float(x.strip()) for x in arc_m.group(1).split(',') if x.strip()]
            if len(args) >= 6:
                z = args[5] * (25.4 if is_inches else 1.0)
                if z < min_z:
                    min_z = z
                    
    return min_z

def find_ngc_files():
    base_dir = "/Users/ntsoi/src/sim/ai3d/opensource/linuxcnc/tests/interp"
    ngc_files = []
    
    good_dir = os.path.join(base_dir, "good")
    if os.path.isdir(good_dir):
        for f in os.listdir(good_dir):
            if f.endswith(".ngc"):
                ngc_files.append((os.path.join(good_dir, f), os.path.join(good_dir, f + ".expected")))
                
    for cycle in ["g81", "g84"]:
        cycle_dir = os.path.join(base_dir, cycle)
        if os.path.isdir(cycle_dir):
            for root, dirs, files in os.walk(cycle_dir):
                for f in files:
                    if f.endswith(".ngc"):
                        expected_path = os.path.join(root, "expected")
                        ngc_files.append((os.path.join(root, f), expected_path))
                        
    return ngc_files

@pytest.mark.parametrize("ngc_path, expected_path", find_ngc_files())
def test_linuxcnc_ngc_file(ngc_path, expected_path, record_meshes):
    with open(ngc_path, 'r') as f:
        gcode_text = f.read()
        
    gcode_text = preprocess_gcode(gcode_text)
    tools = [{"id": 1, "diameter_mm": 6.0, "kind": "flat"}]
    # We use a sufficiently large stock to enclose the simulation space
    stock_size = (1000.0, 1000.0, 100.0)
    
    # 1. Verify G-code syntax via simulator execution
    try:
        mesh = simulate_program_mesh(gcode_text, stock_size, tools, resolution=128)
    except Exception as e:
        pytest.fail(f"Failed G-code parsing/simulation for {os.path.basename(ngc_path)}: {e}")
        
    if record_meshes:
        import os
        from pathlib import Path
        from mesh_utils import write_obj_mesh
        records_dir = Path(__file__).resolve().parents[1] / "test_artifacts" / "obj"
        records_dir.mkdir(parents=True, exist_ok=True)
        out_name = os.path.basename(ngc_path).replace(".ngc", "") + ".obj"
        write_obj_mesh(str(records_dir / out_name), mesh)
        
    # 2. Verify G-code execution output via simulation mesh comparison
    expected_min_z = parse_expected_min_z(expected_path)
    if expected_min_z < 0.0:
        positions = mesh.get("positions", [])
        if positions:
            # The mesh contains top vertices first, then bottom vertices.
            # We only want to check the top surface for the cut depth.
            num_vertices = len(positions) // 3
            top_vertices_count = num_vertices // 2
            z_vals = [positions[i * 3 + 2] for i in range(top_vertices_count)]
            actual_min_z = min(z_vals)
            assert actual_min_z < 0.0, "Expected a cut in the simulation but none occurred"
            # Allow tolerance for resolution discretization
            assert actual_min_z == pytest.approx(expected_min_z, abs=2.0)

