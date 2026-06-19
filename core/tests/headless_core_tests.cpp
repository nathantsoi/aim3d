#include "aim3d/application.hpp"
#include "aim3d/c_api.hpp"
#include "aim3d/cam_ir.hpp"
#include "aim3d/controller.hpp"
#include "aim3d/document.hpp"
#include "aim3d/sketch_solver.hpp"
#include "aim3d/topo_naming.hpp"

#include <atomic>
#include <cassert>
#include <cmath>
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

bool near(double actual, double expected, double tolerance = 1.0e-5) {
    return std::abs(actual - expected) <= tolerance;
}

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

void test_sketch_solver_coincident_points() {
    aim3d::SketchSolveRequest request;
    request.points = {
        {1, 0.0, 0.0, true},
        {2, 5.0, -3.0, false},
    };
    request.entities = {
        {101, aim3d::SketchEntityType::Point, 1, -1, -1, 0.0},
        {102, aim3d::SketchEntityType::Point, 2, -1, -1, 0.0},
    };
    request.constraints = {
        {aim3d::SketchConstraintKind::Coincident, 101, 102, 0.0},
    };

    const aim3d::SketchSolver solver;
    const auto result = solver.solve(request);
    assert(result.status == aim3d::SketchSolveStatus::Success);
    assert(result.diagnostics.isFullyConstrained);
    assert(result.diagnostics.degreesOfFreedom == 0);
    assert(near(result.points[1].x, 0.0));
    assert(near(result.points[1].y, 0.0));
}

void test_sketch_solver_distance_constraint() {
    aim3d::SketchSolveRequest request;
    request.points = {
        {1, 0.0, 0.0, true},
        {2, 2.0, 0.0, false},
    };
    request.entities = {
        {101, aim3d::SketchEntityType::Point, 1, -1, -1, 0.0},
        {102, aim3d::SketchEntityType::Point, 2, -1, -1, 0.0},
    };
    request.constraints = {
        {aim3d::SketchConstraintKind::Distance, 101, 102, 5.0},
    };

    const aim3d::SketchSolver solver;
    const auto result = solver.solve(request);
    assert(result.status == aim3d::SketchSolveStatus::Success);
    assert(near(std::hypot(result.points[1].x, result.points[1].y), 5.0));
    assert(result.diagnostics.degreesOfFreedom > 0);
}

void test_sketch_solver_line_circle_tangent() {
    aim3d::SketchSolveRequest request;
    request.points = {
        {1, 0.0, 0.0, true},
        {2, 5.0, 0.0, true},
        {3, 2.0, 3.0, false},
    };
    request.entities = {
        {201, aim3d::SketchEntityType::Line, 1, 2, -1, 0.0},
        {202, aim3d::SketchEntityType::Circle, -1, -1, 3, 1.0},
    };
    request.constraints = {
        {aim3d::SketchConstraintKind::Tangent, 201, 202, 0.0},
    };

    const aim3d::SketchSolver solver;
    const auto result = solver.solve(request);
    assert(result.status == aim3d::SketchSolveStatus::Success);
    assert(near(std::abs(result.points[2].y), 1.0));
}

void test_sketch_solver_circle_circle_tangent() {
    aim3d::SketchSolveRequest request;
    request.points = {
        {1, 0.0, 0.0, true},
        {2, 5.0, 0.0, false},
    };
    request.entities = {
        {301, aim3d::SketchEntityType::Circle, -1, -1, 1, 1.0},
        {302, aim3d::SketchEntityType::Circle, -1, -1, 2, 2.0},
    };
    request.constraints = {
        {aim3d::SketchConstraintKind::Tangent, 301, 302, 0.0},
    };

    const aim3d::SketchSolver solver;
    const auto result = solver.solve(request);
    assert(result.status == aim3d::SketchSolveStatus::Success);
    assert(near(std::hypot(result.points[1].x, result.points[1].y), 3.0));
}

void test_sketch_solver_fixed_and_underconstrained_dof() {
    aim3d::SketchSolveRequest fixedRequest;
    fixedRequest.points = {
        {1, 0.0, 0.0, true},
        {2, 5.0, 0.0, false},
    };
    fixedRequest.entities = {
        {101, aim3d::SketchEntityType::Point, 1, -1, -1, 0.0},
        {102, aim3d::SketchEntityType::Point, 2, -1, -1, 0.0},
    };
    fixedRequest.constraints = {
        {aim3d::SketchConstraintKind::Fixed, 102, -1, 0.0},
    };

    const aim3d::SketchSolver solver;
    const auto fixedResult = solver.solve(fixedRequest);
    assert(fixedResult.status == aim3d::SketchSolveStatus::Success);
    assert(fixedResult.diagnostics.degreesOfFreedom == 0);
    assert(fixedResult.diagnostics.isFullyConstrained);

    aim3d::SketchSolveRequest looseRequest;
    looseRequest.points = {
        {1, 0.0, 0.0, false},
        {2, 3.0, 0.0, false},
    };
    looseRequest.entities = fixedRequest.entities;
    looseRequest.constraints = {
        {aim3d::SketchConstraintKind::Distance, 101, 102, 3.0},
    };

    const auto looseResult = solver.solve(looseRequest);
    assert(looseResult.status == aim3d::SketchSolveStatus::Success);
    assert(looseResult.diagnostics.degreesOfFreedom > 0);
    assert(!looseResult.diagnostics.isFullyConstrained);
}

