#include "aim3d/offset_generator.hpp"
#include <iostream>

namespace aim3d {

ClipperOffsetGenerator::ClipperOffsetGenerator() {}

std::vector<std::vector<PocketContourPoint>> ClipperOffsetGenerator::generateOffsets(
    const std::vector<PocketContourPoint>& boundary,
    double stepover,
    double toolDiameter
) {
    std::cout << "[aim3d Clipper] Computing 2D tool offsets. Boundary points: " 
              << boundary.size() << ", Stepover: " << stepover 
              << ", Tool Dia: " << toolDiameter << std::endl;

    std::vector<std::vector<PocketContourPoint>> offsets;
    if (boundary.empty()) return offsets;

    // Simulate offsetting by generating a smaller inward loop
    std::vector<PocketContourPoint> loop;
    for (const auto& pt : boundary) {
        // Shift towards a simulated center
        loop.push_back({pt.x * 0.8, pt.y * 0.8});
    }
    offsets.push_back(loop);
    
    std::cout << "[aim3d Clipper] Offset generation complete. Offsets generated: " 
              << offsets.size() << std::endl;
    return offsets;
}

} // namespace aim3d
