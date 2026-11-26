use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::sync::LazyLock;

mod driver;
pub use driver::DriverAppearance;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CharacterChoice {
    pub id: String,
    pub outfit: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub driver_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub identity: Option<CharacterIdentity>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub appearance: Option<CharacterAppearance>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prop: Option<CharacterProp>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wardrobe: Option<WardrobeChoice>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub garments: Option<BTreeMap<String, String>>,
    #[serde(rename = "wardrobeTrial", default, skip_serializing_if = "Option::is_none")]
    pub wardrobe_trial: Option<WardrobeChoice>,
    #[serde(rename = "wardrobeEase", default, skip_serializing_if = "Option::is_none")]
    pub wardrobe_ease: Option<u8>,
    #[serde(rename = "removedClothing", default, skip_serializing_if = "Option::is_none")]
    pub removed_clothing: Option<Vec<WardrobeRemoval>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bra: Option<bool>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum WardrobeRemoval { Top, Corset, Skirt, Shoes, Socks, Hat, Bow, BonnetBow, Harness, Bracer, Dress, Sleeves, Belt, Underskirt, VillageSkirt, OuterSkirt, Coat }

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct WardrobeChoice {
    pub set: String,
    #[serde(deserialize_with = "ShirtLayer::deserialize_legacy")]
    pub shirt: ShirtLayer,
    pub waist: WaistLayer,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cut: Option<WardrobeCut>,
}

impl WardrobeChoice {
    fn has_valid_cut(&self) -> bool {
        self.cut.is_none() || (self.set == "gothic-04" && self.waist == WaistLayer::Over)
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum WardrobeCut { Original }

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ShirtLayer { None, Under, Over }

impl ShirtLayer {
    fn deserialize_legacy<'de, D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Self::deserialize(deserializer).map(|_| Self::None)
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum WaistLayer { Tucked, Over }

#[derive(Deserialize)]
struct WardrobeSet {
    id: String,
    #[serde(default)]
    retired: bool,
    #[serde(rename = "extraDyeFields", default)]
    extra_dye_fields: Vec<String>,
    #[serde(rename = "gameplayColors", default)]
    gameplay_colors: Option<GameplayColors>,
}

#[derive(Deserialize)]
struct GameplayColors { top: String, bottom: String }

pub(crate) static STARTER_STYLES: LazyLock<Vec<serde_json::Value>> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../../../packages/wardrobe-catalog/character-styles.json"))
        .expect("valid starter character styles")
});

static WARDROBE: LazyLock<Vec<WardrobeSet>> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../../../packages/wardrobe-catalog/character-wardrobe.json"))
        .expect("the built-in wardrobe catalog is valid")
});

#[derive(Deserialize)]
struct Garment {
    id: String,
    slot: String,
    piece: String,
    #[serde(default)]
    retired: bool,
}

