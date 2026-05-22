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

BRepBody::BRepBody(EntityId id, const std::string& name) : m_id(id), m_name(name) {}

const float* BRepBody::getVerticesBuffer(size_t& count) const {
    count = m_vertices.size();
    return m_vertices.data();
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

ViewportScene Document::viewportScene() const {
    std::lock_guard<std::mutex> lock(m_mutex);
    ViewportScene scene;

    for (const auto& body : m_design->rootComponent()->bRepBodies()) {
        if (!body) {
            continue;
        }
        const auto token = m_topology.makeSubshapeToken(body->id(), TopologyKind::Face, 0).value;
#if AIM3D_HAS_OCCT
        scene.solids.push_back(meshFromOcctBody(*body, token));
#else
        scene.solids.push_back(fallbackSolidMesh(body->id(), token));
#endif
    }

    if (scene.solids.empty()) {
        scene.solids.push_back(fallbackSolidMesh(0, "feat_Extrude_1_face_0"));
    }

    scene.toolpaths.push_back(fallbackToolpath());
    scene.axes = defaultAxes();

    for (const auto& solid : scene.solids) {
        scene.diagnostics.triangleCount += solid.indices.size() / 3;
    }
    for (const auto& toolpath : scene.toolpaths) {
        scene.diagnostics.segmentCount += toolpath.points.size() >= 6 ? (toolpath.points.size() / 3) - 1 : 0;
    }
    scene.diagnostics.segmentCount += scene.axes.size();
    scene.diagnostics.drawCount = (scene.solids.empty() ? 0 : 1) + (scene.toolpaths.empty() && scene.axes.empty() ? 0 : 1);
    return scene;
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
