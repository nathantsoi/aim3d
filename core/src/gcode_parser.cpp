#include "aim3d/gcode_parser.hpp"
#include <iostream>
#include <sstream>
#include <vector>

namespace aim3d {

GCodeParser::GCodeParser() {}
GCodeParser::~GCodeParser() {}

std::shared_ptr<CanonicalCamIR> GCodeParser::parse(const std::string& gcodeContent) {
    std::cout << "[aim3d RS274 Parser] Starting clean-room reparse of posted G-code..." << std::endl;
    auto ir = std::make_shared<CanonicalCamIR>();

    std::stringstream ss(gcodeContent);
    std::string line;
    
    while (std::getline(ss, line)) {
        if (line.empty() || line[0] == ';') continue; // Comment skip

        std::stringstream lineStream(line);
        std::string word;
        
        MotionCommand cmd;
        cmd.type = MotionType::StraightFeed;
        cmd.feedRate = m_state.currentFeed;
        cmd.toolId = m_state.activeToolId;
        cmd.x = m_state.currentX;
        cmd.y = m_state.currentY;
        cmd.z = m_state.currentZ;

        bool hasCoords = false;

        while (lineStream >> word) {
            char cmdChar = word[0];
            std::string valStr = word.substr(1);
            if (valStr.empty()) continue;

            double val = std::stod(valStr);

            switch (cmdChar) {
                case 'G':
                    if (val == 0) {
                        cmd.type = MotionType::Rapid;
                        m_state.activeModalGroup = 0;
                    } else if (val == 1) {
                        cmd.type = MotionType::StraightFeed;
                        m_state.activeModalGroup = 1;
                    } else if (val == 2) {
                        cmd.type = MotionType::ArcFeedCW;
                        m_state.activeModalGroup = 2;
                    } else if (val == 3) {
                        cmd.type = MotionType::ArcFeedCCW;
                        m_state.activeModalGroup = 3;
                    }
                    break;
                case 'X':
                    cmd.x = val;
                    m_state.currentX = val;
                    hasCoords = true;
                    break;
                case 'Y':
                    cmd.y = val;
                    m_state.currentY = val;
                    hasCoords = true;
                    break;
                case 'Z':
                    cmd.z = val;
                    m_state.currentZ = val;
                    hasCoords = true;
                    break;
                case 'F':
                    cmd.feedRate = val;
                    m_state.currentFeed = val;
                    break;
                case 'T':
                    cmd.toolId = static_cast<int>(val);
                    m_state.activeToolId = static_cast<int>(val);
                    cmd.type = MotionType::ToolChange;
                    break;
                default:
                    break;
            }
        }

        if (hasCoords || cmd.type == MotionType::ToolChange) {
            ir->addCommand(cmd);
        }
    }

    std::cout << "[aim3d RS274 Parser] Parse complete. Total canonical motion elements parsed: " 
              << ir->commands().size() << std::endl;
    return ir;
}

} // namespace aim3d
