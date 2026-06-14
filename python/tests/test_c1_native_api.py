import asyncio
import json
from pathlib import Path

import numpy as np
import pytest

import aim3d.cam as cam
import aim3d.core as aim


ARTIFACT_DIR = Path(__file__).resolve().parents[1] / "test_artifacts" / "c1"


def _polyline_svg(points, path_points, path):
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    xy = points[:, :2]
    min_xy = xy.min(axis=0)
    max_xy = xy.max(axis=0)
    span = np.maximum(max_xy - min_xy, 1.0)

    def project(point):
        x = 20.0 + ((point[0] - min_xy[0]) / span[0]) * 220.0
        y = 260.0 - ((point[1] - min_xy[1]) / span[1]) * 220.0
        return x, y

    mesh_circles = []
    for point in points:
        x, y = project(point)
        mesh_circles.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="4" fill="#178f7a" />')

    projected_path = [project(point) for point in path_points[:, 1:4]]
    path_data = " ".join(f"{x:.2f},{y:.2f}" for x, y in projected_path)
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="280" height="280" viewBox="0 0 280 280">'
        '<rect width="280" height="280" fill="#f8fafc" />'
        f'<polyline points="{path_data}" fill="none" stroke="#b42318" stroke-width="3" />'
        + "".join(mesh_circles)
        + "</svg>"
    )
    path.write_text(svg)
    return svg


def test_native_mesh_and_toolpath_visual_artifacts(record_meshes):
    doc = aim.documents.create()
    body = doc.design.root_component.b_rep_bodies[0]
    vertices = np.asarray(body.get_vertices_tensor())
    positions = np.asarray(doc.meshes.positions())
    indices = np.asarray(doc.meshes.indices())

    setup = cam.setups.active_setup
    operation = setup.operations["Pocket1"]
    asyncio.run(operation.generate_toolpath_async())
    toolpath_buffer = operation.get_toolpath_tensor()
    toolpath = np.asarray(toolpath_buffer)

    assert positions.shape[1] == 3
    assert indices.shape[1] == 3
    assert toolpath.shape == (4, 5)
    assert toolpath.__array_interface__["data"][0] == toolpath_buffer.pointer

    svg_path = ARTIFACT_DIR / "c1_native_buffers.svg"
    html_path = ARTIFACT_DIR / "c1_native_buffers.html"
    json_path = ARTIFACT_DIR / "c1_native_buffers.json"

    svg = _polyline_svg(vertices, toolpath, svg_path)
    html_path.write_text(f"<!doctype html><title>C1 Native Buffers</title>{svg}")
    json_path.write_text(
        json.dumps(
            {
                "vertex_count": int(vertices.shape[0]),
                "mesh_vertex_count": int(positions.shape[0]),
                "triangle_count": int(indices.shape[0]),
                "toolpath_record_count": int(toolpath.shape[0]),
                "vertex_pointer": int(vertices.__array_interface__["data"][0]),
                "toolpath_pointer": int(toolpath.__array_interface__["data"][0]),
                "bounds_min": vertices.min(axis=0).tolist(),
                "bounds_max": vertices.max(axis=0).tolist(),
            },
            indent=2,
        )
    )

    assert svg_path.stat().st_size > 100
    assert html_path.read_text().startswith("<!doctype html>")
    sidecar = json.loads(json_path.read_text())
    assert sidecar["vertex_count"] == 3
    assert sidecar["triangle_count"] > 0
    assert sidecar["toolpath_record_count"] == 4

    if record_meshes:
        import os
        from mesh_utils import write_obj_mesh
        records_dir = Path(__file__).resolve().parents[1] / "test_artifacts" / "obj"
        records_dir.mkdir(parents=True, exist_ok=True)
        mesh = {
            "positions": positions.flatten().tolist(),
            "indices": indices.flatten().tolist()
        }
        write_obj_mesh(str(records_dir / "test_native_mesh_and_toolpath_visual_artifacts.obj"), mesh)


def test_native_async_document_and_cam_api(tmp_path):
    async def run():
        doc = aim.documents.create()
        save_path = tmp_path / "async-save.a3d"
        inspect, save, generated = await asyncio.gather(
            doc.inspect_bodies_async(),
            doc.save_async(save_path),
            cam.setups.active_setup.operations["Pocket1"].generate_toolpath_async(),
        )
        return inspect, save, generated, save_path

    inspect, save, generated, save_path = asyncio.run(run())
    assert inspect is True
    assert save is True
    assert generated is True
    assert save_path.exists()


def test_native_pytorch_handoff_optional():
    torch = pytest.importorskip("torch")
    doc = aim.documents.create()
    vertices = np.asarray(doc.design.root_component.b_rep_bodies[0].get_vertices_tensor())
    tensor = torch.from_numpy(vertices)
    assert tuple(tensor.shape) == vertices.shape
    assert tensor.data_ptr() == vertices.__array_interface__["data"][0]
