#include "aim3d/topo_naming.hpp"
#include <algorithm>
#include <cmath>
#include <iomanip>
#include <limits>
#include <sstream>

namespace aim3d {

namespace {

double sqr(double value) {
    return value * value;
}

double distance3(double ax, double ay, double az, double bx, double by, double bz) {
    return std::sqrt(sqr(ax - bx) + sqr(ay - by) + sqr(az - bz));
}

double diagonal(const TopologySignature& signature) {
    const double value = distance3(
        signature.minX,
        signature.minY,
        signature.minZ,
        signature.maxX,
        signature.maxY,
        signature.maxZ);
    return std::max(value, 1.0e-9);
}

double signatureDistance(const TopologySignature& a, const TopologySignature& b) {
    const double measureScale = std::max({std::abs(a.measure), std::abs(b.measure), 1.0e-9});
    const double lengthScale = std::max({diagonal(a), diagonal(b), 1.0e-9});
    const double measureScore = std::abs(a.measure - b.measure) / measureScale;
    const double centerScore = distance3(a.centerX, a.centerY, a.centerZ, b.centerX, b.centerY, b.centerZ) / lengthScale;
    const double minScore = distance3(a.minX, a.minY, a.minZ, b.minX, b.minY, b.minZ) / lengthScale;
    const double maxScore = distance3(a.maxX, a.maxY, a.maxZ, b.maxX, b.maxY, b.maxZ) / lengthScale;
    const double directionScore = distance3(
        a.directionX,
        a.directionY,
        a.directionZ,
        b.directionX,
        b.directionY,
        b.directionZ);
    return measureScore + centerScore + (minScore + maxScore) * 0.5 + directionScore * 0.25;
}

bool sameRecordOrder(const TopologyRecord& a, const TopologyRecord& b) {
    if (a.token.value != b.token.value) {
        return a.token.value < b.token.value;
    }
    if (a.generation != b.generation) {
        return a.generation < b.generation;
    }
    return a.ordinal < b.ordinal;
}

} // namespace

TopologicalNaming::TopologicalNaming() {}
TopologicalNaming::~TopologicalNaming() = default;

std::string topologyKindName(TopologyKind kind) {
    switch (kind) {
    case TopologyKind::Body:
        return "body";
    case TopologyKind::Face:
        return "face";
    case TopologyKind::Edge:
        return "edge";
    case TopologyKind::Vertex:
        return "vertex";
    case TopologyKind::Construction:
        return "construction";
    }
    return "topology";
}

std::string topologyResolutionStatusName(TopologyResolutionStatus status) {
    switch (status) {
    case TopologyResolutionStatus::Resolved:
        return "resolved";
    case TopologyResolutionStatus::Stale:
        return "stale";
    case TopologyResolutionStatus::Ambiguous:
        return "ambiguous";
    }
    return "unknown";
}

PersistentToken TopologicalNaming::makeBodyToken(EntityId bodyId) const {
    return {"body:" + std::to_string(bodyId)};
}

PersistentToken TopologicalNaming::makeSubshapeToken(EntityId bodyId, TopologyKind kind, std::size_t ordinal) const {
    return {"body:" + std::to_string(bodyId) + "/" + topologyKindName(kind) + ":" + std::to_string(ordinal)};
}

void TopologicalNaming::registerRecord(const TopologyRecord& record) {
    auto stored = record;
    if (stored.generation == 0) {
        stored.generation = m_generation;
    }
    m_records[stored.token.value] = stored;
}

void TopologicalNaming::replaceRecordsForOwner(EntityId ownerId, const std::vector<TopologyRecord>& records) {
    for (auto it = m_records.begin(); it != m_records.end();) {
        if (it->second.ownerId == ownerId) {
            it = m_records.erase(it);
        } else {
            ++it;
        }
    }

    m_generation++;
    for (const auto& record : records) {
        auto stored = record;
        stored.generation = m_generation;
        stored.status = TopologyResolutionStatus::Resolved;
        m_records[stored.token.value] = stored;
    }
}

void TopologicalNaming::rebindOwnerRecords(EntityId ownerId, const std::vector<TopologyRecord>& candidates) {
    const auto previous = recordsForOwner(ownerId);
    for (auto it = m_records.begin(); it != m_records.end();) {
        if (it->second.ownerId == ownerId) {
            it = m_records.erase(it);
        } else {
            ++it;
        }
    }
    m_generation++;

    std::vector<bool> used(candidates.size(), false);
    for (const auto& oldRecord : previous) {
        std::vector<TopologyRecord> kindMatches;
        std::vector<std::size_t> kindIndexes;
        for (std::size_t i = 0; i < candidates.size(); ++i) {
            const auto& candidate = candidates[i];
            if (!used[i] && candidate.kind == oldRecord.kind) {
                kindMatches.push_back(candidate);
                kindIndexes.push_back(i);
            }
        }

        TopologyRecord rebound = oldRecord;
        rebound.generation = m_generation;

        if (kindMatches.empty()) {
            rebound.status = TopologyResolutionStatus::Stale;
            m_records[rebound.token.value] = rebound;
            continue;
        }

        double bestDistance = std::numeric_limits<double>::max();
        std::size_t bestIndex = 0;
        for (std::size_t i = 0; i < kindMatches.size(); ++i) {
            const double distance = signatureDistance(oldRecord.signature, kindMatches[i].signature);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestIndex = i;
            }
        }
        std::size_t bestMatches = 0;
        for (const auto& candidate : kindMatches) {
            if (std::abs(signatureDistance(oldRecord.signature, candidate.signature) - bestDistance) <= 1.0e-7) {
                bestMatches++;
            }
        }

        if (bestDistance > 0.75) {
            rebound.status = TopologyResolutionStatus::Stale;
        } else if (bestMatches > 1) {
            rebound.status = TopologyResolutionStatus::Ambiguous;
        } else {
            rebound.signature = kindMatches[bestIndex].signature;
            rebound.featureId = kindMatches[bestIndex].featureId;
            rebound.status = TopologyResolutionStatus::Resolved;
            used[kindIndexes[bestIndex]] = true;
        }
        m_records[rebound.token.value] = rebound;
    }

