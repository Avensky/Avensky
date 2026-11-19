import type {VehicleModelId} from "../../vehicles/tools/vehicleModelPaths";

// Data only: model components are registered under src/vehicles.
export type VehicleRole = "tank" | "dps" | "healer" | "utility";


export type VehicleDefinition = {
  id: VehicleModelId;
  name: string;
  role: VehicleRole;
  description: string;
  stats: {
    armor: number;
    speed: number;
    handling: number;
    support: number;
  };
};

export const vehicleCatalog: VehicleDefinition[] = [
  {
    id: "ae86",
    name: "AE86",
    role: "dps",
    description: "Lightweight, agile sports coupe.",
    stats: { armor: 25, speed: 85, handling: 95, support: 10 },
  },
  {
    id: "brz",
    name: "BRZ",
    role: "dps",
    description: "Lightweight, agile sports coupe.",
    stats: { armor: 25, speed: 85, handling: 95, support: 10 },
  },
  {
    id: "camaro",
    name: "CAMARO",
    role: "dps",
    description: "Muscle-class attack platform.",
    stats: { armor: 35, speed: 80, handling: 70, support: 10 },
  },
  {
    id: "supra",
    name: "Supra",
    role: "dps",
    description: "Balanced lightweight pursuit vehicle.",
    stats: { armor: 25, speed: 85, handling: 90, support: 10 },
  },
  {
    id: "tank",
    name: "TANK",
    role: "tank",
    description: "Heavy frontline armored vehicle.",
    stats: { armor: 100, speed: 25, handling: 20, support: 40 },
  },
  {
    id: "sierra", name: "GMC Sierra 1500 AT4X", role: "tank",
    description: "Armored pickup with a single roof gun and four-wheel suspension.",
    stats: {armor:80,speed:58,handling:52,support:20},
  },
  {
    id: "fortuner", name: "Toyota Fortuner", role: "healer",
    description: "Mechanic SUV with health packs and teammate recovery.",
    stats: {armor:55,speed:59,handling:62,support:95},
  },
  {
    id: "landcruiser", name: "Toyota Land Cruiser", role: "utility",
    description: "Logistics support SUV. Dedicated resupply is in development.",
    stats: {armor:65,speed:55,handling:58,support:75},
  },
  {
    id: "mini", name: "Mini Cooper", role: "dps",
    description: "A compact, front-wheel-drive flanker.",
    stats: {armor:20, speed:78, handling:95, support:10},
  },
  {
    id: "cx30", name: "Mazda CX-30", role: "utility",
    description: "Support SUV with a close-range spray and a temporary dive shield.",
    stats: {armor:45,speed:62,handling:70,support:85},
  },
  {id:"enforcer", name:"Marussia B2 Enforcer", role:"healer", description:"Police field support with a protected approach.",
    stats:{armor:45,speed:82,handling:80,support:80}},
  {id:"interceptor", name:"Police Interceptor", role:"healer", description:"Fast police escort with allied field service.",
    stats:{armor:45,speed:82,handling:80,support:80}},
  {id:"charger70", name:"1970 Charger R/T", role:"dps", description:"Rear-drive muscle for a heavy launch.",
    stats:{armor:45,speed:82,handling:80,support:15}},
  {id:"skyline34", name:"Skyline R34", role:"dps", description:"Pursuit coupe for high-speed intercepts.",
    stats:{armor:45,speed:82,handling:80,support:15}},
  {id:"timecar", name:"Time Machine", role:"dps", description:"Gull-wing pursuit car.",
    stats:{armor:45,speed:82,handling:80,support:15}},
  {id:"hawaii-rescue",name:"USS Hawaii · rescue ship",role:"utility",
    description:"154 m watercraft with buoyancy, rudder and rescue deck assist.",
    stats:{armor:90,speed:18,handling:22,support:95}},
  {id:"louisiana",name:"USS Louisiana · battleship",role:"tank",
    description:"188 m battleship with heavy-displacement buoyancy and slower helm response.",
    stats:{armor:100,speed:14,handling:12,support:55}},
];
