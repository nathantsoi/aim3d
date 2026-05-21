#include "aim3d/application.hpp"
#include "aim3d/document.hpp"

#include <atomic>
#include <cassert>
#include <filesystem>
#include <fstream>
#include <stdexcept>
#include <string>

#if AIM3D_HAS_OCCT
#include <BRepPrimAPI_MakeBox.hxx>
#include <BRepTools.hxx>
#endif

namespace {

std::filesystem::path test_dir() {
    auto dir = std::filesystem::temp_directory_path() / "aim3d-a1-tests";
    std::filesystem::create_directories(dir);
    return dir;
}

#if AIM3D_HAS_OCCT
std::string write_box_fixture(const std::string& name) {
    const auto path = test_dir() / name;
    const auto box = BRepPrimAPI_MakeBox(10.0, 20.0, 30.0).Shape();
    assert(BRepTools::Write(box, path.string().c_str()));
    return path.string();
}
#endif

void test_document_lifecycle() {
    aim3d::Application app;
    assert(app.isHeadless());
    assert(app.activeDocument() == nullptr);
    assert(app.documents().empty());

    auto doc = app.createDocument();
    assert(doc != nullptr);
    assert(doc->id() > 0);
    assert(app.activeDocument() == doc);
    assert(app.documents().size() == 1);
    assert(doc->filePath() == "Untitled.a3d");
    assert(doc->inspectBodies().empty());

    const auto savePath = (test_dir() / "aim3d-test.a3d").string();
    assert(doc->save(savePath));
    assert(doc->filePath() == savePath);
    assert(!doc->isDirty());
    assert(std::filesystem::exists(savePath));

    assert(app.closeDocument(doc));
    assert(app.activeDocument() == nullptr);
    assert(app.documents().empty());
}

#if AIM3D_HAS_OCCT
void test_body_import_and_inspection() {
    aim3d::Application app;
    auto doc = app.createDocument();
    const auto fixturePath = write_box_fixture("fixture.brep");

    const auto initial = doc->inspectBodies();
    assert(initial.empty());

    auto imported = doc->importGeometry(fixturePath);
    assert(imported != nullptr);
    assert(imported->id() > 0);
    assert(doc->isDirty());

    const auto inspected = doc->inspectBodies();
    assert(inspected.size() == 1);
    assert(inspected[0].sourceFormat == aim3d::GeometryFormat::Brep);
    assert(inspected[0].shapeType == "BREP");
    assert(inspected[0].faceCount == 6);
    assert(inspected[0].edgeCount >= 12);
    assert(inspected[0].vertexCount >= 8);
    assert(inspected[0].bounds.maxX >= 10.0);
    assert(inspected[0].bounds.maxY >= 20.0);
    assert(inspected[0].bounds.maxZ >= 30.0);
}

void test_geometry_export_round_trips() {
    aim3d::Application app;
    auto doc = app.createDocument();
    doc->importGeometry(write_box_fixture("export-source.brep"));

    const auto brepPath = (test_dir() / "roundtrip.brep").string();
    const auto stepPath = (test_dir() / "roundtrip.step").string();
    const auto igesPath = (test_dir() / "roundtrip.iges").string();

    assert(doc->exportGeometry(brepPath));
    assert(doc->exportGeometry(stepPath));
    assert(doc->exportGeometry(igesPath));
    assert(std::filesystem::exists(brepPath));
    assert(std::filesystem::exists(stepPath));
    assert(std::filesystem::exists(igesPath));

    auto brepDoc = app.createDocument();
    brepDoc->importGeometry(brepPath);
    assert(brepDoc->inspectBodies()[0].faceCount == 6);

    auto stepDoc = app.createDocument();
    stepDoc->importGeometry(stepPath);
    assert(stepDoc->inspectBodies()[0].faceCount > 0);

    auto igesDoc = app.createDocument();
    igesDoc->importGeometry(igesPath);
    assert(igesDoc->inspectBodies()[0].faceCount > 0);
}

void test_save_by_extension() {
    aim3d::Application app;
    auto doc = app.createDocument();
    doc->importGeometry(write_box_fixture("save-source.brep"));
    assert(doc->isDirty());

    const auto nativePath = (test_dir() / "saved.a3d").string();
    assert(doc->save(nativePath));
    assert(!doc->isDirty());
    std::ifstream nativeFile(nativePath);
    std::string firstLine;
    std::getline(nativeFile, firstLine);
    assert(firstLine == "aim3d_document_version=1");

    const auto stepPath = (test_dir() / "saved.step").string();
    assert(doc->save(stepPath));
    assert(doc->filePath() == stepPath);
    assert(std::filesystem::exists(stepPath));
}

void test_async_geometry_tasks() {
    aim3d::Application app;
    auto doc = app.createDocument();
    const auto fixturePath = write_box_fixture("async-fixture.brep");
    std::atomic<int> completedEvents{0};

    app.registerEventCallback("GEOMETRY_TASK_COMPLETED", [&](const std::string&, const std::string&) {
        completedEvents++;
    });

    const auto importTask = app.importGeometryAsync(doc, fixturePath);
    assert(app.waitForTask(importTask));
    const auto importSnapshot = app.taskSnapshot(importTask);
    assert(importSnapshot.status == aim3d::TaskStatus::Completed);

    const auto inspectTask = app.inspectBodiesAsync(doc);
    assert(app.waitForTask(inspectTask));
    const auto inspectSnapshot = app.taskSnapshot(inspectTask);
    assert(inspectSnapshot.status == aim3d::TaskStatus::Completed);
    assert(completedEvents == 2);
}

void test_open_document_imports_exchange_geometry() {
    aim3d::Application app;
    const auto fixturePath = write_box_fixture("open-fixture.brep");
    auto doc = app.openDocument(fixturePath);
    assert(app.activeDocument() == doc);
    assert(doc->inspectBodies().size() == 1);
    assert(doc->inspectBodies()[0].faceCount == 6);
}
#else
void test_occt_required_for_geometry_exchange() {
    aim3d::Application app;
    auto doc = app.createDocument();
    bool failed = false;
    try {
        doc->importGeometry("fixture.brep");
    } catch (const std::runtime_error&) {
        failed = true;
    }
    assert(failed);
}
#endif

void test_unsupported_geometry_extension_fails() {
    aim3d::Application app;
    auto doc = app.createDocument();
    bool failed = false;
    try {
        doc->importGeometry("fixture.obj");
    } catch (const std::invalid_argument&) {
        failed = true;
    }
    assert(failed);
}

}

int main() {
    test_document_lifecycle();
#if AIM3D_HAS_OCCT
    test_body_import_and_inspection();
    test_geometry_export_round_trips();
    test_save_by_extension();
    test_async_geometry_tasks();
    test_open_document_imports_exchange_geometry();
#else
    test_occt_required_for_geometry_exchange();
#endif
    test_unsupported_geometry_extension_fails();
    return 0;
}