static GARMENTS: LazyLock<Vec<Garment>> = LazyLock::new(|| {
    let mut garments: Vec<Garment> = serde_json::from_str(include_str!("../../../packages/wardrobe-catalog/character-garments.json"))
        .expect("the built-in garment catalog is valid");
    let village: Vec<Garment> = serde_json::from_str(include_str!("../../../packages/wardrobe-catalog/character-village-pieces.json"))
        .expect("the Village garment catalog is valid");
    garments.extend(village);
    let discovered: Vec<Garment> = serde_json::from_str(include_str!("../../../packages/wardrobe-catalog/discovered-wardrobe-garments.json"))
        .expect("the generated garment catalog is valid");
    garments.extend(discovered);
    garments
});

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CharacterIdentity {
    Male,
    Female,
    Nonbinary,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum CharacterProp { ShopBag }

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
enum BraStyle {
    PushUp,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
enum BriefsStyle {
    Briefs,
    BoxerBriefs,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CharacterAppearance {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    item_colors: Option<std::collections::BTreeMap<String, ClothingColors>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    personality: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    animation_fit: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    bra_style: Option<BraStyle>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    briefs_style: Option<BriefsStyle>,
    hair: String,
    hair_color: String,
    skin: String,
    headwear: String,
    color: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    accent: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    eye_color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    brow_color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    glasses: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    tattoo: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    makeup: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    eyeshadow: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    eyeliner: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    face_shape: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    hair_palette: Option<HairPalette>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct HairPalette {
    base: String,
    roots: String,
    highlights: String,
    tips: String,
    highlight_strength: serde_json::Number,
    tip_blend: serde_json::Number,
}

impl HairPalette {
    fn is_valid(&self) -> bool {
        [&self.base, &self.roots, &self.highlights, &self.tips].into_iter().all(|value| hex_color(value))
            && [&self.highlight_strength, &self.tip_blend].into_iter()
                .all(|value| value.as_f64().is_some_and(|value| (0.0..=1.0).contains(&value)))
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ClothingColors {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    accent: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    panel: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    lining: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    hardware: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    laces: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    closure: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    finish: Option<FabricFinish>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
enum FabricFinish {
    Original,
    Matte,
    Satin,
    Glossy,
}

#[derive(Deserialize)]
struct ClothingPiece { id: String }
static CLOTHING_PIECES: LazyLock<Vec<ClothingPiece>> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../../../packages/wardrobe-catalog/character-clothing-pieces.json")).expect("valid clothing pieces")
});

#[derive(Deserialize)]
struct Character {
    id: String,
    outfits: Vec<Outfit>,
}

#[derive(Deserialize)]
struct Outfit {
    id: String,
    #[serde(default)]
    color: Option<String>,
    #[serde(default)]
    jacket: Option<String>,
}

static APPEARANCES: LazyLock<std::collections::HashMap<String, Vec<Outfit>>> =
    LazyLock::new(|| {
        serde_json::from_str(include_str!("../../../packages/wardrobe-catalog/character-appearance.json"))
            .expect("the built-in character appearance catalog is valid")
    });

static CAST: LazyLock<Vec<Character>> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../../../packages/wardrobe-catalog/characters.json"))
        .expect("the built-in character catalog is valid")
});

static FITTED_HAIR: LazyLock<Vec<Outfit>> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../../../packages/wardrobe-catalog/fitted-hair.json"))
        .expect("the fitted hairstyle catalog is valid")
});

static DRIVER_VEHICLES: LazyLock<BTreeMap<String, serde::de::IgnoredAny>> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../../../packages/wardrobe-catalog/vehicle-drivers.json"))
        .expect("the built-in vehicle driver catalog is valid")
});

fn hex_color(value: &str) -> bool {
    value
        .strip_prefix('#')
        .is_some_and(|hex| hex.len() == 6 && hex.bytes().all(|byte| byte.is_ascii_hexdigit()))
}

pub fn builtin_driver(id: &str, gender: &str) -> bool {
    id.rsplit_once('-').is_some_and(|(vehicle, rig)| rig == gender && DRIVER_VEHICLES.contains_key(vehicle))
}

pub fn validate_driver(driver: &crate::social::authoring::Driver) -> Result<(), String> {
    let rig = match driver.gender.as_str() { "female" => "mara-vega", "male" => "jules-okafor", _ => return Err("Choose an available rig.".into()) };
    if !DRIVER_VEHICLES.contains_key(&driver.vehicle) || !hex_color(&driver.color) || !hex_color(&driver.accent)
        || !CAST.iter().any(|c| c.id == rig && c.outfits.iter().any(|o| o.id == driver.outfit)) {
        return Err("Choose an available vehicle, rig outfit and valid colors.".into());
    }
    Ok(())
}

impl CharacterChoice {
    pub fn has_starter_identity(&self, starter: &Self) -> bool {
        self.id == starter.id && self.identity == starter.identity && self.driver_id == starter.driver_id
            && self.outfit == starter.outfit
            && self.appearance.as_ref().and_then(|look| look.personality.as_deref())
                == starter.appearance.as_ref().and_then(|look| look.personality.as_deref())
    }

