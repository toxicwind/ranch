//! `openfang agent set` argument resolution.
//!
//! Two syntaxes set an agent's model:
//!
//! ```text
//! openfang agent set <id> model <value>                  # legacy positional
//! openfang agent set <id> --provider <p> --model <m>      # explicit flags
//! openfang agent set <id> model <value> --provider <p>   # mixed
//! ```
//!
//! [`resolve_agent_set`] is pure (no daemon, no I/O) so the parsing rules —
//! including tricky model IDs like `llama-swap/beellama/exaone-4-0-1-2b-iq4xs`
//! or `qwen:qwen-plus` — are covered by unit tests instead of manual CLI runs.

/// Resolved `agent set` invocation: `(field, value, provider)`.
///
/// `provider` is forwarded to `PUT /api/agents/{id}/model` as `"provider"`;
/// the daemon already accepts it alongside `"model"`.
pub fn resolve_agent_set(
    field: Option<String>,
    value: Option<String>,
    provider: Option<String>,
    model: Option<String>,
) -> Result<(String, String, Option<String>), String> {
    if let Some(m) = model {
        // Explicit --model wins: the field is implicitly "model".
        if m.trim().is_empty() {
            return Err("--model requires a non-empty value".to_string());
        }
        return Ok(("model".to_string(), m, provider));
    }
    match (field, value) {
        (Some(f), Some(v)) => {
            if f != "model" {
                return Err(format!("Unknown field: {f}. Supported fields: model"));
            }
            if v.trim().is_empty() {
                return Err("model value must not be empty".to_string());
            }
            Ok((f, v, provider))
        }
        (Some(f), None) => Err(format!(
            "Missing value for field '{f}'. Usage: openfang agent set <id> {f} <value>              or openfang agent set <id> --model <value> [--provider <p>]"
        )),
        (None, _) => Err(
            "Nothing to set. Usage: openfang agent set <id> model <value> \
             or openfang agent set <id> --model <value> [--provider <p>]"
                .to_string(),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(v: &str) -> Option<String> {
        Some(v.to_string())
    }

    #[test]
    fn flags_provider_and_model() {
        let r = resolve_agent_set(None, None, s("llama-swap"), s("fast"));
        assert_eq!(
            r,
            Ok((
                "model".to_string(),
                "fast".to_string(),
                Some("llama-swap".to_string())
            ))
        );
    }

    #[test]
    fn flags_model_with_tricky_slashed_id_passes_through() {
        // Multi-segment llama-swap model IDs must reach the daemon verbatim;
        // provider splitting happens daemon-side.
        let id = "llama-swap/beellama/exaone-4-0-1-2b-iq4xs";
        let r = resolve_agent_set(None, None, s("llama-swap"), s(id));
        assert_eq!(
            r,
            Ok((
                "model".to_string(),
                id.to_string(),
                Some("llama-swap".to_string())
            ))
        );
    }

    #[test]
    fn flags_model_with_colon_id_passes_through() {
        let r = resolve_agent_set(None, None, s("qwen"), s("qwen:qwen-plus"));
        assert_eq!(
            r,
            Ok((
                "model".to_string(),
                "qwen:qwen-plus".to_string(),
                Some("qwen".to_string())
            ))
        );
    }

    #[test]
    fn flags_model_without_provider() {
        let r = resolve_agent_set(None, None, None, s("gpt-4o"));
        assert_eq!(r, Ok(("model".to_string(), "gpt-4o".to_string(), None)));
    }

    #[test]
    fn legacy_positional_still_works() {
        let r = resolve_agent_set(s("model"), s("gpt-4o"), None, None);
        assert_eq!(r, Ok(("model".to_string(), "gpt-4o".to_string(), None)));
    }

    #[test]
    fn legacy_positional_plus_provider_flag() {
        let r = resolve_agent_set(s("model"), s("fast"), s("llama-swap"), None);
        assert_eq!(
            r,
            Ok((
                "model".to_string(),
                "fast".to_string(),
                Some("llama-swap".to_string())
            ))
        );
    }

    #[test]
    fn unknown_field_rejected() {
        let r = resolve_agent_set(s("bogus"), s("x"), None, None);
        assert!(r.unwrap_err().contains("Unknown field"));
    }

    #[test]
    fn missing_value_rejected() {
        assert!(resolve_agent_set(s("model"), None, None, None).is_err());
        assert!(resolve_agent_set(None, None, None, None).is_err());
        assert!(resolve_agent_set(None, None, s("llama-swap"), s("  ")).is_err());
    }
}