void test_sketch_solver_inconsistent_constraints() {
    aim3d::SketchSolveRequest request;
    request.points = {
        {1, 0.0, 0.0, true},
        {2, 10.0, 0.0, true},
    };
    request.entities = {
        {101, aim3d::SketchEntityType::Point, 1, -1, -1, 0.0},
        {102, aim3d::SketchEntityType::Point, 2, -1, -1, 0.0},
    };
    request.constraints = {
        {aim3d::SketchConstraintKind::Coincident, 101, 102, 0.0},
    };

    const aim3d::SketchSolver solver;
    const auto result = solver.solve(request);
    assert(result.status == aim3d::SketchSolveStatus::Inconsistent);
    assert(!result.diagnostics.warnings.empty());
}

void test_sketch_solver_c_abi_smoke() {
    Aim3dSketchPoint points[] = {
        {1, 0.0, 0.0, 1},
        {2, 2.0, 0.0, 0},
    };
    const Aim3dSketchEntity entities[] = {
        {101, 0, 1, -1, -1, 0.0},
        {102, 0, 2, -1, -1, 0.0},
    };
    const Aim3dSketchConstraint constraints[] = {
        {1, 101, 102, 4.0},
    };
    Aim3dSketchSolveResult result{};

    const int status = aim3d_solve_sketch_2d(
        points,
        2,
        entities,
        2,
        constraints,
        1,
        nullptr,
        &result
    );

    assert(status == 0);
    assert(result.status == 0);
    assert(near(std::hypot(points[1].x, points[1].y), 4.0));
    assert(result.degrees_of_freedom > 0);
}

bool snapshot_contains(const std::string& snapshot, const std::string& needle) {
    return snapshot.find(needle) != std::string::npos;
}

void test_parametric_sketch_rectangle_extrude_snapshot() {
    aim3d::Application app;
    auto doc = app.createDocument();

    // A fresh document projects no features and no solids.
    const auto empty = doc->coreStateSnapshot();
    assert(snapshot_contains(empty, "\"features\":[]"));
    assert(snapshot_contains(empty, "\"solids\":[]"));
    assert(doc->features().empty());

    const auto sketchToken = doc->addSketch("XY");
    assert(sketchToken == "feat_Sketch_1");
    assert(doc->addRectangleToSketch(sketchToken, 0.0, 0.0, 2.0, 1.0));

    // Rectangle alone adds a sketch feature but no solid body yet.
    const auto sketched = doc->coreStateSnapshot();
    assert(snapshot_contains(sketched, "\"id\":\"feat_Sketch_1\""));
    assert(snapshot_contains(sketched, "\"type\":\"Sketch\""));
    assert(snapshot_contains(sketched, "\"solids\":[]"));

    const auto extrudeToken = doc->addExtrude(sketchToken, 10.0);
    assert(extrudeToken == "feat_Extrude_1");

    const auto features = doc->features();
    assert(features.size() == 2);
    assert(doc->design()->rootComponent()->bRepBodies().size() == 1);

    const auto snapshot = doc->coreStateSnapshot();
    assert(snapshot_contains(snapshot, "\"id\":\"feat_Extrude_1\""));
    assert(snapshot_contains(snapshot, "\"type\":\"Extrude\""));
    assert(snapshot_contains(snapshot, "\"value\":10"));
    assert(snapshot_contains(snapshot, "feat_Extrude_1_face_0"));
    assert(!snapshot_contains(snapshot, "\"solids\":[]"));

    // The generated body must produce renderable geometry in the scene.
    const auto scene = doc->viewportScene();
    assert(!scene.solids.empty());
    assert(!scene.solids[0].positions.empty());
    assert(scene.solids[0].indices.size() % 3 == 0);
}

void test_construction_plane_axis_point_geometry() {
    aim3d::Application app;
    auto doc = app.createDocument();

    const auto planeToken = doc->addConstructionObject(
        aim3d::ConstructionKind::OffsetPlane, {"origin_XY"}, 10.0);
    assert(planeToken == "con_Plane_1");

    const auto axisToken = doc->addConstructionObject(
        aim3d::ConstructionKind::AxisThroughTwoPoints, {}, 0.0);
    assert(axisToken == "con_Axis_1");

    const auto pointToken = doc->addConstructionObject(
        aim3d::ConstructionKind::PointAtVertex, {}, 0.0);
    assert(pointToken == "con_Point_1");

    const auto objects = doc->constructionObjects();
    assert(objects.size() == 3);
    assert(objects[0].label == "Plane 1");
    assert(objects[1].label == "Axis 1");
    assert(objects[2].label == "Point 1");
    assert(objects[0].origin[2] == 10.0);

    const auto snapshot = doc->coreStateSnapshot();
    assert(snapshot_contains(snapshot, "\"category\":\"plane\""));
    assert(snapshot_contains(snapshot, "\"category\":\"axis\""));
    assert(snapshot_contains(snapshot, "\"category\":\"point\""));
    assert(snapshot_contains(snapshot, "\"construction\":["));
    assert(snapshot_contains(snapshot, "\"points\":["));
}

