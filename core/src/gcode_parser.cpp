#include "aim3d/gcode_parser.hpp"
#include <iostream>
#include <sstream>
#include <vector>
#include <algorithm>
#include <cctype>

namespace aim3d {

GCodeParser::GCodeParser() {}
GCodeParser::~GCodeParser() {}

std::shared_ptr<CanonicalCamIR> GCodeParser::parse(const std::string& gcodeContent) {
    std::cout << "[aim3d RS274 Parser] Starting clean-room reparse of posted G-code..." << std::endl;
    auto ir = std::make_shared<CanonicalCamIR>();

    std::stringstream ss(gcodeContent);
    std::string line;
    
    while (std::getline(ss, line)) {
        // Strip block delete if present at the start
        if (!line.empty() && line[0] == '/') {
            // we skip it entirely based on standard block delete behavior
            continue;
        }

        // Strip comments
        std::string cleanedLine = "";
        bool inComment = false;
        for (char c : line) {
            if (c == ';') {
                break; // rest of line is comment
            } else if (c == '(') {
                inComment = true;
            } else if (c == ')') {
                inComment = false;
                continue; // skip the closing parenthesis itself
            }
            if (!inComment) {
                cleanedLine += c;
            }
        }

        if (cleanedLine.empty()) continue;

        std::stringstream lineStream(cleanedLine);
        std::string word;
        
        MotionCommand cmd;
        switch(m_state.activeModalGroup) {
            case 0: cmd.type = MotionType::Rapid; break;
            case 1: cmd.type = MotionType::StraightFeed; break;
            case 2: cmd.type = MotionType::ArcFeedCW; break;
            case 3: cmd.type = MotionType::ArcFeedCCW; break;
            default: cmd.type = MotionType::Rapid; break;
        }
        cmd.feedRate = m_state.currentFeed;
        cmd.toolId = m_state.activeToolId;
        cmd.x = m_state.currentX;
        cmd.y = m_state.currentY;
        cmd.z = m_state.currentZ;
        cmd.i = 0.0;
        cmd.j = 0.0;
        cmd.k = 0.0;

        bool hasCoords = false;
        bool hasArcCenter = false;
        bool hasFeed = false;
        bool isToolChange = false;

        while (lineStream >> word) {
            if (word.empty()) continue;
            char cmdChar = std::toupper(word[0]);
            std::string valStr = word.substr(1);
            if (valStr.empty()) continue;

            double val = 0.0;
            try {
                val = std::stod(valStr);
            } catch (...) {
                continue;
            }

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
                case 'I':
                    cmd.i = val;
                    hasArcCenter = true;
                    break;
                case 'J':
                    cmd.j = val;
                    hasArcCenter = true;
                    break;
                case 'K':
                    cmd.k = val;
                    hasArcCenter = true;
                    break;
                case 'F':
                    cmd.feedRate = val;
                    m_state.currentFeed = val;
                    hasFeed = true;
                    break;
                case 'T':
                    cmd.toolId = static_cast<int>(val);
                    m_state.activeToolId = static_cast<int>(val);
                    isToolChange = true;
                    cmd.type = MotionType::ToolChange;
                    break;
                case 'M':
                    if (val == 6) {
                        isToolChange = true;
                        cmd.type = MotionType::ToolChange;
                    }
                    break;
                default:
                    break;
            }
        }

        if (hasCoords || hasArcCenter || isToolChange || hasFeed) {
            ir->addCommand(cmd);
        }
    }

    std::cout << "[aim3d RS274 Parser] Parse complete. Total canonical motion elements parsed: " 
              << ir->commands().size() << std::endl;
    return ir;
}

} // namespace aim3d
