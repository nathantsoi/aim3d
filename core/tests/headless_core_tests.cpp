#include "aim3d/application.hpp"
#include "aim3d/document.hpp"

#include <atomic>
#include <cassert>
#include <string>

namespace {

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

    assert(doc->save("/tmp/aim3d-test.a3d"));
    assert(doc->filePath() == "/tmp/aim3d-test.a3d");
    assert(!doc->isDirty());

    assert(app.closeDocument(doc));
    assert(app.activeDocument() == nullptr);
    assert(app.documents().empty());
}

void test_body_import_and_inspection() {
    aim3d::Application app;
    auto doc = app.createDocument();

    const auto initial = doc->inspectBodies();
    assert(initial.size() == 1);
    assert(initial[0].id > 0);

    auto imported = doc->importGeometry("fixture.step");
    assert(imported != nullptr);
    assert(imported->id() > 0);
    assert(imported->id() != initial[0].id);
    assert(doc->isDirty());

    const auto inspected = doc->inspectBodies();
    assert(inspected.size() == 2);
    assert(inspected[1].sourceFormat == aim3d::GeometryFormat::Step);
    assert(inspected[1].shapeType == "STEP");
    assert(inspected[1].vertexCount == 3);
    assert(inspected[1].bounds.maxX == 10.0);
    assert(inspected[1].bounds.maxY == 10.0);
}

void test_async_geometry_tasks() {
    aim3d::Application app;
    auto doc = app.createDocument();
    std::atomic<int> completedEvents{0};

    app.registerEventCallback("GEOMETRY_TASK_COMPLETED", [&](const std::string&, const std::string&) {
        completedEvents++;
    });

    const auto importTask = app.importGeometryAsync(doc, "bracket.iges");
    assert(app.waitForTask(importTask));
    const auto importSnapshot = app.taskSnapshot(importTask);
    assert(importSnapshot.status == aim3d::TaskStatus::Completed);

    const auto inspectTask = app.inspectBodiesAsync(doc);
    assert(app.waitForTask(inspectTask));
    const auto inspectSnapshot = app.taskSnapshot(inspectTask);
    assert(inspectSnapshot.status == aim3d::TaskStatus::Completed);
    assert(completedEvents == 2);
}

}

int main() {
    test_document_lifecycle();
    test_body_import_and_inspection();
    test_async_geometry_tasks();
    return 0;
}