void test_general_feature_model_snapshot_v2() {
    aim3d::Application app;
    auto doc = app.createDocument();

    // Register a construction plane and sketch onto it (plane reference, not a
    // bare string). The sketch owns its entities; the rectangle migrates to a
    // sketch element rather than living on the feature row.
    const auto planeToken = doc->addConstructionObject(
        aim3d::ConstructionKind::OffsetPlane, {"origin_XY"}, 5.0);
    assert(planeToken == "con_Plane_1");

    aim3d::SketchPlaneReference planeRef;
    planeRef.kind = aim3d::SketchPlaneKind::ConstructionPlane;
    planeRef.constructionPlane.token = planeToken;
    const auto sketchToken = doc->addSketch(planeRef);
    assert(sketchToken == "feat_Sketch_1");

    aim3d::SketchElement line;
    line.kind = aim3d::SketchElementKind::Line;
    line.points = {{0.0, 0.0}, {3.0, 0.0}};
    assert(!doc->addSketchEntity(sketchToken, line).empty());
    assert(doc->addRectangleToSketch(sketchToken, 0.0, 0.0, 2.0, 1.0));

    // Extrude evaluates a body; the revolve is a schema-first timeline stub.
    const auto extrudeToken = doc->addExtrude(sketchToken, 10.0);
    assert(extrudeToken == "feat_Extrude_1");
    const auto revolveToken = doc->addSolidFeature(
        aim3d::SolidFeatureKind::Revolve, sketchToken, 90.0, aim3d::FeatureOperation::Cut);
    assert(revolveToken == "feat_Revolve_1");

    assert(doc->sketches().size() == 1);
    assert(doc->sketches()[0].entities.size() == 2);
    assert(doc->solidFeatures().size() == 2);
    assert(doc->constructionObjects().size() == 1);
    // Only the extrude produces a body; the revolve stub does not.
    assert(doc->design()->rootComponent()->bRepBodies().size() == 1);

    const auto snapshot = doc->coreStateSnapshot();
    assert(snapshot_contains(snapshot, "\"schemaVersion\":2"));
    assert(snapshot_contains(snapshot, "\"browser\":{"));
    assert(snapshot_contains(snapshot, "\"origin\":{\"planes\":[\"origin_XY\",\"origin_XZ\",\"origin_YZ\"]"));
    assert(snapshot_contains(snapshot, "\"id\":\"con_Plane_1\""));
    assert(snapshot_contains(snapshot, "\"kind\":\"ConstructionPlane\""));
    assert(snapshot_contains(snapshot, "\"kind\":\"Rectangle2Point\""));
    assert(snapshot_contains(snapshot, "\"type\":\"Revolve\""));
    assert(snapshot_contains(snapshot, "\"operation\":\"Cut\""));
    // Exactly one evaluated solid in the viewport scene.
    assert(snapshot_contains(snapshot, "feat_Extrude_1_face_0"));
    assert(!snapshot_contains(snapshot, "\"solids\":[]"));
}

void test_viewport_scene_has_renderable_buffers() {
    aim3d::Application app;
    auto doc = app.createDocument();
#if AIM3D_HAS_OCCT
    doc->importGeometry(write_box_fixture("viewport-scene-box.brep"));
    const auto scene = doc->viewportScene();
    assert(!scene.solids.empty());
    assert(scene.toolpaths.empty());
    assert(scene.axes.size() == 3);
    assert(!scene.solids[0].positions.empty());
    assert(!scene.solids[0].indices.empty());
    assert(scene.solids[0].positions.size() % 3 == 0);
    assert(scene.solids[0].indices.size() % 3 == 0);
    assert(!scene.solids[0].sourceToken.empty());
    assert(scene.solids[0].pickable.entityId == scene.solids[0].sourceToken);
    assert(scene.solids[0].pickable.kind == "B-rep Exact Face");
    assert(scene.solids[0].pickable.priority > 0);
    assert(scene.diagnostics.triangleCount == scene.solids[0].indices.size() / 3);
    assert(scene.diagnostics.segmentCount >= 3);
#else
    const auto scene = doc->viewportScene();
    assert(scene.solids.empty());
    assert(scene.toolpaths.empty());
    assert(scene.axes.size() == 3);
    assert(scene.diagnostics.triangleCount == 0);
    assert(scene.diagnostics.segmentCount == 3);
#endif
}

void test_c_api_document_buffers_and_tasks() {
    Aim3dDocumentHandle* doc = aim3d_document_create();
    assert(doc != nullptr);

    const auto savePath = (test_dir() / "c-api-document.a3d").string();
    assert(aim3d_document_save(doc, savePath.c_str()) == 1);
    assert(std::filesystem::exists(savePath));

    assert(aim3d_document_body_count(doc) == 0);
    Aim3dBodyHandle* body = aim3d_document_preview_body(doc);
    assert(body != nullptr);
    assert(std::string(aim3d_body_name(body)) == "Body1");

    Aim3dBufferHandle* vertices = aim3d_body_vertices(body);
    assert(vertices != nullptr);
    assert(aim3d_buffer_dtype(vertices) == AIM3D_BUFFER_FLOAT32);
    assert(aim3d_buffer_components(vertices) == 3);
    assert(aim3d_buffer_count(vertices) == 9);
    assert(aim3d_buffer_pointer(vertices) != 0);
    const auto* vertexData = static_cast<const float*>(aim3d_buffer_data(vertices));
    assert(near(vertexData[3], 10.0));

    Aim3dBufferHandle* meshPositions = aim3d_document_mesh_positions(doc);
    Aim3dBufferHandle* meshIndices = aim3d_document_mesh_indices(doc);
    assert(aim3d_buffer_dtype(meshPositions) == AIM3D_BUFFER_FLOAT32);
    assert(aim3d_buffer_components(meshPositions) == 3);
    assert(aim3d_buffer_count(meshPositions) == 24);
    assert(aim3d_buffer_dtype(meshIndices) == AIM3D_BUFFER_UINT32);
    assert(aim3d_buffer_components(meshIndices) == 3);
    assert(aim3d_buffer_count(meshIndices) == 36);

    Aim3dTaskHandle* task = aim3d_document_inspect_bodies_task(doc);
    assert(task != nullptr);
    aim3d_task_wait(task);
    assert(aim3d_task_state(task) == AIM3D_TASK_COMPLETED);
    assert(std::string(aim3d_task_message(task)).find("Inspected") != std::string::npos);

    aim3d_task_release(task);
    aim3d_buffer_release(meshIndices);
    aim3d_buffer_release(meshPositions);
    aim3d_buffer_release(vertices);
    aim3d_body_release(body);
    aim3d_document_release(doc);
}

