#include "aim3d/document.hpp"
#include <algorithm>
#include <cctype>
#include <fstream>
#include <iostream>
#include <stdexcept>

#if AIM3D_HAS_OCCT
#include <BRepAlgoAPI_Cut.hxx>
#include <BRep_Builder.hxx>
#include <BRepBndLib.hxx>
#include <BRepGProp.hxx>
#include <BRepMesh_IncrementalMesh.hxx>
#include <BRepOffsetAPI_MakeOffsetShape.hxx>
#include <BRepPrimAPI_MakeBox.hxx>
#include <BRep_Tool.hxx>
#include <BRepTools.hxx>
#include <Bnd_Box.hxx>
#include <GProp_GProps.hxx>
#include <gp_Pnt.hxx>
#include <IGESControl_Reader.hxx>
#include <IGESControl_Writer.hxx>
#include <IFSelect_ReturnStatus.hxx>
#include <Poly_Triangulation.hxx>
#include <STEPControl_Reader.hxx>
#include <STEPControl_Writer.hxx>
#include <TopAbs_ShapeEnum.hxx>
#include <TopExp_Explorer.hxx>
#include <TopLoc_Location.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Compound.hxx>
#include <TopoDS_Face.hxx>
#include <TopoDS_Shape.hxx>
#endif

