use sails_rs::prelude::*;
use gstd::{msg, exec};

#[derive(Encode, Decode, TypeInfo, Clone, Debug)]
pub enum DisputeStatus {
    Pending,
    Assigned,
    Resolved,
    Closed,
}

#[derive(Encode, Decode, TypeInfo, Clone, Debug)]
pub struct Dispute {
    pub id: u64,
    pub creator: ActorId,
    pub metadata_cid: String, // IPFS hash of dispute details
    pub arbitrator: Option<ActorId>,
    pub verdict_cid: Option<String>, // IPFS hash of the verdict
    pub status: DisputeStatus,
    pub created_at: u64,
}

pub struct SikizanaService {
    pub disputes: BTreeMap<u64, Dispute>,
    pub dispute_count: u64,
}

impl SikizanaService {
    pub fn new() -> Self {
        Self {
            disputes: BTreeMap::new(),
            dispute_count: 0,
        }
    }
}

#[service]
impl SikizanaService {
    // Command to register a new dispute
    pub fn register_dispute(&mut self, metadata_cid: String) -> u64 {
        let dispute_id = self.dispute_count;
        let dispute = Dispute {
            id: dispute_id,
            creator: msg::source(),
            metadata_cid,
            arbitrator: None,
            verdict_cid: None,
            status: DisputeStatus::Pending,
            created_at: exec::block_timestamp(),
        };

        self.disputes.insert(dispute_id, dispute);
        self.dispute_count += 1;
        dispute_id
    }

    // Command to assign an arbitrator to a dispute
    pub fn assign_arbitrator(&mut self, dispute_id: u64, arbitrator: ActorId) {
        if let Some(dispute) = self.disputes.get_mut(&dispute_id) {
            // Only creator or admin can assign? For now, let's keep it simple
            dispute.arbitrator = Some(arbitrator);
            dispute.status = DisputeStatus::Assigned;
        }
    }

    // Command to post a verdict
    pub fn resolve_dispute(&mut self, dispute_id: u64, verdict_cid: String) {
        if let Some(dispute) = self.disputes.get_mut(&dispute_id) {
            // Only assigned arbitrator can resolve
            if let Some(arbitrator) = dispute.arbitrator {
                if msg::source() == arbitrator {
                    dispute.verdict_cid = Some(verdict_cid);
                    dispute.status = DisputeStatus::Resolved;
                }
            }
        }
    }

    // Queries
    pub fn get_dispute(&self, dispute_id: u64) -> Option<Dispute> {
        self.disputes.get(&dispute_id).cloned()
    }

    pub fn get_all_disputes(&self) -> Vec<Dispute> {
        self.disputes.values().cloned().collect()
    }
}
