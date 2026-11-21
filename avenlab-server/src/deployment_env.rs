//! Isolate profile/world persistence between development, test, staging, and live.
use std::{env, ffi::OsStr, path::{Path, PathBuf}};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Deployment {
    Development,
    Test,
    Staging,
    Production,
}

impl Deployment {
    fn parse(value: &str) -> anyhow::Result<Self> {
        match value.trim() {
            "development" => Ok(Self::Development),
            "test" => Ok(Self::Test),
            "staging" => Ok(Self::Staging),
            "production" => Ok(Self::Production),
            _ => anyhow::bail!("Unknown AVENLAB_ENV; use development, test, staging, or production"),
        }
    }

    fn name(self) -> &'static str {
        match self {
            Self::Development => "development",
            Self::Test => "test",
            Self::Staging => "staging",
            Self::Production => "production",
        }
    }
}

fn has_component(path: &Path, component: &str) -> bool {
    path.iter().any(|part| part == OsStr::new(component))
}

fn resolve_social_path(
    deployment: Deployment,
    configured: Option<&Path>,
    manifest: &Path,
) -> anyhow::Result<PathBuf> {
    if let Some(path) = configured {
        anyhow::ensure!(!path.as_os_str().is_empty(), "AVENLAB_SOCIAL_PATH cannot be empty");
        if deployment != Deployment::Development {
            anyhow::ensure!(path.is_absolute(), "AVENLAB_SOCIAL_PATH must be absolute outside development");
        }
        match deployment {
            Deployment::Staging => anyhow::ensure!(
                has_component(path, "staging"),
                "Staging data path must contain a staging/ directory; never point staging at live social.json"
            ),
            Deployment::Test => anyhow::ensure!(
                has_component(path, "test"),
                "Test data path must contain a test/ directory; never point tests at live social.json"
            ),
            Deployment::Production => anyhow::ensure!(
                !has_component(path, "staging") && !has_component(path, "test"),
                "Production must not use staging or test data paths"
            ),
            Deployment::Development => {},
        }
        return Ok(path.to_path_buf());
    }

    match deployment {
        // Preserve the existing local development save location.
        Deployment::Development => Ok(manifest.join("runtime/social.json")),
        Deployment::Test => Ok(manifest.join("runtime/test/social.json")),
        Deployment::Staging | Deployment::Production => anyhow::bail!(
            "AVENLAB_SOCIAL_PATH must be set for {} (use a dedicated persistent volume)",
            deployment.name()
        ),
    }
}

/// Read only server-side environment values. No VITE_* setting controls data access.
pub fn social_data_path() -> anyhow::Result<PathBuf> {
    let deployment = Deployment::parse(
        &env::var("AVENLAB_ENV").unwrap_or_else(|_| "development".to_owned())
    )?;
    let override_path = env::var_os("AVENLAB_SOCIAL_PATH").map(PathBuf::from);
    let path = resolve_social_path(
        deployment,
        override_path.as_deref(),
        Path::new(env!("CARGO_MANIFEST_DIR")),
    )?;
    println!("AvenLab environment={} social_data={}", deployment.name(), path.display());
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    const ROOT: &str = "/home/example/avenlab-server";

    #[test]
    fn dev_preserves_legacy_path_but_test_uses_a_different_directory() {
        let base = Path::new(ROOT);
        assert_eq!(resolve_social_path(Deployment::Development, None, base).unwrap(),
            base.join("runtime/social.json"));
        assert_eq!(resolve_social_path(Deployment::Test, None, base).unwrap(),
            base.join("runtime/test/social.json"));
    }

    #[test]
    fn staging_and_production_require_explicit_persistent_data_paths() {
        for stage in [Deployment::Staging, Deployment::Production] {
            assert!(resolve_social_path(stage, None, Path::new(ROOT)).is_err());
            assert!(resolve_social_path(stage, Some(Path::new("relative/social.json")), Path::new(ROOT)).is_err());
        }
    }

    #[test]
    fn production_and_staging_must_not_share_the_same_data_path() {
        let base = Path::new(ROOT);
        let prod = Path::new("/data/social.json");
        let staging = Path::new("/data/staging/social.json");
        let test = Path::new("/data/test/social.json");
        assert_eq!(resolve_social_path(Deployment::Production, Some(prod), base).unwrap(), prod);
        assert_eq!(resolve_social_path(Deployment::Staging, Some(staging), base).unwrap(), staging);
        assert_eq!(resolve_social_path(Deployment::Test, Some(test), base).unwrap(), test);
        assert!(resolve_social_path(Deployment::Staging, Some(prod), base).is_err());
        assert!(resolve_social_path(Deployment::Test, Some(prod), base).is_err());
        assert!(resolve_social_path(Deployment::Production, Some(staging), base).is_err());
    }

    #[test]
    fn unexpected_environment_is_an_error_instead_of_a_live_fallback() {
        assert_eq!(Deployment::parse("staging").unwrap(), Deployment::Staging);
        assert!(Deployment::parse("stagng").is_err());
    }
}