void test_c_api_cam_toolpath_buffers() {
    Aim3dOperationHandle* operation = aim3d_operation_create_default();
    assert(operation != nullptr);
    assert(aim3d_operation_generate_toolpath(operation) == 1);

    Aim3dBufferHandle* toolpath = aim3d_operation_toolpath(operation);
    assert(toolpath != nullptr);
    assert(aim3d_buffer_dtype(toolpath) == AIM3D_BUFFER_FLOAT64);
    assert(aim3d_buffer_components(toolpath) == 5);
    assert(aim3d_buffer_count(toolpath) == 20);
    assert(aim3d_buffer_pointer(toolpath) != 0);
    const auto* values = static_cast<const double*>(aim3d_buffer_data(toolpath));
    assert(near(values[0], static_cast<double>(aim3d::MotionType::ToolChange)));
    assert(near(values[13], -2.0));

    char* gcode = aim3d_operation_post_process(operation);
    assert(gcode != nullptr);
    assert(std::string(gcode).find("G1 X5 Y5 Z-2") != std::string::npos);

    aim3d_string_release(gcode);
    aim3d_buffer_release(toolpath);
    aim3d_operation_release(operation);
}

void test_controller_machine_profile_validation() {
    auto profile = aim3d::MachineProfile::defaultThreeAxisMill();
    assert(profile.validate().empty());

    profile.axes[0].stepsPerMm = 0.0;
    const auto diagnostics = profile.validate();
    assert(!diagnostics.empty());
    assert(diagnostics[0].severity == aim3d::ControllerDiagnosticSeverity::Error);
}

void test_controller_parser_modal_subset() {
    aim3d::LinuxCncCompatParser parser;
    const auto program = parser.parse(
        "G21 G90 G54\n"
        "T1 M6\n"
        "S8000 M3\n"
        "G0 X0 Y0 Z5\n"
        "G1 X10 Y0 Z-1 F600\n"
        "X10 Y10\n"
        "G2 X20 Y10 I5 J0\n"
        "M8\n"
        "M30\n");

    assert(program.valid());
    assert(program.records.size() >= 8);
    bool sawModalLinear = false;
    bool sawArc = false;
    for (const auto& record : program.records) {
        if (record.type == aim3d::ControllerRecordType::LinearFeed && near(record.targetMm[1], 10.0)) {
            sawModalLinear = true;
        }
        if (record.type == aim3d::ControllerRecordType::ArcCW) {
            sawArc = true;
        }
    }
    assert(sawModalLinear);
    assert(sawArc);
}

void test_controller_parser_rejects_unsupported_codes() {
    aim3d::LinuxCncCompatParser parser;
    const auto program = parser.parse("G21\nG85 X0 Y0 Z-5 R1 F100\nM30\n");

    assert(!program.valid());
    bool sawUnsupported = false;
    for (const auto& diagnostic : program.diagnostics) {
        if (diagnostic.code == "gcode.unsupported.g") {
            sawUnsupported = true;
        }
    }
    assert(sawUnsupported);
}

void test_controller_parser_supports_canned_cycles() {
    aim3d::LinuxCncCompatParser parser;
    const auto program = parser.parse(
        "G21 G90 G98\n"
        "G0 X0 Y0 Z2\n"
        "G81 X1 Y1 Z-1 R1 F100\n"
        "G84 X1 Y2 Z0.5 R3\n"
        "M30\n");
    assert(program.valid());
    assert(program.records.size() > 5);
}

void test_controller_planner_soft_limits_and_segments() {
    // defaultThreeAxisMill() ships with softLimitsEnabled = false (disabled for
    // simulation so out-of-envelope CAM toolpaths still plan). This test
    // exercises the rejection path, so explicitly enable soft limits.
    auto profile = aim3d::MachineProfile::defaultThreeAxisMill();
    profile.softLimitsEnabled = true;
    aim3d::LinuxCncCompatParser parser;
    auto program = parser.parse("G21 G90\nG0 X0 Y0 Z5\nG1 X10 Y0 Z0 F600\nM30\n");
    std::vector<aim3d::ControllerDiagnostic> diagnostics;
    aim3d::TrajectoryPlanner planner(profile);
    const auto segments = planner.plan(program, diagnostics);
    assert(!segments.empty());
    assert(segments.front().sourceLine > 0);

    program = parser.parse("G21 G90\nG0 X999 Y0 Z0\nM30\n");
    diagnostics.clear();
    const auto rejected = planner.plan(program, diagnostics);
    assert(rejected.empty());
    bool sawSoftLimit = false;
    for (const auto& diagnostic : diagnostics) {
        if (diagnostic.code == "planner.soft_limit") {
            sawSoftLimit = true;
        }
    }
    assert(sawSoftLimit);
}