    pub fn known_driver(&self, drivers: &BTreeMap<String, crate::social::authoring::Driver>) -> bool {
        self.driver_id.as_ref().is_none_or(|id| !id.starts_with("custom-") || drivers.contains_key(id))
    }

    pub fn is_equippable(&self) -> bool {
        self.garments.is_none() && self.wardrobe_trial.is_none() && self.wardrobe_ease.is_none()
            && self.removed_clothing.is_none() && self.bra.is_none() && self.is_available()
    }

    fn has_valid_garments(&self) -> bool {
        let top = self.garments.as_ref().is_some_and(|garments| garments.contains_key("top"));
        let dress = self.garments.as_ref().is_some_and(|garments| garments.contains_key("dress"));
        let skirt = self.garments.as_ref().is_some_and(|garments| garments.contains_key("skirt"));
        let armor = self.garments.as_ref().and_then(|garments| garments.get("top")).is_some_and(|id| {
            GARMENTS.iter().any(|garment| &garment.id == id && garment.piece == "armor")
        });
        if (dress && (top || skirt || self.wardrobe_trial.is_some()))
            || (armor && self.wardrobe_trial.is_some())
        {
            return false;
        }
        if !self.garments.as_ref().is_none_or(|garments| {
            self.id == "mara-vega" && garments.iter().all(|(slot, id)| {
                GARMENTS.iter().any(|garment| !garment.retired && &garment.id == id && &garment.slot == slot)
            })
        }) {
            return false;
        }
        if !self.wardrobe_trial.as_ref().is_none_or(|trial| {
            self.id == "mara-vega" && trial.has_valid_cut() && WARDROBE.iter().any(|set| set.id == trial.set)
        }) {
            return false;
        }
        if !self.removed_clothing.as_ref().is_none_or(|removed| {
            (removed.is_empty() || self.id == "mara-vega")
                && removed.iter().enumerate().all(|(i, slot)| !removed[..i].contains(slot))
        }) {
            return false;
        }
        self.wardrobe_ease.is_none_or(|ease| {
            matches!(ease, 1 | 2) && self.wardrobe_trial.as_ref().or_else(|| {
                self.wardrobe.as_ref().filter(|wardrobe| {
                    WARDROBE.iter().any(|set| !set.retired && set.id == wardrobe.set)
                })
            }).is_some_and(|wardrobe| wardrobe.waist == WaistLayer::Over)
        })
    }

