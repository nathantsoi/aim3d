#include "aim3d/application.hpp"
#include "aim3d/document.hpp"
#include "aim3d/topo_naming.hpp"

#include <atomic>
#include <cassert>
#include <filesystem>
#include <fstream>
#include <stdexcept>
#include <string>
#include <vector>

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
std::string write_box_fixture(const std::string& name, double x = 10.0, double y = 20.0, double z = 30.0) {
    const auto path = test_dir() / name;
    const auto box = BRepPrimAPI_MakeBox(x, y, z).Shape();
    assert(BRepTools::Write(box, path.string().c_str()));
    return path.string();
}
#endif

#if AIM3D_HAS_OCCT
bool contains_text(const std::string& text, const std::string& needle) {
    return text.find(needle) != std::string::npos;
}

aim3d::TopologyRecord min_x_face_record(const aim3d::TopologicalNaming& topology, aim3d::EntityId bodyId) {
    std::vector<aim3d::TopologyRecord> faces;
    for (const auto& record : topology.recordsForOwner(bodyId)) {
        if (record.kind == aim3d::TopologyKind::Face && record.status == aim3d::TopologyResolutionStatus::Resolved) {
            faces.push_back(record);
        }
    }
    assert(!faces.empty());
    auto best = faces[0];
    for (const auto& face : faces) {
        if (face.signature.centerX < best.signature.centerX) {
            best = face;
        }
    }
    return best;
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

void test_import_registers_topology_records() {
    aim3d::Application app;
    auto doc = app.createDocument();
    auto body = doc->importGeometry(write_box_fixture("topology-box.brep"));
    const auto inspection = body->inspect();
    const auto records = doc->topology().recordsForOwner(body->id());

    assert(records.size() == 1 + inspection.faceCount + inspection.edgeCount + inspection.vertexCount);
    assert(doc->topology().resolve("body:" + std::to_string(body->id())).has_value());

    const auto faceToken = doc->topology().makeSubshapeToken(body->id(), aim3d::TopologyKind::Face, 0);
    const auto resolvedFace = doc->topology().resolve(faceToken);
    assert(resolvedFace.has_value());
    assert(resolvedFace->kind == aim3d::TopologyKind::Face);
    assert(resolvedFace->status == aim3d::TopologyResolutionStatus::Resolved);
}

void test_topology_snapshot_serialization_is_deterministic() {
    aim3d::Application app;
    auto doc = app.createDocument();
    auto body = doc->importGeometry(write_box_fixture("snapshot-box.brep"));

    const auto snapshot = doc->topology().snapshot();
    assert(!snapshot.empty());
    assert(snapshot[0].token == "body:" + std::to_string(body->id()));
    assert(snapshot[0].kind == "body");
    assert(snapshot[0].status == "resolved");

    const auto first = doc->topology().serializeSnapshot();
    const auto second = doc->topology().serializeSnapshot();
    assert(first == second);
    assert(contains_text(first, "|kind=face|"));
    assert(contains_text(first, "|status=resolved|"));
    assert(contains_text(first, "|generation="));
}

void test_equivalent_body_replacement_preserves_tokens() {
    aim3d::Application app;
    auto doc = app.createDocument();
    auto body = doc->importGeometry(write_box_fixture("replace-source.brep"));
    const auto faceToken = doc->topology().makeSubshapeToken(body->id(), aim3d::TopologyKind::Face, 0);
    const auto before = doc->topology().resolve(faceToken);
    assert(before.has_value());

    assert(doc->replaceBodyGeometry(body->id(), write_box_fixture("replace-equivalent.brep")));
    const auto after = doc->topology().resolve(faceToken);
    assert(after.has_value());
    assert(after->status == aim3d::TopologyResolutionStatus::Resolved);
    assert(after->token == before->token);
    assert(after->generation > before->generation);
}

void test_split_edit_preserves_unique_face_token() {
    aim3d::Application app;
    auto doc = app.createDocument();
    auto body = doc->importGeometry(write_box_fixture("split-source.brep", 10.0, 20.0, 30.0));
    const auto selectedFace = min_x_face_record(doc->topology(), body->id());

    assert(doc->applySplitEdit(body->id(), 8.0));
    const auto resolved = doc->topology().resolve(selectedFace.token);
    assert(resolved.has_value());
    assert(resolved->status == aim3d::TopologyResolutionStatus::Resolved);
    assert(resolved->generation > selectedFace.generation);
}

void test_offset_edit_preserves_unique_face_token() {
    aim3d::Application app;
    auto doc = app.createDocument();
    auto body = doc->importGeometry(write_box_fixture("offset-source.brep", 10.0, 20.0, 30.0));
    const auto selectedFace = min_x_face_record(doc->topology(), body->id());

    assert(doc->applyOffsetEdit(body->id(), 0.1));
    const auto resolved = doc->topology().resolve(selectedFace.token);
    assert(resolved.has_value());
    assert(resolved->status == aim3d::TopologyResolutionStatus::Resolved);
    assert(resolved->generation > selectedFace.generation);
}

void test_history_recompute_applies_topology_edit_features() {
    aim3d::Application app;
    auto doc = app.createDocument();
    auto body = doc->importGeometry(write_box_fixture("history-edit-source.brep", 10.0, 20.0, 30.0));
    const auto selectedFace = min_x_face_record(doc->topology(), body->id());
    const auto splitFeature = doc->addSplitEditFeature(body->id(), 9.0);
    assert(doc->history().addSelection(splitFeature, selectedFace.token.value));

    assert(doc->recomputeHistory());
    assert(doc->history().features()[0].isDirty == false);
    assert(doc->history().updateFeature(splitFeature, 8.0));
    assert(doc->history().features()[0].isDirty == true);
    assert(doc->recomputeHistory());

    const auto features = doc->history().features();
    assert(features.size() == 1);
    assert(!features[0].isDirty);
    assert(features[0].selectedTopologyTokens.size() == 1);
    const auto resolved = doc->topology().resolve(selectedFace.token);
    assert(resolved.has_value());
    assert(resolved->status == aim3d::TopologyResolutionStatus::Resolved);
    assert(resolved->featureId == splitFeature);
}

void test_dimension_edit_preserves_unique_face_tokens() {
    aim3d::Application app;
    auto doc = app.createDocument();
    auto body = doc->importGeometry(write_box_fixture("dimension-source.brep", 10.0, 20.0, 30.0));
    const auto faceToken = doc->topology().makeSubshapeToken(body->id(), aim3d::TopologyKind::Face, 0);

    assert(doc->replaceBodyGeometry(body->id(), write_box_fixture("dimension-edited.brep", 10.0, 25.0, 30.0)));
    const auto resolvedFace = doc->topology().resolve(faceToken);
    assert(resolvedFace.has_value());
    assert(resolvedFace->status == aim3d::TopologyResolutionStatus::Resolved);
}

void test_documents_have_independent_topology_databases() {
    aim3d::Application app;
    auto first = app.createDocument();
    auto second = app.createDocument();
    auto firstBody = first->importGeometry(write_box_fixture("first-doc-box.brep", 10.0, 20.0, 30.0));
    auto secondBody = second->importGeometry(write_box_fixture("second-doc-box.brep", 3.0, 4.0, 5.0));

    const auto firstToken = first->topology().makeSubshapeToken(firstBody->id(), aim3d::TopologyKind::Face, 0);
    const auto secondToken = second->topology().makeSubshapeToken(secondBody->id(), aim3d::TopologyKind::Face, 0);
    assert(firstToken.value == secondToken.value);

    const auto firstFace = first->topology().resolve(firstToken);
    const auto secondFace = second->topology().resolve(secondToken);
    assert(firstFace.has_value());
    assert(secondFace.has_value());
    assert(firstFace->ownerId == firstBody->id());
    assert(secondFace->ownerId == secondBody->id());
    assert(firstFace->signature.measure != secondFace->signature.measure);
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

void test_topology_rebind_reports_structured_stale_and_ambiguous_states() {
    aim3d::TopologicalNaming naming;

    aim3d::TopologyRecord oldRecord;
    oldRecord.token = naming.makeSubshapeToken(7, aim3d::TopologyKind::Face, 0);
    oldRecord.kind = aim3d::TopologyKind::Face;
    oldRecord.ownerId = 7;
    oldRecord.ordinal = 0;
    oldRecord.signature.measure = 10.0;
    naming.replaceRecordsForOwner(7, {oldRecord});

    aim3d::TopologyRecord staleCandidate = oldRecord;
    staleCandidate.token = naming.makeSubshapeToken(7, aim3d::TopologyKind::Face, 1);
    staleCandidate.ordinal = 1;
    staleCandidate.signature.measure = 500.0;
    naming.rebindOwnerRecords(7, {staleCandidate});

    const auto stale = naming.resolve(oldRecord.token);
    assert(stale.has_value());
    assert(stale->status == aim3d::TopologyResolutionStatus::Stale);

    aim3d::TopologicalNaming ambiguousNaming;
    aim3d::TopologyRecord ambiguousOld = oldRecord;
    ambiguousOld.ownerId = 8;
    ambiguousOld.token = ambiguousNaming.makeSubshapeToken(8, aim3d::TopologyKind::Face, 0);
    ambiguousNaming.replaceRecordsForOwner(8, {ambiguousOld});

    aim3d::TopologyRecord firstCandidate = ambiguousOld;
    firstCandidate.ownerId = 8;
    firstCandidate.token = ambiguousNaming.makeSubshapeToken(8, aim3d::TopologyKind::Face, 1);
    firstCandidate.ordinal = 1;

    aim3d::TopologyRecord secondCandidate = firstCandidate;
    secondCandidate.token = ambiguousNaming.makeSubshapeToken(8, aim3d::TopologyKind::Face, 2);
    secondCandidate.ordinal = 2;

    ambiguousNaming.rebindOwnerRecords(8, {firstCandidate, secondCandidate});
    const auto ambiguous = ambiguousNaming.resolve(ambiguousOld.token);
    assert(ambiguous.has_value());
    assert(ambiguous->status == aim3d::TopologyResolutionStatus::Ambiguous);
}

void test_history_tree_tracks_selections_and_downstream_dirty_state() {
    aim3d::HistoryTree history;
    const auto sketch = history.addFeature("Sketch", 1.0);
    const auto extrude = history.addFeature("Extrude", 10.0);

    assert(history.addSelection(extrude, "body:2/face:0"));
    assert(history.recomputeAll());
    auto cleanFeatures = history.features();
    assert(!cleanFeatures[0].isDirty);
    assert(!cleanFeatures[1].isDirty);
    assert(cleanFeatures[1].selectedTopologyTokens.size() == 1);

    assert(history.updateFeature(sketch, 2.0));
    const auto dirtyFeatures = history.features();
    assert(dirtyFeatures[0].isDirty);
    assert(dirtyFeatures[1].isDirty);
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
    test_import_registers_topology_records();
    test_topology_snapshot_serialization_is_deterministic();
    test_equivalent_body_replacement_preserves_tokens();
    test_split_edit_preserves_unique_face_token();
    test_offset_edit_preserves_unique_face_token();
    test_history_recompute_applies_topology_edit_features();
    test_dimension_edit_preserves_unique_face_tokens();
    test_documents_have_independent_topology_databases();
#else
    test_occt_required_for_geometry_exchange();
#endif
    test_unsupported_geometry_extension_fails();
    test_topology_rebind_reports_structured_stale_and_ambiguous_states();
    test_history_tree_tracks_selections_and_downstream_dirty_state();
    return 0;
}