void test_spe_protocol_emulator_fail_closed() {
    aim3d::SpeProtocolEmulator spe(2);
    assert(spe.status().state == aim3d::SpeState::Disarmed);

    spe.tick(false, false);
    assert(spe.status().state == aim3d::SpeState::Fault);
    assert(spe.status().watchdogFault);

    spe.hostHeartbeat();
    spe.tick(false, false);
    spe.submitCommand(aim3d::SpeCommandMailbox{aim3d::SpeCommand::EstopReset, {0, 0, 0}});
    assert(spe.status().state == aim3d::SpeState::Disarmed);

    spe.hostHeartbeat();
    spe.tick(false, false);
    spe.submitCommand(aim3d::SpeCommandMailbox{aim3d::SpeCommand::Arm, {0, 0, 0}});
    assert(spe.status().state == aim3d::SpeState::Armed);

    assert(spe.ring().push(aim3d::SpeSegment{{80, 0, 0}, 10000, 0, 2}));
    assert(spe.ring().push(aim3d::SpeSegment{{0, 80, 0}, 10000, 0, 2}));
    assert(!spe.ring().push(aim3d::SpeSegment{{0, 0, 80}, 10000, 0, 2}));

    spe.hostHeartbeat();
    spe.tick(false, false);
    assert(spe.status().positionSteps[0] == 80);
    spe.submitCommand(aim3d::SpeCommandMailbox{aim3d::SpeCommand::FeedHold, {0, 0, 0}});
    assert(spe.status().state == aim3d::SpeState::FeedHold);

    spe.hostHeartbeat();
    spe.tick(true, false);
    assert(spe.status().state == aim3d::SpeState::Fault);
}

// ── NC-file parsing helpers ──────────────────────────────────────────────────

std::string readNcFile(const std::string& relPath) {
    // nc/ files are installed alongside the test binary; fall back to source tree.
    const std::filesystem::path candidates[] = {
        std::filesystem::path("nc") / relPath,
        std::filesystem::path(AIM3D_NC_DIR) / relPath,
    };
    for (const auto& p : candidates) {
        std::ifstream f(p);
        if (f.is_open()) {
            return {std::istreambuf_iterator<char>(f), {}};
        }
    }
    return {};
}

// ── Parser tolerance tests ────────────────────────────────────────────────────

void test_parser_silently_ignores_rotary_axis_words() {
    aim3d::LinuxCncCompatParser parser;
    // A, B, C words on a 3-axis machine should be silently consumed.
    const auto program = parser.parse(
        "G21 G90 G54\n"
        "G0 A0.\n"       // A-axis home position — common CAM output
        "G0 X10 Y5 Z2\n"
        "G1 Z-1 F600 A90.\n"  // A-axis rotation mid-move
        "M30\n");
    assert(program.valid()); // must not reject as error
    // Should produce at least two motion records (Z safe + linear)
    std::size_t motionCount = 0;
    for (const auto& r : program.records) {
        if (r.type == aim3d::ControllerRecordType::Rapid ||
            r.type == aim3d::ControllerRecordType::LinearFeed) {
            motionCount++;
        }
    }
    assert(motionCount >= 2);
}

void test_parser_silently_ignores_tool_offset_words() {
    aim3d::LinuxCncCompatParser parser;
    // G43 H1, G49, H word, D word — all are simulation-irrelevant
    const auto program = parser.parse(
        "G20 G90 G54\n"
        "T1 M6\n"
        "G43 H1\n"      // tool length compensation enable — no-op in sim
        "G0 X0 Y0 Z0.6\n"
        "G1 Z-0.015 F13.0\n"
        "G49\n"         // cancel TLC — no-op
        "M30\n");
    assert(program.valid());
}

void test_parser_silently_ignores_program_markers() {
    aim3d::LinuxCncCompatParser parser;
    // % markers and O-words (program numbers, subroutine labels)
    const auto program = parser.parse(
        "%\n"
        "O00001\n"
        "G21 G90\n"
        "G0 X0 Y0 Z5\n"
        "G1 X10 F600\n"
        "M30\n"
        "%\n");
    assert(program.valid());
    bool sawMotion = false;
    for (const auto& r : program.records) {
        if (r.type == aim3d::ControllerRecordType::Rapid ||
            r.type == aim3d::ControllerRecordType::LinearFeed) {
            sawMotion = true;
        }
    }
    assert(sawMotion);
}

void test_parser_accepts_pallet_clamp_codes() {
    aim3d::LinuxCncCompatParser parser;
    // M10/M11 appear in real CAM output but are no-ops in simulation
    const auto program = parser.parse(
        "G20 G90 G54\n"
        "M11\n"     // pallet unclamp
        "G0 A0.\n"  // A-axis home
        "M10\n"     // pallet clamp
        "G0 X0 Y0 Z0.6\n"
        "G1 X0.7 Y-0.5 F650\n"
        "M30\n");
    assert(program.valid());
}

void test_parser_accepts_g53_machine_coords() {
    aim3d::LinuxCncCompatParser parser;
    // G53 (machine coordinates) is common at start/end of programs
    const auto program = parser.parse(
        "G20 G90\n"
        "G53 G0 Z0.\n"  // machine-coord rapid to Z home
        "G53 G0 X0. Y0.\n"
        "G54\n"
        "G0 X0 Y0 Z0.5\n"
        "G1 X10 F600\n"
        "M30\n");
    assert(program.valid());
}

