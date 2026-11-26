export const CHARACTER_PERSONALITIES = [
  { id: "neutral", label: "Neutral", emotes: ["002", "035", "005", "010"] },
  { id: "friendly", label: "Friendly", emotes: ["005", "010", "035", "009"] },
  { id: "playful", label: "Playful", emotes: ["021", "023", "026", "robot-dance"] },
  { id: "shy", label: "Shy", emotes: ["035", "036", "037", "038"] },
  { id: "tsundere", label: "Tsundere", emotes: ["041", "042", "043", "044"] },
  { id: "stoic", label: "Stoic", emotes: ["131", "132", "133", "134"] },
  { id: "elegant", label: "Elegant", emotes: ["113", "114", "115", "116"] },
  { id: "racer", label: "Racer", emotes: ["081", "082", "083", "084"] },
  { id: "mechanic", label: "Mechanic", emotes: ["165", "164", "163", "161"] },
  { id: "scientist", label: "Scientist", emotes: ["157", "158", "159", "160"] },
  { id: "explorer", label: "Explorer", emotes: ["141", "145", "147", "150"] },
  { id: "performer", label: "Performer", emotes: ["121", "122", "126", "128"] },
] as const;
export type CharacterPersonality = typeof CHARACTER_PERSONALITIES[number]["id"];
export type AnimationFit = "auto" | "full" | "fitted";

export function personalityEmoteIds(personality: CharacterPersonality = "friendly") {
  return CHARACTER_PERSONALITIES.find(item => item.id === personality)?.emotes ?? CHARACTER_PERSONALITIES[0].emotes;
}

export function personalityEmote(personality: CharacterPersonality = "friendly", previous?: string, random = Math.random()) {
  const options = personalityEmoteIds(personality).filter(id => id !== previous);
  return options[Math.min(options.length - 1, Math.floor(Math.max(0, random) * options.length))];
}