    pub fn is_available(&self) -> bool {
        self.driver_id.as_ref().is_none_or(|driver| {
            let Some((vehicle, gender)) = driver.rsplit_once('-') else { return false; };
            (DRIVER_VEHICLES.contains_key(vehicle) || vehicle.strip_prefix("custom-").is_some_and(|s| s.len() == 32 && s.bytes().all(|c| c.is_ascii_hexdigit())))
                && matches!((gender, self.id.as_str()), ("female", "mara-vega") | ("male", "jules-okafor"))
        }) && CAST.iter().any(|character| {
            character.id == self.id
                && character
                    .outfits
                    .iter()
                    .any(|outfit| outfit.id == self.outfit)
        }) && self.wardrobe.as_ref().is_none_or(|wardrobe| {
            self.id == "mara-vega" && wardrobe.has_valid_cut() && WARDROBE.iter().any(|set| set.id == wardrobe.set)
        }) && (self.bra.is_none() || self.id == "mara-vega") && self.has_valid_garments() && self.appearance.as_ref().is_none_or(|appearance| {
            if (appearance.bra_style.is_some() || appearance.briefs_style.is_some()) && self.id != "mara-vega" {
                return false;
            }
            if !appearance.personality.as_deref().is_none_or(|value| STARTER_STYLES.iter().any(|entry| entry["attitude"] == value))
                || !appearance.animation_fit.as_deref().is_none_or(|value| ["auto", "full", "fitted"].contains(&value)) {
                return false;
            }
            if !appearance.item_colors.as_ref().is_none_or(|items| items.len() <= 128 && items.iter().all(|(key, colors)| {
                let Some((variant, piece)) = key.split_once(':') else { return false; };
                let known_piece = CLOTHING_PIECES.iter().any(|entry| entry.id == piece);
                let wardrobe_set = WARDROBE.iter().find(|set| set.id == variant);
                let known_variant = match piece {
                    "bra" | "briefs" => self.id == "mara-vega" && variant == "underwear",
                    _ => CAST.iter().filter(|entry| entry.id == self.id).any(|entry| entry.outfits.iter().any(|outfit| outfit.id == variant))
                        || (self.id == "mara-vega" && wardrobe_set.is_some())
                        || (self.id == "mara-vega" && GARMENTS.iter().any(|garment| garment.id == variant && garment.piece == piece))
                        || (piece == "glasses" && ["round", "aviator"].contains(&variant))
                        || (piece == "bag" && variant == "shop-bag"),
                };
                let supports = |field: &str| piece == "corset"
                    && wardrobe_set.is_some_and(|set| set.extra_dye_fields.iter().any(|key| key == field));
                known_piece && known_variant && colors.color.as_deref().is_none_or(hex_color) && colors.accent.as_deref().is_none_or(hex_color)
                    && [("panel", &colors.panel), ("hardware", &colors.hardware), ("lining", &colors.lining),
                        ("laces", &colors.laces), ("closure", &colors.closure)].into_iter()
                        .all(|(field, group)| group.as_deref().is_none_or(|color| supports(field) && hex_color(color)))
                    && (colors.finish.is_none() || supports("finish"))
            })) { return false; }
            if !appearance.accent.as_deref().is_none_or(hex_color) || !appearance.hair_palette.as_ref().is_none_or(HairPalette::is_valid) {
                return false;
            }
            [
                ("hair", Some(appearance.hair.as_str())),
                ("hair_color", Some(appearance.hair_color.as_str())),
                ("skin", Some(appearance.skin.as_str())),
                ("headwear", Some(appearance.headwear.as_str())),
                ("color", Some(appearance.color.as_str())),
                ("eye_color", appearance.eye_color.as_deref()),
                ("brow_color", appearance.brow_color.as_deref()),
                ("glasses", appearance.glasses.as_deref()),
                ("tattoo", appearance.tattoo.as_deref()),
                ("makeup", appearance.makeup.as_deref()),
                ("eyeshadow", appearance.eyeshadow.as_deref()),
                ("eyeliner", appearance.eyeliner.as_deref()),
                ("face_shape", appearance.face_shape.as_deref()),
            ]
            .into_iter()
            .all(|(field, value)| value.is_none_or(|value| {
                if field == "face_shape" && self.id != "mara-vega" && value != "original" { return false; }
                (field == "color" && hex_color(value))
                    || (field == "hair" && self.id == "mara-vega" && FITTED_HAIR.iter().any(|style| style.id == value))
                    || APPEARANCES
                        .get(field)
                        .is_some_and(|options| options.iter().any(|option| option.id == value))
            }))
        })
    }
}

