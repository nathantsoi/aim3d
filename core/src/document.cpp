#include "aim3d/document.hpp"
#include <algorithm>
#include <cctype>
#include <fstream>
#include <iostream>
#include <stdexcept>

#if AIM3D_HAS_OCCT
#include <BRep_Builder.hxx>
#include <BRepBndLib.hxx>
#include <BRepTools.hxx>
#include <Bnd_Box.hxx>
#include <IGESControl_Reader.hxx>
#include <IGESControl_Writer.hxx>
#include <IFSelect_ReturnStatus.hxx>
#include <STEPControl_Reader.hxx>
#include <STEPControl_Writer.hxx>
#include <TopAbs_ShapeEnum.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS_Compound.hxx>
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
    m_dirty = true;
    return body;
#endif
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
