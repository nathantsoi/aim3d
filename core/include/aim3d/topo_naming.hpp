#pragma once

#include <cstddef>
#include <cstdint>
#include <optional>
#include <string>
#include <vector>
#include <unordered_map>

namespace aim3d {

using EntityId = std::uint64_t;

enum class TopologyKind {
    Body,
    Face,
    Edge,
    Vertex,
    Construction
};

enum class TopologyResolutionStatus {
    Resolved,
    Stale,
    Ambiguous
};

struct PersistentToken {
    std::string value;

    bool empty() const { return value.empty(); }
    bool operator==(const PersistentToken& other) const { return value == other.value; }
    bool operator!=(const PersistentToken& other) const { return !(*this == other); }
};

struct BoundingBox;

struct TopologySignature {
    double measure = 0.0;
    double centerX = 0.0;
    double centerY = 0.0;
    double centerZ = 0.0;
    double directionX = 0.0;
    double directionY = 0.0;
    double directionZ = 0.0;
    double minX = 0.0;
    double minY = 0.0;
    double minZ = 0.0;
    double maxX = 0.0;
    double maxY = 0.0;
    double maxZ = 0.0;
};

struct TopologyRecord {
    PersistentToken token;
    TopologyKind kind = TopologyKind::Construction;
    EntityId ownerId = 0;
    std::string featureId;
    std::size_t ordinal = 0;
    TopologySignature signature;
    std::uint64_t generation = 0;
    TopologyResolutionStatus status = TopologyResolutionStatus::Resolved;
};

struct TopologySnapshotRecord {
    std::string token;
    std::string kind;
    EntityId ownerId = 0;
    std::string featureId;
    std::size_t ordinal = 0;
    std::uint64_t generation = 0;
    std::string status;
    TopologySignature signature;
};

std::string topologyKindName(TopologyKind kind);
std::string topologyResolutionStatusName(TopologyResolutionStatus status);

class TopologicalNaming {
public:
    TopologicalNaming();
    ~TopologicalNaming();

    PersistentToken makeBodyToken(EntityId bodyId) const;
    PersistentToken makeSubshapeToken(EntityId bodyId, TopologyKind kind, std::size_t ordinal) const;

    void registerRecord(const TopologyRecord& record);
    void replaceRecordsForOwner(EntityId ownerId, const std::vector<TopologyRecord>& records);
    void rebindOwnerRecords(EntityId ownerId, const std::vector<TopologyRecord>& candidates);
    std::optional<TopologyRecord> resolve(const PersistentToken& token) const;
    std::optional<TopologyRecord> resolve(const std::string& token) const;
    std::vector<TopologyRecord> records() const;
    std::vector<TopologyRecord> recordsForOwner(EntityId ownerId) const;
    std::vector<TopologySnapshotRecord> snapshot() const;
    std::string serializeSnapshot() const;

    void clearMappings();
    size_t activeTokensCount() const;

private:
    std::uint64_t m_generation = 0;
    std::unordered_map<std::string, TopologyRecord> m_records;
};

} // namespace aim3d