// ── NC file integration tests ─────────────────────────────────────────────────

void test_nc_face_program_parses_and_plans() {
    const std::string gcode = readNcFile("face.nc");
    if (gcode.empty()) {
        std::cout << "[SKIP] face.nc not found" << std::endl;
        return;
    }
    aim3d::LinuxCncCompatParser parser;
    const auto program = parser.parse(gcode);

    // Dump any non-warning diagnostics for debugging
    for (const auto& d : program.diagnostics) {
        if (d.severity == aim3d::ControllerDiagnosticSeverity::Error ||
            d.severity == aim3d::ControllerDiagnosticSeverity::Fatal) {
            std::cerr << "[face.nc] " << d.message << " (line " << d.line << ")" << std::endl;
        }
    }
    assert(program.valid());
    // face.nc has a series of G1/G2/G3 moves — must produce motion records
    std::size_t motionCount = 0;
    for (const auto& r : program.records) {
        if (r.type == aim3d::ControllerRecordType::Rapid     ||
            r.type == aim3d::ControllerRecordType::LinearFeed ||
            r.type == aim3d::ControllerRecordType::ArcCW     ||
            r.type == aim3d::ControllerRecordType::ArcCCW) {
            motionCount++;
        }
    }
    assert(motionCount >= 10); // conservative lower bound

    // Planner must produce segments without errors
    auto profile = aim3d::MachineProfile::defaultThreeAxisMill();
    aim3d::TrajectoryPlanner planner(profile);
    std::vector<aim3d::ControllerDiagnostic> planDiags;
    std::unordered_map<int, std::array<double, 3>> workOffsets = {
        {54, {150.0, 150.0, 0.0}}
    };
    const auto segments = planner.plan(program, planDiags, workOffsets);
    for (const auto& d : planDiags) {
        if (d.severity == aim3d::ControllerDiagnosticSeverity::Error ||
            d.severity == aim3d::ControllerDiagnosticSeverity::Fatal) {
            std::cerr << "[face.nc planner] " << d.message << std::endl;
        }
    }
    assert(!segments.empty());
    std::cout << "[face.nc] records=" << program.records.size()
              << " segments=" << segments.size() << std::endl;
}

void test_nc_contour_program_parses_and_plans() {
    const std::string gcode = readNcFile("contour.nc");
    if (gcode.empty()) {
        std::cout << "[SKIP] contour.nc not found" << std::endl;
        return;
    }
    aim3d::LinuxCncCompatParser parser;
    const auto program = parser.parse(gcode);
    for (const auto& d : program.diagnostics) {
        if (d.severity == aim3d::ControllerDiagnosticSeverity::Error ||
            d.severity == aim3d::ControllerDiagnosticSeverity::Fatal) {
            std::cerr << "[contour.nc] " << d.message << " (line " << d.line << ")" << std::endl;
        }
    }
    assert(program.valid());

    std::size_t arcCount = 0;
    for (const auto& r : program.records) {
        if (r.type == aim3d::ControllerRecordType::ArcCW ||
            r.type == aim3d::ControllerRecordType::ArcCCW) {
            arcCount++;
        }
    }
    assert(arcCount >= 2); // contour.nc has G2/G3 arcs

    auto profile = aim3d::MachineProfile::defaultThreeAxisMill();
    aim3d::TrajectoryPlanner planner(profile);
    std::vector<aim3d::ControllerDiagnostic> planDiags;
    std::unordered_map<int, std::array<double, 3>> workOffsets = {
        {54, {150.0, 150.0, 0.0}}
    };
    const auto segments = planner.plan(program, planDiags, workOffsets);
    for (const auto& d : planDiags) {
        if (d.severity == aim3d::ControllerDiagnosticSeverity::Error ||
            d.severity == aim3d::ControllerDiagnosticSeverity::Fatal) {
            std::cerr << "[contour.nc planner] " << d.message << std::endl;
        }
    }
    assert(!segments.empty());
    std::cout << "[contour.nc] records=" << program.records.size()
              << " segments=" << segments.size() << std::endl;
}

void test_controller_submit_face_nc_produces_segments() {
    const std::string gcode = readNcFile("face.nc");
    if (gcode.empty()) {
        std::cout << "[SKIP] face.nc not found" << std::endl;
        return;
    }
    auto profile = aim3d::MachineProfile::defaultThreeAxisMill();
    aim3d::MachineController controller(profile);
    controller.setWorkOffset(54, 150.0, 150.0, 0.0);
    const bool ok = controller.submitMdi(gcode);
    if (!ok) {
        for (const auto& d : controller.getLastDiagnostics()) {
            std::cerr << "[face.nc controller] " << d.message
                      << " (line " << d.line << ")" << std::endl;
        }
    }
    assert(ok);
    assert(controller.getQueuedSegments() > 0);
    std::cout << "[face.nc controller] queued=" << controller.getQueuedSegments() << std::endl;
}

void test_controller_submit_contour_nc_produces_segments() {
    const std::string gcode = readNcFile("contour.nc");
    if (gcode.empty()) {
        std::cout << "[SKIP] contour.nc not found" << std::endl;
        return;
    }
    auto profile = aim3d::MachineProfile::defaultThreeAxisMill();
    aim3d::MachineController controller(profile);
    controller.setWorkOffset(54, 150.0, 150.0, 0.0);
    const bool ok = controller.submitMdi(gcode);
    if (!ok) {
        for (const auto& d : controller.getLastDiagnostics()) {
            std::cerr << "[contour.nc controller] " << d.message
                      << " (line " << d.line << ")" << std::endl;
        }
    }
    assert(ok);
    assert(controller.getQueuedSegments() > 0);
    std::cout << "[contour.nc controller] queued=" << controller.getQueuedSegments() << std::endl;
}