    for (std::size_t i = 0; i < candidates.size(); ++i) {
        if (used[i] || m_records.find(candidates[i].token.value) != m_records.end()) {
            continue;
        }
        auto stored = candidates[i];
        stored.generation = m_generation;
        stored.status = TopologyResolutionStatus::Resolved;
        m_records[stored.token.value] = stored;
    }
}

std::optional<TopologyRecord> TopologicalNaming::resolve(const PersistentToken& token) const {
    return resolve(token.value);
}

std::optional<TopologyRecord> TopologicalNaming::resolve(const std::string& token) const {
    const auto it = m_records.find(token);
    if (it == m_records.end()) {
        return std::nullopt;
    }
    return it->second;
}

std::vector<TopologyRecord> TopologicalNaming::records() const {
    std::vector<TopologyRecord> result;
    result.reserve(m_records.size());
    for (const auto& item : m_records) {
        result.push_back(item.second);
    }
    std::sort(result.begin(), result.end(), sameRecordOrder);
    return result;
}

std::vector<TopologyRecord> TopologicalNaming::recordsForOwner(EntityId ownerId) const {
    std::vector<TopologyRecord> result;
    for (const auto& item : m_records) {
        if (item.second.ownerId == ownerId) {
            result.push_back(item.second);
        }
    }
    std::sort(result.begin(), result.end(), sameRecordOrder);
    return result;
}

std::vector<TopologySnapshotRecord> TopologicalNaming::snapshot() const {
    std::vector<TopologySnapshotRecord> result;
    for (const auto& record : records()) {
        result.push_back({
            record.token.value,
            topologyKindName(record.kind),
            record.ownerId,
            record.featureId,
            record.ordinal,
            record.generation,
            topologyResolutionStatusName(record.status),
            record.signature});
    }
    return result;
}

std::string TopologicalNaming::serializeSnapshot() const {
    std::ostringstream out;
    out << std::setprecision(17);
    for (const auto& record : snapshot()) {
        out << record.token
            << "|kind=" << record.kind
            << "|owner=" << record.ownerId
            << "|feature=" << record.featureId
            << "|ordinal=" << record.ordinal
            << "|generation=" << record.generation
            << "|status=" << record.status
            << "|measure=" << record.signature.measure
            << "|center=" << record.signature.centerX << "," << record.signature.centerY << "," << record.signature.centerZ
            << "|direction=" << record.signature.directionX << "," << record.signature.directionY << "," << record.signature.directionZ
            << "|bounds=" << record.signature.minX << "," << record.signature.minY << "," << record.signature.minZ
            << "," << record.signature.maxX << "," << record.signature.maxY << "," << record.signature.maxZ
            << "\n";
    }
    return out.str();
}

void TopologicalNaming::clearMappings() {
    m_records.clear();
    m_generation++;
}

size_t TopologicalNaming::activeTokensCount() const {
    return m_records.size();
}

} // namespace aim3d