namespace aim3d {

struct KernelShape {
#if AIM3D_HAS_OCCT
    TopoDS_Shape shape;
#endif
};

namespace {

std::string lowerExtension(const std::string& path) {
    const auto dot = path.find_last_of('.');
    if (dot == std::string::npos) {
        return {};
    }
    std::string ext = path.substr(dot + 1);
    std::transform(ext.begin(), ext.end(), ext.begin(), [](unsigned char c) {
        return static_cast<char>(std::tolower(c));
    });
    return ext;
}

#if AIM3D_HAS_OCCT
TopologySignature signatureFromShape(const TopoDS_Shape& shape, TopologyKind kind) {
    TopologySignature signature;

    Bnd_Box box;
    BRepBndLib::Add(shape, box);
    if (!box.IsVoid()) {
        box.Get(
            signature.minX,
            signature.minY,
            signature.minZ,
            signature.maxX,
            signature.maxY,
            signature.maxZ);
        signature.centerX = (signature.minX + signature.maxX) * 0.5;
        signature.centerY = (signature.minY + signature.maxY) * 0.5;
        signature.centerZ = (signature.minZ + signature.maxZ) * 0.5;
    }

    if (kind == TopologyKind::Face) {
        GProp_GProps props;
        BRepGProp::SurfaceProperties(shape, props);
        signature.measure = props.Mass();
        const auto center = props.CentreOfMass();
        signature.centerX = center.X();
        signature.centerY = center.Y();
        signature.centerZ = center.Z();
    } else if (kind == TopologyKind::Edge) {
        GProp_GProps props;
        BRepGProp::LinearProperties(shape, props);
        signature.measure = props.Mass();
        const auto center = props.CentreOfMass();
        signature.centerX = center.X();
        signature.centerY = center.Y();
        signature.centerZ = center.Z();
    } else if (kind == TopologyKind::Vertex) {
        const auto point = BRep_Tool::Pnt(TopoDS::Vertex(shape));
        signature.centerX = point.X();
        signature.centerY = point.Y();
        signature.centerZ = point.Z();
        signature.minX = signature.maxX = point.X();
        signature.minY = signature.maxY = point.Y();
        signature.minZ = signature.maxZ = point.Z();
    } else if (kind == TopologyKind::Body) {
        signature.measure = (signature.maxX - signature.minX)
            * (signature.maxY - signature.minY)
            * (signature.maxZ - signature.minZ);
    }

    return signature;
}

std::shared_ptr<KernelShape> cloneKernelShape(const std::shared_ptr<KernelShape>& source) {
    if (!source) {
        return nullptr;
    }
    auto clone = std::make_shared<KernelShape>();
    clone->shape = source->shape;
    return clone;
}

std::shared_ptr<KernelShape> makeKernelShape(const TopoDS_Shape& shape) {
    if (shape.IsNull()) {
        throw std::runtime_error("OCCT edit produced an empty shape");
    }
    auto kernelShape = std::make_shared<KernelShape>();
    kernelShape->shape = shape;
    return kernelShape;
}

TopoDS_Shape splitShapeAtX(const TopoDS_Shape& source, double splitX) {
    Bnd_Box box;
    BRepBndLib::Add(source, box);
    if (box.IsVoid()) {
        throw std::runtime_error("Cannot split a shape with empty bounds");
    }

    double minX = 0.0;
    double minY = 0.0;
    double minZ = 0.0;
    double maxX = 0.0;
    double maxY = 0.0;
    double maxZ = 0.0;
    box.Get(minX, minY, minZ, maxX, maxY, maxZ);
    if (splitX <= minX || splitX >= maxX) {
        throw std::invalid_argument("Split edit value must be inside the body's X bounds");
    }

    const double pad = std::max({maxX - minX, maxY - minY, maxZ - minZ, 1.0}) * 2.0;
    const gp_Pnt corner(splitX, minY - pad, minZ - pad);
    const auto cutter = BRepPrimAPI_MakeBox(corner, maxX - splitX + pad, maxY - minY + pad * 2.0, maxZ - minZ + pad * 2.0).Shape();
    BRepAlgoAPI_Cut cut(source, cutter);
    cut.Build();
    if (!cut.IsDone() || cut.Shape().IsNull()) {
        throw std::runtime_error("OCCT failed to perform split edit");
    }
    return cut.Shape();
}

TopoDS_Shape offsetShape(const TopoDS_Shape& source, double offset) {
    BRepOffsetAPI_MakeOffsetShape maker;
    maker.PerformBySimple(source, offset);
    if (!maker.IsDone() || maker.Shape().IsNull()) {
        throw std::runtime_error("OCCT failed to perform offset edit");
    }
    return maker.Shape();
}

std::size_t countSubShapes(const TopoDS_Shape& shape, TopAbs_ShapeEnum shapeType) {
    std::size_t count = 0;
    for (TopExp_Explorer explorer(shape, shapeType); explorer.More(); explorer.Next()) {
        count++;
    }
    return count;
}

std::shared_ptr<KernelShape> readOcctShape(const std::string& path, GeometryFormat format) {
    TopoDS_Shape shape;
    if (format == GeometryFormat::Step) {
        STEPControl_Reader reader;
        if (reader.ReadFile(path.c_str()) != IFSelect_RetDone) {
            throw std::runtime_error("OCCT failed to read STEP file: " + path);
        }
        reader.TransferRoots();
        shape = reader.OneShape();
    } else if (format == GeometryFormat::Iges) {
        IGESControl_Reader reader;
        if (reader.ReadFile(path.c_str()) != IFSelect_RetDone) {
            throw std::runtime_error("OCCT failed to read IGES file: " + path);
        }
        reader.TransferRoots();
        shape = reader.OneShape();
    } else if (format == GeometryFormat::Brep) {
        BRep_Builder builder;
        if (!BRepTools::Read(shape, path.c_str(), builder)) {
            throw std::runtime_error("OCCT failed to read BREP file: " + path);
        }
    }

    if (shape.IsNull()) {
        throw std::runtime_error("OCCT imported an empty shape: " + path);
    }

    auto kernelShape = std::make_shared<KernelShape>();
    kernelShape->shape = shape;
    return kernelShape;
}

TopoDS_Shape compoundFromBodies(const std::vector<std::shared_ptr<BRepBody>>& bodies) {
    TopoDS_Compound compound;
    BRep_Builder builder;
    builder.MakeCompound(compound);

    bool hasShape = false;
    for (const auto& body : bodies) {
        if (!body || !body->kernelShapeHandle() || body->kernelShapeHandle()->shape.IsNull()) {
            continue;
        }
        builder.Add(compound, body->kernelShapeHandle()->shape);
        hasShape = true;
    }

    if (!hasShape) {
        throw std::runtime_error("Cannot export document without imported OCCT B-rep bodies");
    }

    return compound;
}

bool writeOcctShape(const TopoDS_Shape& shape, const std::string& path, GeometryFormat format) {
    if (format == GeometryFormat::Step) {
        STEPControl_Writer writer;
        if (writer.Transfer(shape, STEPControl_AsIs) != IFSelect_RetDone) {
            throw std::runtime_error("OCCT failed to transfer shape for STEP export: " + path);
        }
        if (writer.Write(path.c_str()) != IFSelect_RetDone) {
            throw std::runtime_error("OCCT failed to write STEP file: " + path);
        }
        return true;
    }

    if (format == GeometryFormat::Iges) {
        IGESControl_Writer writer("MM", 0);
        if (!writer.AddShape(shape)) {
            throw std::runtime_error("OCCT failed to transfer shape for IGES export: " + path);
        }
        if (!writer.Write(path.c_str())) {
            throw std::runtime_error("OCCT failed to write IGES file: " + path);
        }
        return true;
    }

    if (format == GeometryFormat::Brep) {
        if (!BRepTools::Write(shape, path.c_str())) {
            throw std::runtime_error("OCCT failed to write BREP file: " + path);
        }
        return true;
    }

    throw std::invalid_argument("Unsupported geometry format for export: " + path);
}
#endif

ViewportSolidMesh fallbackSolidMesh(EntityId bodyId, const std::string& token) {
    ViewportSolidMesh mesh;
    mesh.id = "solid_" + std::to_string(bodyId == 0 ? 1 : bodyId);
    mesh.bodyId = bodyId;
    mesh.sourceToken = token.empty() ? "feat_Extrude_1_face_0" : token;
    mesh.pickable.entityId = mesh.sourceToken;
    mesh.pickable.kind = "B-rep Exact Face";
    mesh.pickable.priority = 10;
    mesh.pickable.snapPoints.push_back(ViewportSolidMesh::SnapPoint{
        "solid_" + std::to_string(bodyId == 0 ? 1 : bodyId) + "_center",
        "center",
        {0.0f, 0.0f, 0.35f}
    });
    mesh.positions = {
        -1.8f, -1.2f, -0.35f, 1.8f, -1.2f, -0.35f, 1.8f, 1.2f, -0.35f, -1.8f, 1.2f, -0.35f,
        -1.8f, -1.2f, 0.35f, 1.8f, -1.2f, 0.35f, 1.8f, 1.2f, 0.35f, -1.8f, 1.2f, 0.35f
    };
    mesh.normals = {
        0.0f, 0.0f, -1.0f, 0.0f, 0.0f, -1.0f, 0.0f, 0.0f, -1.0f, 0.0f, 0.0f, -1.0f,
        0.0f, 0.0f, 1.0f, 0.0f, 0.0f, 1.0f, 0.0f, 0.0f, 1.0f, 0.0f, 0.0f, 1.0f
    };
    mesh.colors = {
        0.16f, 0.62f, 0.9f, 1.0f, 0.16f, 0.62f, 0.9f, 1.0f, 0.16f, 0.62f, 0.9f, 1.0f, 0.16f, 0.62f, 0.9f, 1.0f,
        0.2f, 0.72f, 1.0f, 1.0f, 0.2f, 0.72f, 1.0f, 1.0f, 0.2f, 0.72f, 1.0f, 1.0f, 0.2f, 0.72f, 1.0f, 1.0f
    };
    mesh.indices = {
        0, 1, 2, 0, 2, 3,
        4, 6, 5, 4, 7, 6,
        0, 4, 5, 0, 5, 1,
        1, 5, 6, 1, 6, 2,
        2, 6, 7, 2, 7, 3,
        3, 7, 4, 3, 4, 0
    };
    return mesh;
}

#if AIM3D_HAS_OCCT
ViewportSolidMesh meshFromOcctBody(const BRepBody& body, const std::string& token);
#endif

// Builds a renderable box mesh (6 faces, 8 corners expanded per-face for flat
// normals) for a synthetic axis-aligned body. Used to visualize extruded
// rectangles when no exact B-rep kernel is available.
ViewportSolidMesh boxSolidMesh(const BRepBody& body, const std::string& token) {
    ViewportSolidMesh mesh;
    mesh.id = "solid_" + std::to_string(body.id() == 0 ? 1 : body.id());
    mesh.bodyId = body.id();
    mesh.sourceToken = token.empty() ? ("body_" + std::to_string(body.id())) : token;
    mesh.pickable.entityId = mesh.sourceToken;
    mesh.pickable.kind = "B-rep Exact Face";
    mesh.pickable.priority = 10;

    const auto& lo = body.boxMin();
    const auto& hi = body.boxMax();
    const float x0 = static_cast<float>(lo[0]);
    const float y0 = static_cast<float>(lo[1]);
    const float z0 = static_cast<float>(lo[2]);
    const float x1 = static_cast<float>(hi[0]);
    const float y1 = static_cast<float>(hi[1]);
    const float z1 = static_cast<float>(hi[2]);
    const float cx = (x0 + x1) * 0.5f;
    const float cy = (y0 + y1) * 0.5f;
    const float cz = (z0 + z1) * 0.5f;

    mesh.pickable.snapPoints.push_back(ViewportSolidMesh::SnapPoint{
        mesh.id + "_center", "center", {cx, cy, cz}
    });

    struct Face {
        std::array<std::array<float, 3>, 4> corners;
        std::array<float, 3> normal;
    };
    const std::array<Face, 6> faces = {{
        {{{{x0, y0, z0}, {x1, y0, z0}, {x1, y1, z0}, {x0, y1, z0}}}, {0.0f, 0.0f, -1.0f}},
        {{{{x0, y0, z1}, {x1, y0, z1}, {x1, y1, z1}, {x0, y1, z1}}}, {0.0f, 0.0f, 1.0f}},
        {{{{x0, y0, z0}, {x1, y0, z0}, {x1, y0, z1}, {x0, y0, z1}}}, {0.0f, -1.0f, 0.0f}},
        {{{{x0, y1, z0}, {x1, y1, z0}, {x1, y1, z1}, {x0, y1, z1}}}, {0.0f, 1.0f, 0.0f}},
        {{{{x0, y0, z0}, {x0, y1, z0}, {x0, y1, z1}, {x0, y0, z1}}}, {-1.0f, 0.0f, 0.0f}},
        {{{{x1, y0, z0}, {x1, y1, z0}, {x1, y1, z1}, {x1, y0, z1}}}, {1.0f, 0.0f, 0.0f}}
    }};

    for (const auto& face : faces) {
        const auto base = static_cast<std::uint32_t>(mesh.positions.size() / 3);
        for (const auto& corner : face.corners) {
            mesh.positions.insert(mesh.positions.end(), {corner[0], corner[1], corner[2]});
            mesh.normals.insert(mesh.normals.end(), {face.normal[0], face.normal[1], face.normal[2]});
            mesh.colors.insert(mesh.colors.end(), {0.2f, 0.72f, 1.0f, 1.0f});
        }
        mesh.indices.insert(mesh.indices.end(), {base, base + 1, base + 2, base, base + 2, base + 3});
    }
    return mesh;
}

// Produces the best available renderable mesh for a real body: OCCT
// tessellation when present, otherwise the synthetic box, otherwise the
// legacy demo fallback.
ViewportSolidMesh solidMeshForBody(const BRepBody& body, const std::string& token) {
#if AIM3D_HAS_OCCT
    if (body.kernelShapeHandle() && !body.kernelShapeHandle()->shape.IsNull()) {
        return meshFromOcctBody(body, token);
    }
#endif
    if (body.hasBox()) {
        return boxSolidMesh(body, token);
    }
    return fallbackSolidMesh(body.id(), token);
}

// Minimal JSON string escaper for tokens/labels (no control chars expected).
std::string jsonEscape(const std::string& value) {
    std::string out;
    out.reserve(value.size() + 2);
    for (char c : value) {
        switch (c) {
        case '"': out += "\\\""; break;
        case '\\': out += "\\\\"; break;
        case '\n': out += "\\n"; break;
        case '\t': out += "\\t"; break;
        default: out += c; break;
        }
    }
    return out;
}

std::string jsonNumber(double value) {
    if (value == static_cast<long long>(value)) {
        return std::to_string(static_cast<long long>(value));
    }
    std::string s = std::to_string(value);
    return s;
}

std::string floatArrayJson(const std::vector<float>& values) {
    std::string out = "[";
    for (std::size_t i = 0; i < values.size(); ++i) {
        if (i) out += ",";
        out += jsonNumber(static_cast<double>(values[i]));
    }
    out += "]";
    return out;
}

std::string uintArrayJson(const std::vector<std::uint32_t>& values) {
    std::string out = "[";
    for (std::size_t i = 0; i < values.size(); ++i) {
        if (i) out += ",";
        out += std::to_string(values[i]);
    }
    out += "]";
    return out;
}

std::string solidMeshJson(const ViewportSolidMesh& mesh) {
    std::string out = "{";
    out += "\"id\":\"" + jsonEscape(mesh.id) + "\",";
    out += "\"bodyId\":" + std::to_string(mesh.bodyId) + ",";
    out += "\"sourceToken\":\"" + jsonEscape(mesh.sourceToken) + "\",";
    out += "\"pickable\":{";
    out += "\"entityId\":\"" + jsonEscape(mesh.pickable.entityId) + "\",";
    out += "\"kind\":\"" + jsonEscape(mesh.pickable.kind) + "\",";
    out += "\"priority\":" + std::to_string(mesh.pickable.priority) + ",";
    out += "\"snapPoints\":[";
    for (std::size_t i = 0; i < mesh.pickable.snapPoints.size(); ++i) {
        const auto& sp = mesh.pickable.snapPoints[i];
        if (i) out += ",";
        out += "{\"id\":\"" + jsonEscape(sp.id) + "\",\"kind\":\"" + jsonEscape(sp.kind) + "\",";
        out += "\"position\":[" + jsonNumber(sp.position[0]) + "," + jsonNumber(sp.position[1]) + "," + jsonNumber(sp.position[2]) + "]}";
    }
    out += "]},";
    out += "\"positions\":" + floatArrayJson(mesh.positions) + ",";
    out += "\"normals\":" + floatArrayJson(mesh.normals) + ",";
    out += "\"colors\":" + floatArrayJson(mesh.colors) + ",";
    out += "\"indices\":" + uintArrayJson(mesh.indices) + ",";
    out += "\"transform\":[";
    for (std::size_t i = 0; i < mesh.transform.size(); ++i) {
        if (i) out += ",";
        out += jsonNumber(static_cast<double>(mesh.transform[i]));
    }
    out += "]}";
    return out;
}

ViewportToolpath fallbackToolpath() {
    ViewportToolpath toolpath;
    toolpath.id = "toolpath_op_Pocket_1";
    toolpath.operationId = "op_Pocket_1";
    toolpath.status = "Stale";
    toolpath.points = {
        -1.4f, -0.8f, 0.55f,
        -0.4f, -0.8f, 0.55f,
        -0.4f, 0.1f, 0.55f,
        0.8f, 0.1f, 0.55f,
        0.8f, 0.8f, 0.55f,
        1.4f, 0.8f, 0.55f
    };
    return toolpath;
}

std::vector<ViewportAxis> defaultAxes() {
    return {
        {"axis_x", "X", {0.95f, 0.18f, 0.2f, 1.0f}, {0.0f, 0.0f, 0.0f, 1.1f, 0.0f, 0.0f}},
        {"axis_y", "Y", {0.2f, 0.82f, 0.28f, 1.0f}, {0.0f, 0.0f, 0.0f, 0.0f, 1.1f, 0.0f}},
        {"axis_z", "Z", {0.28f, 0.48f, 1.0f, 1.0f}, {0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 1.1f}}
    };
}

#if AIM3D_HAS_OCCT
ViewportSolidMesh meshFromOcctBody(const BRepBody& body, const std::string& token) {
    ViewportSolidMesh mesh;
    mesh.id = "solid_" + std::to_string(body.id());
    mesh.bodyId = body.id();
    mesh.sourceToken = token;
    mesh.pickable.entityId = token;
    mesh.pickable.kind = "B-rep Exact Face";
    mesh.pickable.priority = 10;

    const auto kernelShape = body.kernelShapeHandle();
    if (!kernelShape || kernelShape->shape.IsNull()) {
        return mesh;
    }

    BRepMesh_IncrementalMesh mesher(kernelShape->shape, 0.5, false, 0.5, true);
    mesher.Perform();

    for (TopExp_Explorer explorer(kernelShape->shape, TopAbs_FACE); explorer.More(); explorer.Next()) {
        TopLoc_Location location;
        const auto face = TopoDS::Face(explorer.Current());
        const Handle(Poly_Triangulation) triangulation = BRep_Tool::Triangulation(face, location);
        if (triangulation.IsNull()) {
            continue;
        }

        const auto transform = location.Transformation();
        const auto baseIndex = static_cast<std::uint32_t>(mesh.positions.size() / 3);
        for (int nodeIndex = 1; nodeIndex <= triangulation->NbNodes(); ++nodeIndex) {
            const auto point = triangulation->Node(nodeIndex).Transformed(transform);
            mesh.positions.push_back(static_cast<float>(point.X()));
            mesh.positions.push_back(static_cast<float>(point.Y()));
            mesh.positions.push_back(static_cast<float>(point.Z()));
            mesh.normals.insert(mesh.normals.end(), {0.0f, 0.0f, 1.0f});
            mesh.colors.insert(mesh.colors.end(), {0.2f, 0.72f, 1.0f, 1.0f});
        }

        for (int triangleIndex = 1; triangleIndex <= triangulation->NbTriangles(); ++triangleIndex) {
            int a = 0;
            int b = 0;
            int c = 0;
            triangulation->Triangle(triangleIndex).Get(a, b, c);
            mesh.indices.push_back(baseIndex + static_cast<std::uint32_t>(a - 1));
            mesh.indices.push_back(baseIndex + static_cast<std::uint32_t>(b - 1));
            mesh.indices.push_back(baseIndex + static_cast<std::uint32_t>(c - 1));
        }
    }

    return mesh.indices.empty() ? fallbackSolidMesh(body.id(), token) : mesh;
}
#endif

} // namespace

BRepBody::BRepBody(EntityId id, const std::string& name) : m_id(id), m_name(name) {
    m_vertices = {
        0.0f, 0.0f, 0.0f,
        10.0f, 0.0f, 0.0f,
        0.0f, 10.0f, 0.0f
    };
}

const float* BRepBody::getVerticesBuffer(size_t& count) const {
    count = m_vertices.size();
    return m_vertices.data();
}

void BRepBody::setBox(const std::array<double, 3>& minCorner, const std::array<double, 3>& maxCorner) {
    m_boxMin = minCorner;
    m_boxMax = maxCorner;
    m_hasBox = true;
    m_shapeType = "Solid";
    m_vertices = {
        static_cast<float>(minCorner[0]), static_cast<float>(minCorner[1]), static_cast<float>(minCorner[2]),
        static_cast<float>(maxCorner[0]), static_cast<float>(minCorner[1]), static_cast<float>(minCorner[2]),
        static_cast<float>(maxCorner[0]), static_cast<float>(maxCorner[1]), static_cast<float>(minCorner[2]),
        static_cast<float>(minCorner[0]), static_cast<float>(maxCorner[1]), static_cast<float>(minCorner[2]),
        static_cast<float>(minCorner[0]), static_cast<float>(minCorner[1]), static_cast<float>(maxCorner[2]),
        static_cast<float>(maxCorner[0]), static_cast<float>(minCorner[1]), static_cast<float>(maxCorner[2]),
        static_cast<float>(maxCorner[0]), static_cast<float>(maxCorner[1]), static_cast<float>(maxCorner[2]),
        static_cast<float>(minCorner[0]), static_cast<float>(maxCorner[1]), static_cast<float>(maxCorner[2])
    };
}

BodyInspection BRepBody::inspect() const {
    BodyInspection inspection;
    inspection.id = m_id;
    inspection.name = m_name;
    inspection.sourceFormat = m_sourceFormat;
    inspection.shapeType = m_shapeType;

#if AIM3D_HAS_OCCT
    if (m_kernelShape && !m_kernelShape->shape.IsNull()) {
        inspection.faceCount = countSubShapes(m_kernelShape->shape, TopAbs_FACE);
        inspection.edgeCount = countSubShapes(m_kernelShape->shape, TopAbs_EDGE);
        inspection.vertexCount = countSubShapes(m_kernelShape->shape, TopAbs_VERTEX);

        Bnd_Box box;
        BRepBndLib::Add(m_kernelShape->shape, box);
        if (!box.IsVoid()) {
            box.Get(
                inspection.bounds.minX,
                inspection.bounds.minY,
                inspection.bounds.minZ,
                inspection.bounds.maxX,
                inspection.bounds.maxY,
                inspection.bounds.maxZ);
        }
        return inspection;
    }
#endif

    inspection.vertexCount = m_vertices.size() / 3;
    inspection.edgeCount = inspection.vertexCount;
    inspection.faceCount = inspection.vertexCount >= 3 ? 1 : 0;

    if (m_vertices.empty()) {
        return inspection;
    }

    inspection.bounds.minX = inspection.bounds.maxX = m_vertices[0];
    inspection.bounds.minY = inspection.bounds.maxY = m_vertices[1];
    inspection.bounds.minZ = inspection.bounds.maxZ = m_vertices[2];
    for (std::size_t i = 0; i + 2 < m_vertices.size(); i += 3) {
        inspection.bounds.minX = std::min<double>(inspection.bounds.minX, m_vertices[i]);
        inspection.bounds.minY = std::min<double>(inspection.bounds.minY, m_vertices[i + 1]);
        inspection.bounds.minZ = std::min<double>(inspection.bounds.minZ, m_vertices[i + 2]);
        inspection.bounds.maxX = std::max<double>(inspection.bounds.maxX, m_vertices[i]);
        inspection.bounds.maxY = std::max<double>(inspection.bounds.maxY, m_vertices[i + 1]);
        inspection.bounds.maxZ = std::max<double>(inspection.bounds.maxZ, m_vertices[i + 2]);
    }
    return inspection;
}

DesignProduct::DesignProduct() : DesignProduct(0) {}

DesignProduct::DesignProduct(EntityId rootComponentId) {
    m_rootComponent = std::make_shared<Component>(rootComponentId, "RootComponent");
}

Document::Document() : Document(0) {}

Document::Document(EntityId id) : m_id(id), m_filePath("Untitled.a3d") {
    m_design = std::make_shared<DesignProduct>(nextEntityId());
    m_cam = std::make_shared<CamProduct>();
}

Document::Document(const std::string& filePath) : Document(0, filePath) {}

Document::Document(EntityId id, const std::string& filePath) : m_id(id), m_filePath(filePath) {
    m_design = std::make_shared<DesignProduct>(nextEntityId());
    m_cam = std::make_shared<CamProduct>();
}

Document::~Document() {}

bool Document::save(const std::string& path) {
    std::lock_guard<std::mutex> lock(m_mutex);
    const auto format = detectFormat(path);
    if (format != GeometryFormat::Unknown) {
#if !AIM3D_HAS_OCCT
        throw std::runtime_error("aim3d was built without OCCT; geometry export is unavailable");
#else
        const auto shape = compoundFromBodies(m_design->rootComponent()->bRepBodies());
        writeOcctShape(shape, path, format);
#endif
    } else if (lowerExtension(path) == "a3d") {
        saveNativeDocument(path);
    } else {
        throw std::invalid_argument("Unsupported document save format: " + path);
    }

    m_filePath = path;
    m_dirty = false;
    std::cout << "[aim3d core] Saving document model to " << path << std::endl;
    return true;
}

std::shared_ptr<BRepBody> Document::importGeometry(const std::string& path) {
    std::lock_guard<std::mutex> lock(m_mutex);
    const auto format = detectFormat(path);
    if (format == GeometryFormat::Unknown) {
        throw std::invalid_argument("Unsupported geometry format for import: " + path);
    }

#if !AIM3D_HAS_OCCT
    throw std::runtime_error("aim3d was built without OCCT; geometry import is unavailable");
#else
    auto body = std::make_shared<BRepBody>(nextEntityId(), path);
    body->setSourceFormat(format);
    body->setShapeType(formatName(format));
    body->setKernelShape(readOcctShape(path, format));
    m_design->rootComponent()->addBody(body);
    registerBodyTopology(body);
    m_dirty = true;
    return body;
#endif
}

bool Document::replaceBodyGeometry(EntityId bodyId, const std::string& path) {
    std::lock_guard<std::mutex> lock(m_mutex);
    const auto format = detectFormat(path);
    if (format == GeometryFormat::Unknown) {
        throw std::invalid_argument("Unsupported geometry format for replacement: " + path);
    }

    for (const auto& body : m_design->rootComponent()->bRepBodies()) {
        if (!body || body->id() != bodyId) {
            continue;
        }

#if !AIM3D_HAS_OCCT
        throw std::runtime_error("aim3d was built without OCCT; geometry replacement is unavailable");
#else
        body->setName(path);
        body->setSourceFormat(format);
        body->setShapeType(formatName(format));
        body->setKernelShape(readOcctShape(path, format));
        m_topology.rebindOwnerRecords(bodyId, buildBodyTopologyRecords(*body));
        m_dirty = true;
        return true;
#endif
    }

    return false;
}

bool Document::applySplitEdit(EntityId bodyId, double splitX) {
    std::lock_guard<std::mutex> lock(m_mutex);
    return applySplitEditUnlocked(bodyId, splitX, "", nullptr);
}

bool Document::applyOffsetEdit(EntityId bodyId, double offset) {
    std::lock_guard<std::mutex> lock(m_mutex);
    return applyOffsetEditUnlocked(bodyId, offset, "", nullptr);
}

std::string Document::addSplitEditFeature(EntityId bodyId, double splitX) {
    std::lock_guard<std::mutex> lock(m_mutex);
    auto body = findBody(bodyId);
    if (!body) {
        throw std::invalid_argument("Cannot add split feature for unknown body");
    }
#if !AIM3D_HAS_OCCT
    (void)splitX;
    throw std::runtime_error("aim3d was built without OCCT; split edit features are unavailable");
#else
    auto sourceShape = cloneKernelShape(body->kernelShapeHandle());
    if (!sourceShape || sourceShape->shape.IsNull()) {
        throw std::runtime_error("Cannot add split feature without OCCT body geometry");
    }
    const auto featureId = m_history.addFeature("Split", splitX);
    m_topologyEditFeatures.push_back({featureId, TopologyEditType::Split, bodyId, splitX, sourceShape});
    return featureId;
#endif
}

std::string Document::addOffsetEditFeature(EntityId bodyId, double offset) {
    std::lock_guard<std::mutex> lock(m_mutex);
    auto body = findBody(bodyId);
    if (!body) {
        throw std::invalid_argument("Cannot add offset feature for unknown body");
    }
#if !AIM3D_HAS_OCCT
    (void)offset;
    throw std::runtime_error("aim3d was built without OCCT; offset edit features are unavailable");
#else
    auto sourceShape = cloneKernelShape(body->kernelShapeHandle());
    if (!sourceShape || sourceShape->shape.IsNull()) {
        throw std::runtime_error("Cannot add offset feature without OCCT body geometry");
    }
    const auto featureId = m_history.addFeature("Offset", offset);
    m_topologyEditFeatures.push_back({featureId, TopologyEditType::Offset, bodyId, offset, sourceShape});
    return featureId;
#endif
}

bool Document::recomputeHistory() {
    std::lock_guard<std::mutex> lock(m_mutex);
    const auto features = m_history.features();
    for (const auto& feature : features) {
        if (!feature.isDirty) {
            continue;
        }
        for (auto& edit : m_topologyEditFeatures) {
            if (edit.featureId != feature.id) {
                continue;
            }
            edit.value = feature.value;
            if (edit.type == TopologyEditType::Split) {
                applySplitEditUnlocked(edit.bodyId, edit.value, edit.featureId, edit.sourceShape);
            } else if (edit.type == TopologyEditType::Offset) {
                applyOffsetEditUnlocked(edit.bodyId, edit.value, edit.featureId, edit.sourceShape);
            }
        }
    }
    const bool ok = m_history.recomputeAll();
    if (ok) {
        m_dirty = true;
    }
    return ok;
}

bool Document::exportGeometry(const std::string& path) const {
    std::lock_guard<std::mutex> lock(m_mutex);
    const auto format = detectFormat(path);
    if (format == GeometryFormat::Unknown) {
        throw std::invalid_argument("Unsupported geometry format for export: " + path);
    }

#if !AIM3D_HAS_OCCT
    throw std::runtime_error("aim3d was built without OCCT; geometry export is unavailable");
#else
    const auto shape = compoundFromBodies(m_design->rootComponent()->bRepBodies());
    return writeOcctShape(shape, path, format);
#endif
}

std::vector<BodyInspection> Document::inspectBodies() const {
    std::lock_guard<std::mutex> lock(m_mutex);
    std::vector<BodyInspection> inspections;
    for (const auto& body : m_design->rootComponent()->bRepBodies()) {
        inspections.push_back(body->inspect());
    }
    return inspections;
}

namespace {
ViewportConstruction constructionViewportMesh(const ConstructionObject& con);
} // namespace

ViewportScene Document::viewportScene() const {
    std::lock_guard<std::mutex> lock(m_mutex);
    ViewportScene scene;

    for (const auto& body : m_design->rootComponent()->bRepBodies()) {
        if (!body) {
            continue;
        }
        const auto token = m_topology.makeSubshapeToken(body->id(), TopologyKind::Face, 0).value;
        scene.solids.push_back(solidMeshForBody(*body, token));
    }

    if (scene.solids.empty()) {
        scene.solids.push_back(fallbackSolidMesh(0, "feat_Extrude_1_face_0"));
    }

    scene.toolpaths.push_back(fallbackToolpath());
    scene.axes = defaultAxes();

    for (const auto& con : m_construction) {
        if (!con.visible) {
            continue;
        }
        scene.construction.push_back(constructionViewportMesh(con));
    }

    for (const auto& solid : scene.solids) {
        scene.diagnostics.triangleCount += solid.indices.size() / 3;
    }
    for (const auto& toolpath : scene.toolpaths) {
        scene.diagnostics.segmentCount += toolpath.points.size() >= 6 ? (toolpath.points.size() / 3) - 1 : 0;
    }
    scene.diagnostics.segmentCount += scene.axes.size();
    scene.diagnostics.segmentCount += scene.construction.size();
    scene.diagnostics.drawCount = (scene.solids.empty() ? 0 : 1) + (scene.toolpaths.empty() && scene.axes.empty() && scene.construction.empty() ? 0 : 1);
    return scene;
}

namespace {

std::string planeRefJson(const SketchPlaneReference& plane) {
    std::string out = "{\"kind\":\"";
    out += sketchPlaneKindName(plane.kind);
    out += "\"";
    switch (plane.kind) {
    case SketchPlaneKind::ConstructionPlane:
        out += ",\"constructionPlane\":\"" + jsonEscape(plane.constructionPlane.token) + "\"";
        break;
    case SketchPlaneKind::PlanarFace:
        out += ",\"face\":\"" + jsonEscape(plane.face.token) + "\"";
        break;
    case SketchPlaneKind::Origin:
    default:
        out += ",\"originPlane\":\"";
        out += originPlaneName(plane.originPlane);
        out += "\"";
        break;
    }
    out += "}";
    return out;
}

std::string sketchEntityJson(const SketchElement& entity) {
    std::string out = "{";
    out += "\"id\":\"" + jsonEscape(entity.ref.token) + "\",";
    out += "\"kind\":\"";
    out += sketchElementKindName(entity.kind);
    out += "\",";
    out += "\"points\":[";
    for (std::size_t i = 0; i < entity.points.size(); ++i) {
        if (i) out += ",";
        out += "[" + jsonNumber(entity.points[i][0]) + "," + jsonNumber(entity.points[i][1]) + "]";
    }
    out += "],";
    out += "\"radius\":" + jsonNumber(entity.radius) + ",";
    out += "\"value\":" + jsonNumber(entity.value) + ",";
    out += "\"construction\":" + std::string(entity.construction ? "true" : "false");
    if (!entity.label.empty()) {
        out += ",\"label\":\"" + jsonEscape(entity.label) + "\"";
    }
    out += "}";
    return out;
}

std::string constructionJson(const ConstructionObject& con) {
    std::string out = "{";
    out += "\"id\":\"" + jsonEscape(con.ref.token) + "\",";
    out += "\"kind\":\"";
    out += constructionKindName(con.kind);
    out += "\",";
    out += "\"category\":\"";
    out += constructionCategory(con.kind);
    out += "\",";
    out += "\"label\":\"" + jsonEscape(con.label) + "\",";
    out += "\"value\":" + jsonNumber(con.value) + ",";
    out += "\"visible\":" + std::string(con.visible ? "true" : "false") + ",";
    out += "\"origin\":[" + jsonNumber(con.origin[0]) + "," + jsonNumber(con.origin[1]) + "," + jsonNumber(con.origin[2]) + "],";
    out += "\"axisU\":[" + jsonNumber(con.axisU[0]) + "," + jsonNumber(con.axisU[1]) + "," + jsonNumber(con.axisU[2]) + "],";
    out += "\"axisV\":[" + jsonNumber(con.axisV[0]) + "," + jsonNumber(con.axisV[1]) + "," + jsonNumber(con.axisV[2]) + "],";
    out += "\"normal\":[" + jsonNumber(con.normal[0]) + "," + jsonNumber(con.normal[1]) + "," + jsonNumber(con.normal[2]) + "],";
    out += "\"extent\":" + jsonNumber(con.extent) + ",";
    out += "\"inputs\":[";
    for (std::size_t i = 0; i < con.inputs.size(); ++i) {
        if (i) out += ",";
        out += "\"" + jsonEscape(con.inputs[i]) + "\"";
    }
    out += "]}";
    return out;
}

void appendLine(std::vector<float>& points, float x0, float y0, float z0, float x1, float y1, float z1) {
    points.insert(points.end(), {x0, y0, z0, x1, y1, z1});
}

ViewportConstruction constructionViewportMesh(const ConstructionObject& con) {
    ViewportConstruction mesh;
    mesh.id = "construction_" + con.ref.token;
    mesh.token = con.ref.token;
    mesh.category = constructionCategory(con.kind);
    mesh.kind = constructionKindName(con.kind);
    mesh.visible = con.visible;

    const float ox = static_cast<float>(con.origin[0]);
    const float oy = static_cast<float>(con.origin[1]);
    const float oz = static_cast<float>(con.origin[2]);
    const float ux = static_cast<float>(con.axisU[0]);
    const float uy = static_cast<float>(con.axisU[1]);
    const float uz = static_cast<float>(con.axisU[2]);
    const float vx = static_cast<float>(con.axisV[0]);
    const float vy = static_cast<float>(con.axisV[1]);
    const float vz = static_cast<float>(con.axisV[2]);
    const float e = static_cast<float>(con.extent);

    if (mesh.category == std::string("plane") || con.kind == ConstructionKind::UCS) {
        mesh.color = {0.35f, 0.72f, 1.0f, 0.9f};
        const float corners[4][3] = {
            {ox - ux * e - vx * e, oy - uy * e - vy * e, oz - uz * e - vz * e},
            {ox + ux * e - vx * e, oy + uy * e - vy * e, oz + uz * e - vz * e},
            {ox + ux * e + vx * e, oy + uy * e + vy * e, oz + uz * e + vz * e},
            {ox - ux * e + vx * e, oy - uy * e + vy * e, oz - uz * e + vz * e},
        };
        for (int i = 0; i < 4; ++i) {
            const int j = (i + 1) % 4;
            appendLine(mesh.points, corners[i][0], corners[i][1], corners[i][2], corners[j][0], corners[j][1], corners[j][2]);
        }
        appendLine(mesh.points, corners[0][0], corners[0][1], corners[0][2], corners[2][0], corners[2][1], corners[2][2]);
        appendLine(mesh.points, corners[1][0], corners[1][1], corners[1][2], corners[3][0], corners[3][1], corners[3][2]);
        if (con.kind == ConstructionKind::UCS) {
            mesh.color = {1.0f, 0.55f, 0.2f, 1.0f};
            appendLine(mesh.points, ox, oy, oz, ox + ux, oy + uy, oz + uz);
            appendLine(mesh.points, ox, oy, oz, ox + vx, oy + vy, oz + vz);
            appendLine(mesh.points, ox, oy, oz, ox + static_cast<float>(con.normal[0]), oy + static_cast<float>(con.normal[1]), oz + static_cast<float>(con.normal[2]));
        }
        return mesh;
    }

    if (mesh.category == std::string("axis")) {
        mesh.color = {0.95f, 0.85f, 0.25f, 1.0f};
        appendLine(mesh.points, ox - ux * e, oy - uy * e, oz - uz * e, ox + ux * e, oy + uy * e, oz + uz * e);
        return mesh;
    }

    if (mesh.category == std::string("point")) {
        mesh.color = {1.0f, 0.45f, 0.2f, 1.0f};
        const float s = e;
        appendLine(mesh.points, ox - s, oy, oz, ox + s, oy, oz);
        appendLine(mesh.points, ox, oy - s, oz, ox, oy + s, oz);
        appendLine(mesh.points, ox, oy, oz - s, ox, oy, oz + s);
        return mesh;
    }

    return mesh;
}

std::string constructionViewportJson(const ViewportConstruction& mesh) {
    std::string out = "{";
    out += "\"id\":\"" + jsonEscape(mesh.id) + "\",";
    out += "\"token\":\"" + jsonEscape(mesh.token) + "\",";
    out += "\"category\":\"" + jsonEscape(mesh.category) + "\",";
    out += "\"kind\":\"" + jsonEscape(mesh.kind) + "\",";
    out += "\"visible\":" + std::string(mesh.visible ? "true" : "false") + ",";
    out += "\"color\":[";
    for (std::size_t i = 0; i < mesh.color.size(); ++i) {
        if (i) out += ",";
        out += jsonNumber(static_cast<double>(mesh.color[i]));
    }
    out += "],";
    out += "\"points\":" + floatArrayJson(mesh.points);
    out += "}";
    return out;
}

} // namespace

std::string Document::addSketch(const SketchPlaneReference& plane) {
    std::lock_guard<std::mutex> lock(m_mutex);
    SketchFeature sketch;
    sketch.ref.id = nextEntityId();
    sketch.ref.token = "feat_Sketch_" + std::to_string(++m_sketchCount);
    sketch.plane = plane;
    m_sketches.push_back(sketch);
    m_timeline.push_back({TimelineCategory::Sketch, sketch.ref.token});
    m_history.addFeature("Sketch", 0.0);
    m_dirty = true;
    return sketch.ref.token;
}

std::string Document::addSketch(const std::string& plane) {
    SketchPlaneReference ref;
    ref.kind = SketchPlaneKind::Origin;
    ref.originPlane = originPlaneFromName(plane);
    return addSketch(ref);
}

std::string Document::addSketchEntity(const std::string& sketchToken, const SketchElement& element) {
    std::lock_guard<std::mutex> lock(m_mutex);
    auto* sketch = findSketchByToken(sketchToken);
    if (!sketch) {
        return {};
    }
    SketchElement stored = element;
    stored.ref.id = nextEntityId();
    if (stored.ref.token.empty()) {
        stored.ref.token = "sk_ent_" + std::to_string(++m_sketchEntityCount);
    }
    sketch->entities.push_back(stored);
    m_dirty = true;
    return stored.ref.token;
}

bool Document::addRectangleToSketch(const std::string& sketchToken, double x0, double y0, double x1, double y1) {
    const double minX = std::min(x0, x1);
    const double minY = std::min(y0, y1);
    const double maxX = std::max(x0, x1);
    const double maxY = std::max(y0, y1);
    if (maxX <= minX || maxY <= minY) {
        return false;
    }
    SketchElement rect;
    rect.kind = SketchElementKind::Rectangle2Point;
    rect.points = {{minX, minY}, {maxX, maxY}};
    return !addSketchEntity(sketchToken, rect).empty();
}

bool Document::sketchRectangleBounds(const SketchFeature& sketch, std::array<double, 4>& bounds) const {
    for (const auto& entity : sketch.entities) {
        const bool isRect = entity.kind == SketchElementKind::Rectangle2Point
            || entity.kind == SketchElementKind::Rectangle3Point
            || entity.kind == SketchElementKind::RectangleCenter;
        if (!isRect || entity.points.size() < 2 || entity.construction) {
            continue;
        }
        double minX = entity.points[0][0];
        double minY = entity.points[0][1];
        double maxX = minX;
        double maxY = minY;
        for (const auto& point : entity.points) {
            minX = std::min(minX, point[0]);
            minY = std::min(minY, point[1]);
            maxX = std::max(maxX, point[0]);
            maxY = std::max(maxY, point[1]);
        }
        if (maxX > minX && maxY > minY) {
            bounds = {minX, minY, maxX, maxY};
            return true;
        }
    }
    return false;
}

EntityId Document::evaluateExtrudeBody(const SketchFeature& sketch, double distance) {
    std::array<double, 4> rect{};
    if (!sketchRectangleBounds(sketch, rect)) {
        return 0;
    }
    const double zLow = std::min(0.0, distance);
    const double zHigh = std::max(0.0, distance);

    auto body = std::make_shared<BRepBody>(
        nextEntityId(),
        "Body" + std::to_string(m_design->rootComponent()->bRepBodies().size() + 1));
    body->setBox({rect[0], rect[1], zLow}, {rect[2], rect[3], zHigh});

#if AIM3D_HAS_OCCT
    const gp_Pnt corner(rect[0], rect[1], zLow);
    const auto solid = BRepPrimAPI_MakeBox(
        corner,
        rect[2] - rect[0],
        rect[3] - rect[1],
        zHigh - zLow).Shape();
    if (!solid.IsNull()) {
        body->setKernelShape(makeKernelShape(solid));
        body->setShapeType("Solid");
    }
#endif

    m_design->rootComponent()->addBody(body);
    registerBodyTopology(body);
    return body->id();
}

std::string Document::addSolidFeature(
    SolidFeatureKind kind,
    const std::string& sketchToken,
    double value,
    FeatureOperation operation) {
    std::lock_guard<std::mutex> lock(m_mutex);
    auto* sketch = findSketchByToken(sketchToken);
    if (!sketch) {
        throw std::invalid_argument("addSolidFeature: unknown sketch token " + sketchToken);
    }

    SolidFeature feature;
    feature.ref.id = nextEntityId();
    feature.kind = kind;
    feature.operation = operation;
    feature.profile.sketchToken = sketchToken;
    feature.profile.profileIndex = 0;
    feature.sketchId = sketch->ref.id;
    feature.value = value;
    feature.unit = "mm";

    const int kindIndex = static_cast<int>(kind);
    const std::string kindName = solidFeatureKindName(kind);
    feature.ref.token = "feat_" + kindName + "_" + std::to_string(++m_solidCounts[kindIndex]);
    feature.label = kindName + std::to_string(m_solidCounts[kindIndex]);

    // Only the rectangle-profile extrude path produces real geometry today.
    // Other kinds are recorded on the timeline with stub evaluators.
    if (kind == SolidFeatureKind::Extrude) {
        if (value == 0.0) {
            throw std::invalid_argument("addExtrude: distance must be non-zero");
        }
        feature.bodyId = evaluateExtrudeBody(*sketch, value);
    }

    m_solids.push_back(feature);
    m_timeline.push_back({TimelineCategory::Solid, feature.ref.token});
    m_history.addFeature(kindName, value);
    m_dirty = true;
    return feature.ref.token;
}

std::string Document::addExtrude(const std::string& sketchToken, double distance, FeatureOperation operation) {
    return addSolidFeature(SolidFeatureKind::Extrude, sketchToken, distance, operation);
}

std::string Document::addConstructionObject(
    ConstructionKind kind,
    const std::vector<std::string>& inputs,
    double value) {
    std::lock_guard<std::mutex> lock(m_mutex);
    ConstructionObject con;
    con.ref.id = nextEntityId();
    con.kind = kind;
    con.inputs = inputs;
    con.value = value;

    const std::string category = constructionCategory(kind);
    int number = 0;
    std::string tokenPrefix;
    std::string labelPrefix;
    if (kind == ConstructionKind::UCS) {
        number = ++m_constructionUcsCount;
        tokenPrefix = "Ucs";
        labelPrefix = "UCS ";
    } else if (category == std::string("plane")) {
        number = ++m_constructionPlaneCount;
        tokenPrefix = "Plane";
        labelPrefix = "Plane ";
    } else if (category == std::string("axis")) {
        number = ++m_constructionAxisCount;
        tokenPrefix = "Axis";
        labelPrefix = "Axis ";
    } else if (category == std::string("point")) {
        number = ++m_constructionPointCount;
        tokenPrefix = "Point";
        labelPrefix = "Point ";
    } else {
        number = ++m_constructionPlaneCount;
        tokenPrefix = "Plane";
        labelPrefix = "Plane ";
    }

    con.ref.token = "con_" + tokenPrefix + "_" + std::to_string(number);
    con.label = labelPrefix + std::to_string(number);
    evaluateConstructionGeometry(con);

    m_construction.push_back(con);
    m_dirty = true;
    return con.ref.token;
}

std::vector<TimelineFeatureInfo> Document::features() const {
    std::lock_guard<std::mutex> lock(m_mutex);
    std::vector<TimelineFeatureInfo> infos;
    infos.reserve(m_timeline.size());
    for (const auto& entry : m_timeline) {
        if (entry.category == TimelineCategory::Sketch) {
            for (const auto& sketch : m_sketches) {
                if (sketch.ref.token == entry.token) {
                    infos.push_back({sketch.ref.token, "Sketch", sketch.ref.token, 0.0, "mm", false});
                    break;
                }
            }
        } else {
            for (const auto& solid : m_solids) {
                if (solid.ref.token == entry.token) {
                    infos.push_back({
                        solid.ref.token,
                        solidFeatureKindName(solid.kind),
                        solid.label,
                        solid.value,
                        solid.unit,
                        solid.dirty});
                    break;
                }
            }
        }
    }
    return infos;
}

std::vector<SketchFeature> Document::sketches() const {
    std::lock_guard<std::mutex> lock(m_mutex);
    return m_sketches;
}

std::vector<SolidFeature> Document::solidFeatures() const {
    std::lock_guard<std::mutex> lock(m_mutex);
    return m_solids;
}

std::vector<ConstructionObject> Document::constructionObjects() const {
    std::lock_guard<std::mutex> lock(m_mutex);
    return m_construction;
}

SketchFeature* Document::findSketchByToken(const std::string& token) {
    for (auto& sketch : m_sketches) {
        if (sketch.ref.token == token) {
            return &sketch;
        }
    }
    return nullptr;
}

const SketchFeature* Document::findSketchByToken(const std::string& token) const {
    for (const auto& sketch : m_sketches) {
        if (sketch.ref.token == token) {
            return &sketch;
        }
    }
    return nullptr;
}

SolidFeature* Document::findSolidByToken(const std::string& token) {
    for (auto& solid : m_solids) {
        if (solid.ref.token == token) {
            return &solid;
        }
    }
    return nullptr;
}

std::string Document::coreStateSnapshot() const {
    std::lock_guard<std::mutex> lock(m_mutex);
    return coreStateSnapshotUnlocked();
}

std::string Document::coreStateSnapshotUnlocked() const {
    std::string out = "{";
    out += "\"schemaVersion\":2,";
    out += "\"activeDocumentId\":\"doc_" + std::to_string(m_id) + "\",";
    out += "\"documentPath\":\"" + jsonEscape(m_filePath) + "\",";

    // Flat timeline projection (back-compatible field set + plane/operation).
    out += "\"features\":[";
    bool firstFeature = true;
    for (const auto& entry : m_timeline) {
        if (entry.category == TimelineCategory::Sketch) {
            const SketchFeature* sketch = nullptr;
            for (const auto& candidate : m_sketches) {
                if (candidate.ref.token == entry.token) { sketch = &candidate; break; }
            }
            if (!sketch) continue;
            if (!firstFeature) out += ",";
            firstFeature = false;
            out += "{";
            out += "\"id\":\"" + jsonEscape(sketch->ref.token) + "\",";
            out += "\"type\":\"Sketch\",";
            out += "\"label\":\"" + jsonEscape(sketch->ref.token) + "\",";
            out += "\"value\":0,";
            out += "\"unit\":\"mm\",";
            out += "\"isDirty\":false,";
            out += "\"plane\":" + planeRefJson(sketch->plane) + ",";
            out += "\"entityCount\":" + std::to_string(sketch->entities.size()) + ",";
            out += "\"selectionToken\":\"" + jsonEscape(sketch->ref.token + "_face_0") + "\"";
            out += "}";
        } else {
            const SolidFeature* solid = nullptr;
            for (const auto& candidate : m_solids) {
                if (candidate.ref.token == entry.token) { solid = &candidate; break; }
            }
            if (!solid) continue;
            if (!firstFeature) out += ",";
            firstFeature = false;
            out += "{";
            out += "\"id\":\"" + jsonEscape(solid->ref.token) + "\",";
            out += "\"type\":\"" + std::string(solidFeatureKindName(solid->kind)) + "\",";
            out += "\"label\":\"" + jsonEscape(solid->label) + "\",";
            out += "\"value\":" + jsonNumber(solid->value) + ",";
            out += "\"unit\":\"" + jsonEscape(solid->unit) + "\",";
            out += "\"isDirty\":" + std::string(solid->dirty ? "true" : "false") + ",";
            out += "\"operation\":\"" + std::string(featureOperationName(solid->operation)) + "\",";
            out += "\"sketchId\":\"" + jsonEscape(solid->profile.sketchToken) + "\",";
            out += "\"selectionToken\":\"" + jsonEscape(solid->ref.token + "_face_0") + "\"";
            out += "}";
        }
    }
    out += "],";

    // Hierarchical browser tree (Origin, construction, sketches, bodies).
    out += "\"browser\":{";
    out += "\"origin\":{\"planes\":[\"origin_XY\",\"origin_XZ\",\"origin_YZ\"],\"visible\":true},";
    out += "\"construction\":[";
    for (std::size_t i = 0; i < m_construction.size(); ++i) {
        if (i) out += ",";
        out += constructionJson(m_construction[i]);
    }
    out += "],";
    out += "\"sketches\":[";
    for (std::size_t i = 0; i < m_sketches.size(); ++i) {
        const auto& sketch = m_sketches[i];
        if (i) out += ",";
        out += "{";
        out += "\"id\":\"" + jsonEscape(sketch.ref.token) + "\",";
        out += "\"plane\":" + planeRefJson(sketch.plane) + ",";
        out += "\"visible\":" + std::string(sketch.visible ? "true" : "false") + ",";
        out += "\"entities\":[";
        for (std::size_t j = 0; j < sketch.entities.size(); ++j) {
            if (j) out += ",";
            out += sketchEntityJson(sketch.entities[j]);
        }
        out += "]}";
    }
    out += "],";
    out += "\"bodies\":[";
    {
        bool firstBody = true;
        for (const auto& body : m_design->rootComponent()->bRepBodies()) {
            if (!body) continue;
            std::string sourceFeature;
            for (const auto& solid : m_solids) {
                if (solid.bodyId == body->id()) { sourceFeature = solid.ref.token; break; }
            }
            if (!firstBody) out += ",";
            firstBody = false;
            out += "{";
            out += "\"id\":\"body_" + std::to_string(body->id()) + "\",";
            out += "\"name\":\"" + jsonEscape(body->name()) + "\",";
            out += "\"sourceFeature\":\"" + jsonEscape(sourceFeature) + "\"";
            out += "}";
        }
    }
    out += "]},";

    // Viewport scene (only evaluated solid features produce geometry).
    out += "\"viewportScene\":{\"solids\":[";
    bool firstSolid = true;
    for (const auto& solid : m_solids) {
        if (solid.bodyId == 0) {
            continue;
        }
        auto body = findBody(solid.bodyId);
        if (!body) {
            continue;
        }
        if (!firstSolid) out += ",";
        firstSolid = false;
        out += solidMeshJson(solidMeshForBody(*body, solid.ref.token + "_face_0"));
    }
    out += "],\"toolpaths\":[],\"construction\":[";
    bool firstConstruction = true;
    for (const auto& con : m_construction) {
        if (!con.visible) {
            continue;
        }
        if (!firstConstruction) out += ",";
        firstConstruction = false;
        out += constructionViewportJson(constructionViewportMesh(con));
    }
    out += "]}";

    out += "}";
    return out;
}

std::shared_ptr<BRepBody> Document::findBody(EntityId bodyId) const {
    for (const auto& body : m_design->rootComponent()->bRepBodies()) {
        if (body && body->id() == bodyId) {
            return body;
        }
    }
    return nullptr;
}

bool Document::applySplitEditUnlocked(EntityId bodyId, double splitX, const std::string& featureId, std::shared_ptr<KernelShape> sourceShape) {
    auto body = findBody(bodyId);
    if (!body) {
        return false;
    }
#if !AIM3D_HAS_OCCT
    (void)splitX;
    (void)featureId;
    (void)sourceShape;
    throw std::runtime_error("aim3d was built without OCCT; split edits are unavailable");
#else
    const auto source = sourceShape ? sourceShape : body->kernelShapeHandle();
    if (!source || source->shape.IsNull()) {
        throw std::runtime_error("Cannot split body without OCCT geometry");
    }
    body->setKernelShape(makeKernelShape(splitShapeAtX(source->shape, splitX)));
    auto records = buildBodyTopologyRecords(*body);
    for (auto& record : records) {
        record.featureId = featureId;
    }
    m_topology.rebindOwnerRecords(bodyId, records);
    m_dirty = true;
    return true;
#endif
}

bool Document::applyOffsetEditUnlocked(EntityId bodyId, double offset, const std::string& featureId, std::shared_ptr<KernelShape> sourceShape) {
    auto body = findBody(bodyId);
    if (!body) {
        return false;
    }
#if !AIM3D_HAS_OCCT
    (void)offset;
    (void)featureId;
    (void)sourceShape;
    throw std::runtime_error("aim3d was built without OCCT; offset edits are unavailable");
#else
    const auto source = sourceShape ? sourceShape : body->kernelShapeHandle();
    if (!source || source->shape.IsNull()) {
        throw std::runtime_error("Cannot offset body without OCCT geometry");
    }
    body->setKernelShape(makeKernelShape(offsetShape(source->shape, offset)));
    auto records = buildBodyTopologyRecords(*body);
    for (auto& record : records) {
        record.featureId = featureId;
    }
    m_topology.rebindOwnerRecords(bodyId, records);
    m_dirty = true;
    return true;
#endif
}

void Document::registerBodyTopology(const std::shared_ptr<BRepBody>& body) {
    if (!body) {
        return;
    }
    m_topology.replaceRecordsForOwner(body->id(), buildBodyTopologyRecords(*body));
}

std::vector<TopologyRecord> Document::buildBodyTopologyRecords(const BRepBody& body) const {
    std::vector<TopologyRecord> records;

    TopologyRecord bodyRecord;
    bodyRecord.token = m_topology.makeBodyToken(body.id());
    bodyRecord.kind = TopologyKind::Body;
    bodyRecord.ownerId = body.id();
    bodyRecord.ordinal = 0;

#if AIM3D_HAS_OCCT
    if (body.kernelShapeHandle() && !body.kernelShapeHandle()->shape.IsNull()) {
        bodyRecord.signature = signatureFromShape(body.kernelShapeHandle()->shape, TopologyKind::Body);
        records.push_back(bodyRecord);

        std::size_t ordinal = 0;
        for (TopExp_Explorer explorer(body.kernelShapeHandle()->shape, TopAbs_FACE); explorer.More(); explorer.Next()) {
            TopologyRecord record;
            record.token = m_topology.makeSubshapeToken(body.id(), TopologyKind::Face, ordinal);
            record.kind = TopologyKind::Face;
            record.ownerId = body.id();
            record.ordinal = ordinal;
            record.signature = signatureFromShape(explorer.Current(), TopologyKind::Face);
            records.push_back(record);
            ordinal++;
        }

        ordinal = 0;
        for (TopExp_Explorer explorer(body.kernelShapeHandle()->shape, TopAbs_EDGE); explorer.More(); explorer.Next()) {
            TopologyRecord record;
            record.token = m_topology.makeSubshapeToken(body.id(), TopologyKind::Edge, ordinal);
            record.kind = TopologyKind::Edge;
            record.ownerId = body.id();
            record.ordinal = ordinal;
            record.signature = signatureFromShape(explorer.Current(), TopologyKind::Edge);
            records.push_back(record);
            ordinal++;
        }

        ordinal = 0;
        for (TopExp_Explorer explorer(body.kernelShapeHandle()->shape, TopAbs_VERTEX); explorer.More(); explorer.Next()) {
            TopologyRecord record;
            record.token = m_topology.makeSubshapeToken(body.id(), TopologyKind::Vertex, ordinal);
            record.kind = TopologyKind::Vertex;
            record.ownerId = body.id();
            record.ordinal = ordinal;
            record.signature = signatureFromShape(explorer.Current(), TopologyKind::Vertex);
            records.push_back(record);
            ordinal++;
        }
        return records;
    }
#endif

    records.push_back(bodyRecord);
    return records;
}

EntityId Document::nextEntityId() {
    return m_nextEntityId++;
}

GeometryFormat Document::detectFormat(const std::string& path) {
    const auto ext = lowerExtension(path);
    if (ext == "step" || ext == "stp") {
        return GeometryFormat::Step;
    }
    if (ext == "iges" || ext == "igs") {
        return GeometryFormat::Iges;
    }
    if (ext == "brep") {
        return GeometryFormat::Brep;
    }
    return GeometryFormat::Unknown;
}

const char* Document::formatName(GeometryFormat format) {
    switch (format) {
    case GeometryFormat::Step:
        return "STEP";
    case GeometryFormat::Iges:
        return "IGES";
    case GeometryFormat::Brep:
        return "BREP";
    case GeometryFormat::Unknown:
        return "Unknown";
    }
    return "Unknown";
}

bool Document::saveNativeDocument(const std::string& path) const {
    std::ofstream out(path);
    if (!out) {
        throw std::runtime_error("Unable to open document for writing: " + path);
    }

    out << "aim3d_document_version=1\n";
    out << "document_id=" << m_id << "\n";
    out << "file_path=" << path << "\n";
    out << "body_count=" << m_design->rootComponent()->bRepBodies().size() << "\n";
    for (const auto& body : m_design->rootComponent()->bRepBodies()) {
        const auto inspection = body->inspect();
        out << "body=" << inspection.id << "," << inspection.name << ","
            << formatName(inspection.sourceFormat) << ","
            << inspection.faceCount << "," << inspection.edgeCount << ","
            << inspection.vertexCount << "\n";
    }

    if (!out) {
        throw std::runtime_error("Failed while writing document: " + path);
    }
    return true;
}

} // namespace aim3d
