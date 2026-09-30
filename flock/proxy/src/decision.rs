//! Routing decision records — borrowed from AstrLink.
//!
//! Every routing selection produces a `RoutingDecision` explaining WHY a
//! provider was chosen and which providers were skipped (and why).

use serde::{Deserialize, Serialize};

/// Maximum number of skipped providers kept on one decision record.
pub const MAX_ROUTING_SKIPS: usize = 64;

/// Why a provider was selected for an attempt.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SelectionReason {
    Priority,
    SessionBinding,
    ResponseAffinity,
    WebsocketConnection,
    Failover,
    ContextDemoted,
}

impl SelectionReason {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Priority => "priority",
            Self::SessionBinding => "session_binding",
            Self::ResponseAffinity => "response_affinity",
            Self::WebsocketConnection => "websocket_connection",
            Self::Failover => "failover",
            Self::ContextDemoted => "context_demoted",
        }
    }
}

/// Why routing excluded a provider before any attempt.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SkipReason {
    Disabled,
    NotConnected,
    RiskPaused,
    ModelNotListed,
    ProtocolUnsupported,
    StreamingUnsupported,
    ConversionUnavailable,
    CircuitOpen,
    RateLimited,
    WebsocketDisabled,
    WebsocketUnsupported,
    ContextTooSmall,
}

impl SkipReason {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Disabled => "disabled",
            Self::NotConnected => "not_connected",
            Self::RiskPaused => "risk_paused",
            Self::ModelNotListed => "model_not_listed",
            Self::ProtocolUnsupported => "protocol_unsupported",
            Self::StreamingUnsupported => "streaming_unsupported",
            Self::ConversionUnavailable => "conversion_unavailable",
            Self::CircuitOpen => "circuit_open",
            Self::RateLimited => "rate_limited",
            Self::WebsocketDisabled => "websocket_disabled",
            Self::WebsocketUnsupported => "websocket_unsupported",
            Self::ContextTooSmall => "context_too_small",
        }
    }
}

/// One provider that routing passed over, and why.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RoutingSkip {
    pub provider: String,
    pub reason: SkipReason,
}

/// Explains the provider choice of one routing decision.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RoutingDecision {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected: Option<SelectionReason>,
    #[serde(default)]
    pub skipped: Vec<RoutingSkip>,
}

impl RoutingDecision {
    pub fn new() -> Self {
        Self { selected: None, skipped: Vec::new() }
    }

    pub fn push_skip(&mut self, provider: impl Into<String>, reason: SkipReason) {
        if self.skipped.len() < MAX_ROUTING_SKIPS {
            self.skipped.push(RoutingSkip { provider: provider.into(), reason });
        }
    }

    pub fn select(&mut self, reason: SelectionReason) {
        self.selected = Some(reason);
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.skipped.len() > MAX_ROUTING_SKIPS {
            return Err(format!("skipped must contain at most {} providers", MAX_ROUTING_SKIPS));
        }
        Ok(())
    }
}

impl Default for RoutingDecision {
    fn default() -> Self { Self::new() }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skips_are_bounded_at_64() {
        let mut d = RoutingDecision::new();
        for i in 0..100 {
            d.push_skip(format!("p{}", i), SkipReason::Disabled);
        }
        assert_eq!(d.skipped.len(), MAX_ROUTING_SKIPS);
        assert!(d.validate().is_ok());
    }

    #[test]
    fn selection_reasons_serialize_snake_case() {
        let mut d = RoutingDecision::new();
        d.select(SelectionReason::SessionBinding);
        d.push_skip("x", SkipReason::CircuitOpen);
        let j = serde_json::to_value(&d).unwrap();
        assert_eq!(j["selected"], "session_binding");
        assert_eq!(j["skipped"][0]["reason"], "circuit_open");
    }
}