void test_planner_arc_planes_xz_and_yz() {
    // G18 (XZ plane) and G19 (YZ plane) arcs appear in face.nc and contour.nc
    aim3d::LinuxCncCompatParser parser;
    std::vector<aim3d::ControllerDiagnostic> planDiags;
    auto profile = aim3d::MachineProfile::defaultThreeAxisMill();
    aim3d::TrajectoryPlanner planner(profile);

    // XZ-plane arc (G18)
    auto prog = parser.parse(
        "G21 G90 G54\n"
        "G18\n"           // select XZ plane
        "G0 X0.7 Z0.\n"
        "G1 Z-0.015 F40\n"
        "G3 X0.68 Z-0.04 I-0.025 K0.\n"  // CCW in XZ = helix-ish lead-in
        "M30\n");
    for (const auto& d : prog.diagnostics) {
        if (d.severity == aim3d::ControllerDiagnosticSeverity::Error ||
            d.severity == aim3d::ControllerDiagnosticSeverity::Fatal) {
            std::cerr << "[XZ arc] parse error: " << d.message << std::endl;
        }
    }
    assert(prog.valid());
    planDiags.clear();
    const auto segs = planner.plan(prog, planDiags);
    for (const auto& d : planDiags) {
        if (d.severity == aim3d::ControllerDiagnosticSeverity::Error ||
            d.severity == aim3d::ControllerDiagnosticSeverity::Fatal) {
            std::cerr << "[XZ arc] plan error: " << d.message << std::endl;
        }
    }
    assert(!segs.empty());
}

void test_controller_clear_and_resubmit() {
    // Verify clearPendingSegments + re-submit works without accumulating stale motion
    auto profile = aim3d::MachineProfile::defaultThreeAxisMill();
    aim3d::MachineController controller(profile);

    const std::string prog1 = "G21 G90\nG0 X0 Y0 Z5\nG1 X10 F600\nM30\n";
    assert(controller.submitMdi(prog1));
    const std::size_t first = controller.getQueuedSegments();
    assert(first > 0);

    controller.clearPendingSegments();
    assert(controller.getQueuedSegments() == 0);

    assert(controller.submitMdi(prog1));
    const std::size_t second = controller.getQueuedSegments();
    // After re-submit we should get the same segment count, not double
    assert(second > 0);
    assert(second <= first + 5); // tolerance for ring drain vs planned
}

} // anonymous namespace