#[cfg(test)]
mod wardrobe_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn cosmetics_and_hair_zones_validate_and_round_trip() {
        let palette = json!({"base":"#38261b","roots":"#110f15","highlights":"#b08c43","tips":"#a84c69",
            "highlightStrength":0.42,"tipBlend":0.77});
        for (body, outfit) in [("mara-vega", "dockwear"), ("jules-okafor", "race-crew")] {
            let entry = json!({"id":body,"outfit":outfit,"appearance":{
                "hair":"natural","hair_color":"original","skin":"mahogany","headwear":"none","color":"original",
                "makeup":"black","eyeshadow":"smoke","eyeliner":"cat-eye","hair_palette":palette
            }});
            let saved: CharacterChoice = serde_json::from_value(entry.clone()).unwrap();
            assert!(saved.is_equippable());
            assert_eq!(saved.driver_appearance().unwrap().hair, "#38261b");
            assert_eq!(serde_json::to_value(&saved).unwrap()["appearance"], entry["appearance"]);
            for (field, invalid) in [("eyeshadow", json!("unknown")), ("eyeliner", json!("unknown")), ("makeup", json!("unknown"))] {
                let mut bad = entry.clone();
                bad["appearance"][field] = invalid;
                assert!(!serde_json::from_value::<CharacterChoice>(bad).unwrap().is_equippable());
            }
            for (field, invalid) in [("highlights", json!("yellow")), ("highlightStrength", json!(-0.1)), ("tipBlend", json!(1.1))] {
                let mut bad = entry.clone();
                bad["appearance"]["hair_palette"][field] = invalid;
                assert!(!serde_json::from_value::<CharacterChoice>(bad).unwrap().is_equippable());
            }
        }
    }

    #[test]
    fn fitted_hair_saves_only_on_vespers_rig() {
        let mut value = json!({"id":"mara-vega","outfit":"dockwear","appearance":{
            "hair":"hair-12","hair_color":"original","skin":"original","headwear":"none","color":"original"
        }});
        let equippable = |v| serde_json::from_value::<CharacterChoice>(v).unwrap().is_equippable();
        assert!(equippable(value.clone()));
        value["appearance"]["hair"] = json!("hair-99");
        assert!(!equippable(value.clone()));
        value["id"] = json!("jules-okafor");
        value["outfit"] = json!("night-run");
        value["appearance"]["hair"] = json!("hair-12");
        assert!(!equippable(value.clone()));
        value["appearance"]["hair"] = json!("natural");
        assert!(equippable(value));
    }

    #[test]
    fn alternate_face_round_trips_only_on_vespers_rig() {
        let mut value = json!({"id":"mara-vega","outfit":"dockwear","appearance":{
            "hair":"natural","hair_color":"original","skin":"original","headwear":"none","color":"original",
            "face_shape":"vesper-soft-contour"
        }});
        let saved: CharacterChoice = serde_json::from_value(value.clone()).unwrap();
        assert!(saved.is_equippable());
        assert_eq!(serde_json::to_value(saved).unwrap(), value);
        value["appearance"]["face_shape"] = json!("invalid");
        assert!(!serde_json::from_value::<CharacterChoice>(value.clone()).unwrap().is_equippable());
        value["appearance"]["face_shape"] = json!("vesper-soft-contour");
        value["id"] = json!("jules-okafor");
        value["outfit"] = json!("night-run");
        assert!(!serde_json::from_value::<CharacterChoice>(value).unwrap().is_equippable());
    }

    #[test]
    fn body_tattoo_is_optional_and_only_accepts_catalog_styles() {
        let mut value = json!({"id":"mara-vega","outfit":"dockwear","appearance":{
            "hair":"natural","hair_color":"original","skin":"warm","headwear":"none","color":"original"
        }});
        let legacy: CharacterChoice = serde_json::from_value(value.clone()).unwrap();
        assert!(legacy.is_equippable());
        value["appearance"]["tattoo"] = json!("twin-band");
        let equipped: CharacterChoice = serde_json::from_value(value.clone()).unwrap();
        assert!(equipped.is_equippable());
        assert_eq!(serde_json::to_value(equipped).unwrap()["appearance"]["tattoo"], "twin-band");
        value["appearance"]["tattoo"] = json!("unknown");
        let unknown: CharacterChoice = serde_json::from_value(value).unwrap();
        assert!(!unknown.is_equippable());
    }

    #[test]
    fn roster_choices_match_valid_rigs_and_outfits() {
        let roster: serde_json::Value = serde_json::from_str(
            include_str!("../../../packages/wardrobe-catalog/vehicle-drivers.json")
        ).unwrap();
        for (key, drivers) in roster.as_object().unwrap() {
            for (gender, rig) in [("female","mara-vega"),("male","jules-okafor")] {
                let preset = &drivers[gender];
                let mut choice: CharacterChoice = serde_json::from_value(json!({
                    "id":rig, "outfit":preset["outfit"], "identity":gender, "driver_id":format!("{key}-{gender}"),
                    "appearance":{"hair":"natural","hair_color":"original","skin":"original","headwear":"none",
                        "color":preset["color"],"accent":preset["accent"]}
                })).unwrap();
                assert!(choice.is_equippable(), "{key}-{gender}");
                choice.driver_id = Some(format!("{key}-unknown"));
                assert!(!choice.is_equippable());
            }
        }
    }

    fn choice(wardrobe: serde_json::Value) -> CharacterChoice {
        let outfit = CAST.iter().find(|c| c.id == "mara-vega").unwrap().outfits[0].id.clone();
        serde_json::from_value(json!({"id":"mara-vega", "outfit":outfit, "wardrobe":wardrobe})).unwrap()
    }

    #[test]
    fn optional_bra_round_trips_in_saved_looks() {
        let mut look = choice(serde_json::Value::Null);
        assert!(look.bra.is_none() && look.is_equippable());
        for on in [false, true] {
            look.bra = Some(on);
            let encoded = serde_json::to_value(&look).unwrap();
            assert_eq!(encoded["bra"], json!(on));
            let restored = serde_json::from_value::<CharacterChoice>(encoded).unwrap();
            assert_eq!(restored, look);
            assert!(restored.is_available());
            assert!(!restored.is_equippable());
        }
    }

    #[test]
    fn briefs_styles_round_trip_on_vesper_and_default_with_legacy_looks() {
        let mut value = serde_json::to_value(choice(serde_json::Value::Null)).unwrap();
        value["appearance"] = json!({"hair": "natural", "hair_color": "original", "skin": "original", "headwear": "hat", "color": "original"});
        let legacy: CharacterChoice = serde_json::from_value(value.clone()).unwrap();
        assert!(legacy.is_equippable());
        assert!(serde_json::to_value(legacy).unwrap()["appearance"].get("briefs_style").is_none());
        for style in ["briefs", "boxer-briefs"] {
            value["appearance"]["briefs_style"] = json!(style);
            let look: CharacterChoice = serde_json::from_value(value.clone()).unwrap();
            assert!(look.is_equippable());
            assert_eq!(serde_json::to_value(look).unwrap()["appearance"]["briefs_style"], style);
        }
        let rook = CAST.iter().find(|character| character.id == "jules-okafor").unwrap();
        value["id"] = json!(rook.id);
        value["outfit"] = json!(rook.outfits[0].id);
        assert!(!serde_json::from_value::<CharacterChoice>(value).unwrap().is_available());
    }

    #[test]
    fn wardrobe_round_trips_and_preserves_legacy_profiles() {
        assert!(choice(serde_json::Value::Null).is_available());
        for set in WARDROBE.iter() {
            for shirt in ["none", "under", "over"] {
                for waist in ["tucked", "over"] {
                    let c = choice(json!({"set":set.id,"shirt":shirt,"waist":waist}));
                    assert!(c.is_available());
                    let saved = serde_json::to_value(&c).unwrap();
                    assert_eq!(saved["wardrobe"], json!({"set":set.id,"shirt":"none","waist":waist}));
                    assert_eq!(serde_json::from_value::<CharacterChoice>(saved).unwrap(), c);
                }
            }
        }
    }

    #[test]
    fn wardrobe_rejects_unknown_sets_and_wrong_base_body() {
        assert!(!choice(json!({"set":"../unknown","shirt":"under","waist":"over"})).is_available());
        let mut c = choice(json!({"set":"gothic-01","shirt":"under","waist":"tucked"}));
        let male = CAST.iter().find(|c| c.id == "jules-okafor").unwrap();
        c.id = male.id.clone(); c.outfit = male.outfits[0].id.clone();
        assert!(!c.is_available());
        assert!(serde_json::from_value::<WardrobeChoice>(json!({"set":"gothic-01","shirt":"invisible","waist":"over"})).is_err());
        assert!(serde_json::from_value::<WardrobeChoice>(json!({"set":"gothic-01","shirt":"under","waist":"over","shorts":false})).is_err());
    }

    #[test]
    fn original_underbust_cut_round_trips_only_with_over_fit() {
        let mut value = serde_json::to_value(choice(serde_json::Value::Null)).unwrap();
        value["wardrobeTrial"] = json!({"set":"gothic-04","shirt":"none","waist":"over","cut":"original"});
        let trial: CharacterChoice = serde_json::from_value(value.clone()).unwrap();
        assert!(trial.is_available());
        assert_eq!(serde_json::to_value(&trial).unwrap()["wardrobeTrial"], value["wardrobeTrial"]);

        value["wardrobeTrial"]["waist"] = json!("tucked");
        assert!(!serde_json::from_value::<CharacterChoice>(value.clone()).unwrap().is_available());
        value["wardrobeTrial"]["waist"] = json!("over");
        value["wardrobeTrial"]["set"] = json!("gothic-01");
        assert!(!serde_json::from_value::<CharacterChoice>(value).unwrap().is_available());
    }
    #[test]
    fn piece_colors_personality_and_fit_round_trip_and_validate() {
        let mut value = serde_json::to_value(choice(serde_json::Value::Null)).unwrap();
        value["appearance"] = json!({ "hair":"natural", "hair_color":"original", "skin":"original",
            "headwear":"hat", "color":"original", "personality":"tsundere", "animation_fit":"fitted",
            "item_colors": {"gothic-01:skirt":{"color":"#123aBC","accent":"#abcdef"}, "aviator:glasses":{"color":"#112233"},
                "underwear:bra":{"color":"#445566"}, "underwear:briefs":{"accent":"#778899"},
                "gothic-01:corset":{"color":"#112233","panel":"#443322","laces":"#f1e2d3","hardware":"#ccbbaa","closure":"#998877","finish":"satin"},
                "gothic-02:corset":{"color":"#ad444d","panel":"#4b79a4","laces":"#5f8962","hardware":"#262630","closure":"#ffffff"},
                "gothic-04:corset":{"color":"#ffffff","accent":"#223344","panel":"#005588","lining":"#445533","hardware":"#886644"}} });
        let good: CharacterChoice = serde_json::from_value(value.clone()).unwrap();
        assert!(good.is_available());
        assert_eq!(serde_json::from_value::<CharacterChoice>(serde_json::to_value(&good).unwrap()).unwrap(), good);
        for (field, bad) in [("personality", json!("unknown")), ("animation_fit", json!("invisible")),
            ("item_colors", json!({"gothic-01:skin":{"color":"#112233"}})),
            ("item_colors", json!({"gothic-01:bra":{"color":"#112233"}})),
            ("item_colors", json!({"unknown:skirt":{"color":"#112233"}})),
            ("item_colors", json!({"gothic-01:skirt":{"color":"transparent"}})),
            ("item_colors", json!({"gothic-04:corset":{"panel":"transparent"}})),
            ("item_colors", json!({"gothic-01:corset":{"laces":"transparent"}})),
            ("item_colors", json!({"gothic-01:corset":{"lining":"#112233"}})),
            ("item_colors", json!({"gothic-02:corset":{"closure":"transparent"}})),
            ("item_colors", json!({"gothic-02:skirt":{"closure":"#998877"}})),
            ("item_colors", json!({"gothic-04:corset":{"finish":"glossy"}})),
            ("item_colors", json!({"gothic-01:skirt":{"panel":"#112233"}}))] {
            let mut invalid = value.clone(); invalid["appearance"][field] = bad;
            assert!(!serde_json::from_value::<CharacterChoice>(invalid).unwrap().is_available());
        }
        let mut invalid_finish = value.clone();
        invalid_finish["appearance"]["item_colors"]["gothic-01:corset"]["finish"] = json!("unknown");
        assert!(serde_json::from_value::<CharacterChoice>(invalid_finish).is_err());
        value["appearance"]["item_colors"]["gothic-01:skirt"]["opacity"] = json!(0);
        assert!(serde_json::from_value::<CharacterChoice>(value).is_err());
        let mut male = serde_json::to_value(good).unwrap();
        male["id"] = json!("jules-okafor");
        male["outfit"] = json!("race-crew");
        male["appearance"]["item_colors"] = json!({"underwear:bra":{"color":"#445566"}});
        assert!(!serde_json::from_value::<CharacterChoice>(male).unwrap().is_available());
    }

}