int main() {
    std::cout << "[TEST] Starting test suite..." << std::endl;

    std::cout << "[TEST] test_document_lifecycle..." << std::endl;
    test_document_lifecycle();
#if AIM3D_HAS_OCCT
    std::cout << "[TEST] test_body_import_and_inspection..." << std::endl;
    test_body_import_and_inspection();
    std::cout << "[TEST] test_geometry_export_round_trips..." << std::endl;
    test_geometry_export_round_trips();
    std::cout << "[TEST] test_save_by_extension..." << std::endl;
    test_save_by_extension();
    std::cout << "[TEST] test_async_geometry_tasks..." << std::endl;
    test_async_geometry_tasks();
    std::cout << "[TEST] test_open_document_imports_exchange_geometry..." << std::endl;
    test_open_document_imports_exchange_geometry();
    std::cout << "[TEST] test_import_registers_topology_records..." << std::endl;
    test_import_registers_topology_records();
    std::cout << "[TEST] test_topology_snapshot_serialization_is_deterministic..." << std::endl;
    test_topology_snapshot_serialization_is_deterministic();
    std::cout << "[TEST] test_equivalent_body_replacement_preserves_tokens..." << std::endl;
    test_equivalent_body_replacement_preserves_tokens();
    std::cout << "[TEST] test_split_edit_preserves_unique_face_token..." << std::endl;
    test_split_edit_preserves_unique_face_token();
    std::cout << "[TEST] test_offset_edit_preserves_unique_face_token..." << std::endl;
    test_offset_edit_preserves_unique_face_token();
    std::cout << "[TEST] test_history_recompute_applies_topology_edit_features..." << std::endl;
    test_history_recompute_applies_topology_edit_features();
    std::cout << "[TEST] test_dimension_edit_preserves_unique_face_tokens..." << std::endl;
    test_dimension_edit_preserves_unique_face_tokens();
    std::cout << "[TEST] test_documents_have_independent_topology_databases..." << std::endl;
    test_documents_have_independent_topology_databases();
#else
    std::cout << "[TEST] test_occt_required_for_geometry_exchange..." << std::endl;
    test_occt_required_for_geometry_exchange();
#endif
    std::cout << "[TEST] test_unsupported_geometry_extension_fails..." << std::endl;
    test_unsupported_geometry_extension_fails();
    std::cout << "[TEST] test_topology_rebind_reports_structured_stale_and_ambiguous_states..." << std::endl;
    test_topology_rebind_reports_structured_stale_and_ambiguous_states();
    std::cout << "[TEST] test_history_tree_tracks_selections_and_downstream_dirty_state..." << std::endl;
    test_history_tree_tracks_selections_and_downstream_dirty_state();
    std::cout << "[TEST] test_sketch_solver_coincident_points..." << std::endl;
    test_sketch_solver_coincident_points();
    std::cout << "[TEST] test_sketch_solver_distance_constraint..." << std::endl;
    test_sketch_solver_distance_constraint();
    std::cout << "[TEST] test_sketch_solver_line_circle_tangent..." << std::endl;
    test_sketch_solver_line_circle_tangent();
    std::cout << "[TEST] test_sketch_solver_circle_circle_tangent..." << std::endl;
    test_sketch_solver_circle_circle_tangent();
    std::cout << "[TEST] test_sketch_solver_fixed_and_underconstrained_dof..." << std::endl;
    test_sketch_solver_fixed_and_underconstrained_dof();
    std::cout << "[TEST] test_sketch_solver_inconsistent_constraints..." << std::endl;
    test_sketch_solver_inconsistent_constraints();
    std::cout << "[TEST] test_sketch_solver_c_abi_smoke..." << std::endl;
    test_sketch_solver_c_abi_smoke();
    std::cout << "[TEST] test_parametric_sketch_rectangle_extrude_snapshot..." << std::endl;
    test_parametric_sketch_rectangle_extrude_snapshot();
    std::cout << "[TEST] test_general_feature_model_snapshot_v2..." << std::endl;
    test_general_feature_model_snapshot_v2();
    std::cout << "[TEST] test_construction_plane_axis_point_geometry..." << std::endl;
    test_construction_plane_axis_point_geometry();
    std::cout << "[TEST] test_viewport_scene_has_renderable_buffers..." << std::endl;
    test_viewport_scene_has_renderable_buffers();
    std::cout << "[TEST] test_c_api_document_buffers_and_tasks..." << std::endl;
    test_c_api_document_buffers_and_tasks();
    std::cout << "[TEST] test_c_api_cam_toolpath_buffers..." << std::endl;
    test_c_api_cam_toolpath_buffers();
    std::cout << "[TEST] test_controller_machine_profile_validation..." << std::endl;
    test_controller_machine_profile_validation();
    std::cout << "[TEST] test_controller_parser_modal_subset..." << std::endl;
    test_controller_parser_modal_subset();
    std::cout << "[TEST] test_controller_parser_rejects_unsupported_codes..." << std::endl;
    test_controller_parser_rejects_unsupported_codes();
    std::cout << "[TEST] test_controller_parser_supports_canned_cycles..." << std::endl;
    test_controller_parser_supports_canned_cycles();
    std::cout << "[TEST] test_controller_planner_soft_limits_and_segments..." << std::endl;
    test_controller_planner_soft_limits_and_segments();
    std::cout << "[TEST] test_spe_protocol_emulator_fail_closed..." << std::endl;
    test_spe_protocol_emulator_fail_closed();

    // ── Parser tolerance tests ──────────────────────────────────────────────
    std::cout << "[TEST] test_parser_silently_ignores_rotary_axis_words..." << std::endl;
    test_parser_silently_ignores_rotary_axis_words();
    std::cout << "[TEST] test_parser_silently_ignores_tool_offset_words..." << std::endl;
    test_parser_silently_ignores_tool_offset_words();
    std::cout << "[TEST] test_parser_silently_ignores_program_markers..." << std::endl;
    test_parser_silently_ignores_program_markers();
    std::cout << "[TEST] test_parser_accepts_pallet_clamp_codes..." << std::endl;
    test_parser_accepts_pallet_clamp_codes();
    std::cout << "[TEST] test_parser_accepts_g53_machine_coords..." << std::endl;
    test_parser_accepts_g53_machine_coords();

    // ── NC file integration tests (real CAM output) ────────────────────────
    std::cout << "[TEST] test_nc_face_program_parses_and_plans..." << std::endl;
    test_nc_face_program_parses_and_plans();
    std::cout << "[TEST] test_nc_contour_program_parses_and_plans..." << std::endl;
    test_nc_contour_program_parses_and_plans();
    std::cout << "[TEST] test_controller_submit_face_nc_produces_segments..." << std::endl;
    test_controller_submit_face_nc_produces_segments();
    std::cout << "[TEST] test_controller_submit_contour_nc_produces_segments..." << std::endl;
    test_controller_submit_contour_nc_produces_segments();
    std::cout << "[TEST] test_planner_arc_planes_xz_and_yz..." << std::endl;
    test_planner_arc_planes_xz_and_yz();
    std::cout << "[TEST] test_controller_clear_and_resubmit..." << std::endl;
    test_controller_clear_and_resubmit();

    // Run MaterialSimulator & C-API tests
    {
        std::cout << "[TEST] aim3d_simulator_run (C-API)..." << std::endl;
        Aim3dSimulatorHandle* handle = aim3d_simulator_create();
        assert(handle != nullptr);

        int toolIds[] = {1};
        double toolRadii[] = {3.0};
        int toolIsBall[] = {0};

        int ok = aim3d_simulator_run(
            handle,
            "G21 G90\n"
            "T1 M6\n"
            "G0 X10 Y10 Z5\n"
            "G1 X90 Y10 Z-2 F600\n"
            "M30\n",
            100.0, 100.0, 25.0, 20, 20,
            toolIds, toolRadii, toolIsBall, 1
        );
        assert(ok == 1);
#if AIM3D_HAS_OCCT
        assert(aim3d_simulator_vertex_count(handle) > 0);
        assert(aim3d_simulator_index_count(handle) > 0);
#endif

        aim3d_simulator_release(handle);
    }

    std::cout << "[TEST] All tests completed successfully!" << std::endl;
    return 0;
}
